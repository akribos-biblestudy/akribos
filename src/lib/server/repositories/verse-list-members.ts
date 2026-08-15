/**
 * Collaboration on a shared verse list: who has been invited, who has accepted, and turning a mailed
 * token into membership.
 *
 * This is deliberately separate from the read-only public share link (`verse_lists.slug`, managed in
 * `verse-lists.ts`): a list can be world-readable through its link and, independently, have a handful
 * of email-invited members who can add verses and comment. Either, both or neither can be on at once.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { users, verseListInvites, verseListMembers, verseLists } from '../db/schema.ts';
import { normalizeEmail } from './users.ts';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingInvite = {
	kind: 'pending';
	id: string;
	email: string;
	invitedAt: Date;
	expiresAt: Date;
};

export type AcceptedMember = {
	kind: 'accepted';
	id: string;
	userId: string;
	name: string;
	email: string;
	joinedAt: Date;
};

export type MemberOverview = PendingInvite | AcceptedMember;

/** Everyone with access to a shared list beyond its owner: accepted members, then pending invites. */
export async function listMembersAndInvites(
	db: Database,
	listId: string
): Promise<MemberOverview[]> {
	const [members, invites] = await Promise.all([
		db
			.select({
				id: verseListMembers.id,
				userId: verseListMembers.userId,
				displayName: users.displayName,
				email: users.email,
				joinedAt: verseListMembers.createdAt
			})
			.from(verseListMembers)
			.innerJoin(users, eq(users.id, verseListMembers.userId))
			.where(eq(verseListMembers.listId, listId)),
		db
			.select({
				id: verseListInvites.id,
				email: verseListInvites.email,
				invitedAt: verseListInvites.createdAt,
				expiresAt: verseListInvites.expiresAt
			})
			.from(verseListInvites)
			.where(
				and(
					eq(verseListInvites.listId, listId),
					isNull(verseListInvites.acceptedAt),
					gt(verseListInvites.expiresAt, new Date())
				)
			)
	]);

	return [
		...members.map((member): AcceptedMember => ({
			kind: 'accepted',
			id: member.id,
			userId: member.userId,
			name: member.displayName ?? member.email,
			email: member.email,
			joinedAt: member.joinedAt
		})),
		...invites.map((invite): PendingInvite => ({
			kind: 'pending',
			id: invite.id,
			email: invite.email,
			invitedAt: invite.invitedAt,
			expiresAt: invite.expiresAt
		}))
	];
}

export type CreateInviteResult =
	{ ok: true; token: string } | { ok: false; reason: 'invalidEmail' | 'isOwner' | 'alreadyMember' };

/**
 * Invites an email address to collaborate on a list.
 *
 * If that address already has an account and is already a member, this is a no-op error rather than a
 * second invite — there is nothing useful to mail them. A repeat invite to a still-pending address
 * simply replaces the old token, the same way turning the public link off and on again mints a fresh
 * slug: only the most recently sent link should work.
 */
export async function createVerseListInvite(
	db: Database,
	listId: string,
	rawEmail: string,
	invitedByUserId: string
): Promise<CreateInviteResult> {
	const email = normalizeEmail(rawEmail);
	if (!email.includes('@') || email.length > 320) return { ok: false, reason: 'invalidEmail' };

	const [list] = await db.select().from(verseLists).where(eq(verseLists.id, listId)).limit(1);

	const [existingUser] = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (list && existingUser && existingUser.id === list.userId) {
		return { ok: false, reason: 'isOwner' };
	}

	if (existingUser) {
		const [membership] = await db
			.select({ id: verseListMembers.id })
			.from(verseListMembers)
			.where(and(eq(verseListMembers.listId, listId), eq(verseListMembers.userId, existingUser.id)))
			.limit(1);
		if (membership) return { ok: false, reason: 'alreadyMember' };
	}

	await db
		.delete(verseListInvites)
		.where(and(eq(verseListInvites.listId, listId), eq(verseListInvites.email, email)));

	const token = randomBytes(32).toString('base64url');
	await db.insert(verseListInvites).values({
		id: createHash('sha256').update(token).digest('hex'),
		listId,
		email,
		invitedByUserId,
		expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS)
	});

	return { ok: true, token };
}

