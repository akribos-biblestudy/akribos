import { error, fail, redirect } from '@sveltejs/kit';
import { parseReference } from '$lib/bible/reference';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { resolveColumns } from '$lib/server/columns';
import { logger } from '$lib/server/logger';
import { mailer } from '$lib/server/mail';
import { verseListInviteMail } from '$lib/server/mail/templates';
import { countRecent, recordAttempt } from '$lib/server/auth/rate-limit';
import { listBibles } from '$lib/server/repositories/resources';
import {
	addComment,
	deleteComment,
	isCommentReactionEmoji,
	loadCommentsForList,
	toggleCommentReaction
} from '$lib/server/repositories/verse-list-comments';
import {
	createVerseListInvite,
	leaveVerseList,
	listMembersAndInvites,
	removeVerseListMember,
	revokeVerseListInvite
} from '$lib/server/repositories/verse-list-members';
import {
	addVerseToList,
	canDeleteItem,
	deleteVerseList,
	findListAccess,
	findListOwnerName,
	loadVerseListItems,
	removeVerseFromList,
	renameVerseList,
	setVerseListSharing,
	type VerseListAccess
} from '$lib/server/repositories/verse-lists';

/**
 * A verse list with its items, comment threads and — for shared lists — its members.
 *
 * Every action re-checks access through `findListAccess`, so a list id the caller neither owns nor
 * was invited to is simply not found. Actions that only the owner may perform (renaming, deleting,
 * the public link, managing membership) additionally require `isOwner`.
 */
