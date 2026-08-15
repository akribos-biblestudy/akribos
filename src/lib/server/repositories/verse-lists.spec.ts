import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { users, verseLists } from '../db/schema.ts';
import { createUser } from './users.ts';
import {
	addVerseToList,
	canDeleteItem,
	createVerseList,
	loadVerseListItems,
	removeVerseFromList
} from './verse-lists.ts';

/**
 * Who may delete a verse-list item: the pure rule from issue #129, tested without a database first
 * (`canDeleteItem`), then exercised end to end through `removeVerseFromList` against a real one.
 */
describe('canDeleteItem', () => {
	it('lets the owner delete any item, regardless of who added it', () => {
		expect(
			canDeleteItem({ addedByUserId: 'someone-else' }, { userId: 'owner', isOwner: true })
		).toBe(true);
	});

	it('lets a collaborator delete only what they themselves added', () => {
		expect(canDeleteItem({ addedByUserId: 'me' }, { userId: 'me', isOwner: false })).toBe(true);
		expect(canDeleteItem({ addedByUserId: 'someone-else' }, { userId: 'me', isOwner: false })).toBe(
			false
		);
	});
});

describe('removeVerseFromList enforces the same rule against the database', () => {
	const db = getDb();
	const createdUserIds: string[] = [];

	async function makeUser(): Promise<string> {
		const email = `verse-list-spec-${randomUUID()}@example.com`;
		const result = await createUser(db, { email, password: 'a-fairly-good-password' });
		if (!result.ok) throw new Error('failed to create test user');
		createdUserIds.push(result.user.id);
		return result.user.id;
	}

	afterAll(async () => {
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		await closeDb();
	});

	it('refuses to remove a verse a collaborator did not add, but the owner can', async () => {
		const ownerId = await makeUser();
		const memberId = await makeUser();
		const list = await createVerseList(db, ownerId, 'Test list');

		// The owner adds one verse, the member adds another.
		await addVerseToList(db, list.id, { book: 43, chapter: 3, verse: 16 }, ownerId);
		await addVerseToList(db, list.id, { book: 1, chapter: 1, verse: 1 }, memberId);

		// The member cannot remove the owner's verse …
		await removeVerseFromList(
			db,
			list.id,
			{ book: 43, chapter: 3, verse: 16 },
			{ userId: memberId, isOwner: false }
		);
		let remaining = await loadVerseListItems(db, list.id, null);
		expect(remaining.map((item) => item.verse)).toEqual(expect.arrayContaining([16, 1]));

		// … but can remove their own.
		await removeVerseFromList(
			db,
			list.id,
			{ book: 1, chapter: 1, verse: 1 },
			{ userId: memberId, isOwner: false }
		);
		remaining = await loadVerseListItems(db, list.id, null);
		expect(remaining.map((item) => item.verse)).toEqual([16]);

		// The owner can remove anything, including a verse they did not add themselves.
		await removeVerseFromList(
			db,
			list.id,
			{ book: 43, chapter: 3, verse: 16 },
			{ userId: ownerId, isOwner: true }
		);
		remaining = await loadVerseListItems(db, list.id, null);
		expect(remaining).toHaveLength(0);

		await db.delete(verseLists).where(eq(verseLists.id, list.id));
	});

	it('records who added each item', async () => {
		const ownerId = await makeUser();
		const list = await createVerseList(db, ownerId, 'Test list');
		await addVerseToList(db, list.id, { book: 43, chapter: 3, verse: 16 }, ownerId);

		const [item] = await loadVerseListItems(db, list.id, null);
		expect(item?.addedByUserId).toBe(ownerId);

		await db.delete(verseLists).where(eq(verseLists.id, list.id));
	});
});