export type InviteInfo = {
	listId: string;
	listTitle: string;
	email: string;
	invitedByName: string;
};

/**
 * Read-only lookup for the invite landing page. Does not consume the token — mail clients and link
 * scanners prefetch links, exactly the reason `peekEmailVerification` exists — so this only decides
 * what the page shows before anyone has clicked anything.
 */
export async function peekVerseListInvite(db: Database, token: string): Promise<InviteInfo | null> {
	const id = createHash('sha256').update(token).digest('hex');

	const [row] = await db
		.select({
			listId: verseListInvites.listId,
			listTitle: verseLists.title,
			email: verseListInvites.email,
			inviterName: users.displayName,
			inviterEmail: users.email
		})
		.from(verseListInvites)
		.innerJoin(verseLists, eq(verseLists.id, verseListInvites.listId))
		.innerJoin(users, eq(users.id, verseListInvites.invitedByUserId))
		.where(
			and(
				eq(verseListInvites.id, id),
				isNull(verseListInvites.acceptedAt),
				gt(verseListInvites.expiresAt, new Date())
			)
		)
		.limit(1);

	if (!row) return null;
	return {
		listId: row.listId,
		listTitle: row.listTitle,
		email: row.email,
		invitedByName: row.inviterName ?? row.inviterEmail
	};
}

export type AcceptInviteResult =
	{ ok: true; listId: string } | { ok: false; reason: 'invalid' | 'emailMismatch' };

/**
 * Consumes an invite token and turns it into membership.
 *
 * The token alone is not treated as sufficient proof of identity: it can end up forwarded or sitting
 * in a shared inbox, so acceptance additionally requires the signed-in account's own email address to
 * match the address the invite was sent to (case-insensitively, same normalisation as everywhere else
 * an email is compared). A mismatch is reported separately from an unknown/expired token so the page
 * can point at "sign in with the right account" rather than "this link is broken".
 */
export async function acceptVerseListInvite(
	db: Database,
	token: string,
	user: { id: string; email: string }
): Promise<AcceptInviteResult> {
	const id = createHash('sha256').update(token).digest('hex');

	const [invite] = await db
		.select()
		.from(verseListInvites)
		.where(
			and(
				eq(verseListInvites.id, id),
				isNull(verseListInvites.acceptedAt),
				gt(verseListInvites.expiresAt, new Date())
			)
		)
		.limit(1);
	if (!invite) return { ok: false, reason: 'invalid' };

	if (normalizeEmail(user.email) !== invite.email) return { ok: false, reason: 'emailMismatch' };

	await db.transaction(async (tx) => {
		await tx
			.update(verseListInvites)
			.set({ acceptedAt: new Date() })
			.where(eq(verseListInvites.id, id));

		await tx
			.insert(verseListMembers)
			.values({ listId: invite.listId, userId: user.id, invitedByUserId: invite.invitedByUserId })
			// Already a member (e.g. accepted a second invite sent before the first was revoked): the
			// invite is still marked used above, nothing else to do.
			.onConflictDoNothing();
	});

	return { ok: true, listId: invite.listId };
}

/** Removes a member from a list. Only ever called after the caller is confirmed to be its owner. */
export async function removeVerseListMember(
	db: Database,
	listId: string,
	memberId: string
): Promise<void> {
	await db
		.delete(verseListMembers)
		.where(and(eq(verseListMembers.id, memberId), eq(verseListMembers.listId, listId)));
}

/** Withdraws a still-pending invite. Owner-only, like `removeVerseListMember`. */
export async function revokeVerseListInvite(
	db: Database,
	listId: string,
	inviteId: string
): Promise<void> {
	await db
		.delete(verseListInvites)
		.where(and(eq(verseListInvites.id, inviteId), eq(verseListInvites.listId, listId)));
}

/** A member removing themselves from a list they do not own. */
export async function leaveVerseList(db: Database, listId: string, userId: string): Promise<void> {
	await db
		.delete(verseListMembers)
		.where(and(eq(verseListMembers.listId, listId), eq(verseListMembers.userId, userId)));
}