export async function load({ params, locals, cookies }) {
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(`/lists/${params.id}`)}`);

	const db = getDb();
	const access = await findListAccess(db, params.id, locals.user.id);
	if (!access) error(404, 'Stellensammlung nicht gefunden');

	const bibles = await listBibles(db);
	const primary =
		resolveColumns(cookies, bibles, locals.user.readerColumns)[0] ?? bibles[0]?.id ?? null;

	const [rawItems, comments, allMembers] = await Promise.all([
		loadVerseListItems(db, access.list.id, primary),
		loadCommentsForList(db, access.list.id, locals.user.id),
		listMembersAndInvites(db, access.list.id)
	]);

	// Computed once here rather than re-derived in the page: whether the signed-in reader may remove
	// each item follows the same rule `removeVerse` enforces server-side (see `canDeleteItem`).
	const items = rawItems.map((item) => ({
		...item,
		canDelete: canDeleteItem(item, { userId: locals.user!.id, isOwner: access.isOwner })
	}));

	// Pending invites carry a raw email address that has not accepted anything yet — shown only to the
	// owner who sent them. A fellow (non-owner) member sees who else has joined, but not their address:
	// SvelteKit ships the whole `load` return to the browser, so this has to happen here, not just in
	// what the template chooses to render.
	const members = access.isOwner
		? allMembers
		: allMembers
				.filter((member) => member.kind === 'accepted')
				.map((member) => ({ ...member, email: undefined }));

	return {
		list: {
			id: access.list.id,
			title: access.list.title,
			isPublic: access.list.isPublic,
			slug: access.list.slug,
			ownerName: access.isOwner ? null : await findListOwnerName(db, access.list.userId)
		},
		isOwner: access.isOwner,
		currentUserId: locals.user.id,
		primaryBibleId: primary,
		items,
		comments,
		members,
		title: access.list.title
	};
}

async function collaboratorAccess(
	locals: App.Locals,
	id: string
): Promise<{ db: ReturnType<typeof getDb>; userId: string; access: VerseListAccess }> {
	if (!locals.user) redirect(303, '/login');
	const db = getDb();
	const access = await findListAccess(db, id, locals.user.id);
	if (!access) error(404, 'Stellensammlung nicht gefunden');
	return { db, userId: locals.user.id, access };
}

async function ownerAccess(
	locals: App.Locals,
	id: string
): Promise<{ db: ReturnType<typeof getDb>; userId: string; access: VerseListAccess }> {
	const result = await collaboratorAccess(locals, id);
	if (!result.access.isOwner) error(403, 'Nur der Eigentümer kann das.');
	return result;
}

const MAX_INVITES_PER_15_MIN = 20;

export const actions = {
	rename: async ({ params, request, locals }) => {
		const { db, access } = await ownerAccess(locals, params.id);
		const form = await request.formData();
		await renameVerseList(db, access.list.id, String(form.get('title') ?? ''));
		return { saved: true };
	},

	addVerse: async ({ params, request, locals }) => {
		const { db, userId, access } = await collaboratorAccess(locals, params.id);
		const form = await request.formData();
		const reference = parseReference(String(form.get('reference') ?? ''));

		if (!reference?.verse) return fail(400, { error: 'reference' as const });
		await addVerseToList(
			db,
			access.list.id,
			{ book: reference.book, chapter: reference.chapter, verse: reference.verse },
			userId
		);
		return { saved: true };
	},

	removeVerse: async ({ params, request, locals }) => {
		const { db, userId, access } = await collaboratorAccess(locals, params.id);
		const form = await request.formData();
		const reference = parseReference(String(form.get('reference') ?? ''));
		if (!reference?.verse) return fail(400, { error: 'reference' as const });

		await removeVerseFromList(
			db,
			access.list.id,
			{ book: reference.book, chapter: reference.chapter, verse: reference.verse },
			{ userId, isOwner: access.isOwner }
		);
		return { saved: true };
	},

	share: async ({ params, request, locals }) => {
		const { db, access } = await ownerAccess(locals, params.id);
		const form = await request.formData();
		await setVerseListSharing(db, access.list.id, form.get('isPublic') === 'true');
		return { saved: true };
	},

	delete: async ({ params, locals }) => {
		const { db, access } = await ownerAccess(locals, params.id);
		await deleteVerseList(db, access.list.id);
		redirect(303, '/lists');
	},

	/** Invites a collaborator by email. Owner-only, like every other membership action. */
	inviteMember: async ({ params, request, locals, getClientAddress }) => {
		const { db, access } = await ownerAccess(locals, params.id);
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!locals.user) redirect(303, '/login');

		const address = getClientAddress();
		if ((await countRecent(db, `list-invite:${locals.user.id}`)) >= MAX_INVITES_PER_15_MIN) {
			return fail(429, { inviteError: 'throttled' as const });
		}
		await recordAttempt(db, `list-invite:${locals.user.id}`);
		await recordAttempt(db, `list-invite-ip:${address}`);

		const result = await createVerseListInvite(db, access.list.id, email, locals.user.id);
		if (!result.ok) return fail(400, { inviteError: result.reason });

		const link = new URL(`/invites/${result.token}`, config().ORIGIN).toString();
		try {
			await mailer().send({
				to: email,
				...verseListInviteMail(link, {
					listTitle: access.list.title,
					inviterName: locals.user.displayName ?? locals.user.email
				})
			});
		} catch (err) {
			// The invite still exists and can be resent; a mail failure must not block the invite.
			logger.error({ err }, 'sending the verse-list invite mail failed');
		}

		return { invited: true };
	},

	removeMember: async ({ params, request, locals }) => {
		const { db, access } = await ownerAccess(locals, params.id);
		const form = await request.formData();
		const memberId = String(form.get('memberId') ?? '');
		if (memberId) await removeVerseListMember(db, access.list.id, memberId);
		return { saved: true };
	},

	revokeInvite: async ({ params, request, locals }) => {
		const { db, access } = await ownerAccess(locals, params.id);
		const form = await request.formData();
		const inviteId = String(form.get('inviteId') ?? '');
		if (inviteId) await revokeVerseListInvite(db, access.list.id, inviteId);
		return { saved: true };
	},

	/** A member (not the owner, who cannot abandon their own list this way) leaves a shared list. */
	leaveList: async ({ params, locals }) => {
		const { db, userId, access } = await collaboratorAccess(locals, params.id);
		if (access.isOwner) return fail(400, { error: 'owner' as const });
		await leaveVerseList(db, access.list.id, userId);
		redirect(303, '/lists');
	},

	comment: async ({ params, request, locals }) => {
		const { db, userId, access } = await collaboratorAccess(locals, params.id);
		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '');
		const parentCommentId = String(form.get('parentCommentId') ?? '') || null;
		const html = String(form.get('note') ?? '');
		if (!itemId) return fail(400, { error: 'item' as const });

		await addComment(db, access.list.id, { itemId, parentCommentId, authorUserId: userId, html });
		return { saved: true };
	},

	deleteComment: async ({ params, request, locals }) => {
		const { db, userId, access } = await collaboratorAccess(locals, params.id);
		const form = await request.formData();
		const commentId = String(form.get('commentId') ?? '');
		if (commentId) {
			await deleteComment(db, access.list.id, commentId, { userId, isOwner: access.isOwner });
		}
		return { saved: true };
	},

	react: async ({ params, request, locals }) => {
		const { db, userId, access } = await collaboratorAccess(locals, params.id);
		const form = await request.formData();
		const commentId = String(form.get('commentId') ?? '');
		const emoji = String(form.get('emoji') ?? '');
		if (!commentId || !isCommentReactionEmoji(emoji))
			return fail(400, { error: 'reaction' as const });

		await toggleCommentReaction(db, access.list.id, commentId, userId, emoji);
		return { saved: true };
	}
};
