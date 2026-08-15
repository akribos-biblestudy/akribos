import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { users, verseLists } from '../db/schema.ts';
import { createUser } from './users.ts';
import { addVerseToList, createVerseList, loadVerseListItems } from './verse-lists.ts';
import {
	addComment,
	deleteComment,
	isCommentReactionEmoji,
	loadCommentsForList,
	toggleCommentReaction
} from './verse-list-comments.ts';

describe('isCommentReactionEmoji', () => {
	it('accepts exactly the 8 fixed reactions', () => {
		for (const emoji of ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀']) {
			expect(isCommentReactionEmoji(emoji)).toBe(true);
		}
	});

	it('rejects anything else, including a lookalike or arbitrary text', () => {
		expect(isCommentReactionEmoji('🙂')).toBe(false);
		expect(isCommentReactionEmoji('like')).toBe(false);
		expect(isCommentReactionEmoji('')).toBe(false);
	});
});

/**
 * Comment threads and their reactions, run against a real database: replies nesting under the right
 * parent, the note-html migration's replacement (a comment per row instead of one field per item),
 * who may delete what, and the emoji-reaction toggle.
 */
describe('verse list comments', () => {
	const db = getDb();
	const createdUserIds: string[] = [];
	const createdListIds: string[] = [];

	async function makeUser(): Promise<string> {
		const email = `list-comment-spec-${randomUUID()}@example.com`;
		const result = await createUser(db, { email, password: 'a-fairly-good-password' });
		if (!result.ok) throw new Error('failed to create test user');
		createdUserIds.push(result.user.id);
		return result.user.id;
	}

	async function makeItem(ownerId: string): Promise<{ listId: string; itemId: string }> {
		const list = await createVerseList(db, ownerId, 'Test list');
		createdListIds.push(list.id);
		await addVerseToList(db, list.id, { book: 43, chapter: 3, verse: 16 }, ownerId);
		const [item] = await loadVerseListItems(db, list.id, null);
		return { listId: list.id, itemId: item!.id };
	}

	afterAll(async () => {
		for (const id of createdListIds) {
			await db.delete(verseLists).where(eq(verseLists.id, id));
		}
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		await closeDb();
	});

	it('adds a top-level comment and a reply, nested under its parent', async () => {
		const ownerId = await makeUser();
		const { listId, itemId } = await makeItem(ownerId);

		const root = await addComment(db, listId, {
			itemId,
			parentCommentId: null,
			authorUserId: ownerId,
			html: '<p>Der bekannteste Vers</p>'
		});
		expect(root).not.toBeNull();

		const reply = await addComment(db, listId, {
			itemId,
			parentCommentId: root!.id,
			authorUserId: ownerId,
			html: '<p>Stimmt genau</p>'
		});
		expect(reply).not.toBeNull();

		const threads = await loadCommentsForList(db, listId, ownerId);
		expect(threads[itemId]).toHaveLength(1);
		expect(threads[itemId]![0]!.replies).toHaveLength(1);
		expect(threads[itemId]![0]!.replies[0]!.id).toBe(reply!.id);
	});

	it('adds nothing for an empty body, an item outside the list, or a reply attached across items', async () => {
		const ownerId = await makeUser();
		const { listId, itemId } = await makeItem(ownerId);
		// A second, unrelated list and item: `otherItemId` never belongs to `listId`.
		const { listId: otherListId, itemId: otherItemId } = await makeItem(ownerId);

		expect(
			await addComment(db, listId, {
				itemId,
				parentCommentId: null,
				authorUserId: ownerId,
				html: '   '
			})
		).toBeNull();

		// `otherItemId` is real, but it belongs to `otherListId`, not `listId`.
		expect(
			await addComment(db, listId, {
				itemId: otherItemId,
				parentCommentId: null,
				authorUserId: ownerId,
				html: '<p>Wrong list</p>'
			})
		).toBeNull();

		const root = await addComment(db, listId, {
			itemId,
			parentCommentId: null,
			authorUserId: ownerId,
			html: '<p>Root</p>'
		});
		expect(root).not.toBeNull();

		// A reply naming a real comment id, but claiming a different item than that comment's own, must
		// not be attached either — even though both the item and the parent comment are individually
		// real and even belong to lists the author owns.
		expect(
			await addComment(db, otherListId, {
				itemId: otherItemId,
				parentCommentId: root!.id,
				authorUserId: ownerId,
				html: '<p>Cross-item reply</p>'
			})
		).toBeNull();
	});

	it('lets the author or the list owner delete a comment, but no one else', async () => {
		const ownerId = await makeUser();
		const memberId = await makeUser();
		const strangerId = await makeUser();
		const { listId, itemId } = await makeItem(ownerId);

		const byMember = await addComment(db, listId, {
			itemId,
			parentCommentId: null,
			authorUserId: memberId,
			html: '<p>from a member</p>'
		});

		// A stranger (not the author, not the owner) cannot delete it.
		await deleteComment(db, listId, byMember!.id, { userId: strangerId, isOwner: false });
		expect((await loadCommentsForList(db, listId, ownerId))[itemId]).toHaveLength(1);

		// The owner may delete another member's comment (light moderation).
		await deleteComment(db, listId, byMember!.id, { userId: ownerId, isOwner: true });
		expect((await loadCommentsForList(db, listId, ownerId))[itemId] ?? []).toHaveLength(0);

		// The author may delete their own.
		const byOwner = await addComment(db, listId, {
			itemId,
			parentCommentId: null,
			authorUserId: ownerId,
			html: '<p>from the owner</p>'
		});
		await deleteComment(db, listId, byOwner!.id, { userId: ownerId, isOwner: true });
		expect((await loadCommentsForList(db, listId, ownerId))[itemId] ?? []).toHaveLength(0);
	});

	it('deleting a comment cascades to its replies', async () => {
		const ownerId = await makeUser();
		const { listId, itemId } = await makeItem(ownerId);

		const root = await addComment(db, listId, {
			itemId,
			parentCommentId: null,
			authorUserId: ownerId,
			html: '<p>root</p>'
		});
		await addComment(db, listId, {
			itemId,
			parentCommentId: root!.id,
			authorUserId: ownerId,
			html: '<p>reply</p>'
		});

		await deleteComment(db, listId, root!.id, { userId: ownerId, isOwner: true });
		expect((await loadCommentsForList(db, listId, ownerId))[itemId] ?? []).toHaveLength(0);
	});

	it('toggles a reaction on and off, and is scoped to the given list', async () => {
		const ownerId = await makeUser();
		const reactorId = await makeUser();
		const { listId, itemId } = await makeItem(ownerId);
		const { listId: otherListId } = await makeItem(ownerId);

		const comment = await addComment(db, listId, {
			itemId,
			parentCommentId: null,
			authorUserId: ownerId,
			html: '<p>react to me</p>'
		});

		// A reaction id from a list the caller does not have this comment through is not found.
		expect(await toggleCommentReaction(db, otherListId, comment!.id, reactorId, '👍')).toBe(
			'notFound'
		);

		expect(await toggleCommentReaction(db, listId, comment!.id, reactorId, '👍')).toBe('added');
		let threads = await loadCommentsForList(db, listId, reactorId);
		expect(threads[itemId]![0]!.reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);

		// Reacting again with the same emoji removes it.
		expect(await toggleCommentReaction(db, listId, comment!.id, reactorId, '👍')).toBe('removed');
		threads = await loadCommentsForList(db, listId, reactorId);
		expect(threads[itemId]![0]!.reactions).toEqual([]);
	});
});
