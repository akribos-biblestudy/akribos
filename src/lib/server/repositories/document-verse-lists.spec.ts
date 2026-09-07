import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, closeDb } from '../db/index';
import { users, verseLists, verseListItems, verseListMembers } from '../db/schema';
import { createDocument, getDocument, changeDocumentKind } from './documents';
import { changeDocumentCollection, listDocumentCollections } from './document-verse-lists';

const db = getDb();
const ownerId = randomUUID();
const strangerId = randomUUID();
async function preparation() {
	return createDocument(db, ownerId, {
		kind: 'sermon',
		title: 'Preparation',
		bodyMarkdown: '',
		bodyHtml: '',
		plainText: ''
	});
}
async function collection(userId = ownerId) {
	const [list] = await db.insert(verseLists).values({ userId, title: randomUUID() }).returning();
	return list!;
}

describe.sequential('preparation collection access and revisions', () => {
	beforeAll(async () => {
		await db
			.insert(users)
			.values(
				[ownerId, strangerId].map((id) => ({
					id,
					email: `${id}@example.com`,
					passwordHash: 'unused'
				}))
			);
	});
	afterAll(async () => {
		await db.delete(users).where(inArray(users.id, [ownerId, strangerId]));
		await closeDb();
	});
	it('links several live collections and removes only the requested link', async () => {
		const doc = await preparation();
		const first = await collection();
		const second = await collection();
		expect(
			await changeDocumentCollection(db, ownerId, doc.id, 1, { action: 'add', listId: first.id })
		).toEqual({ ok: true, revision: 2 });
		expect(
			await changeDocumentCollection(db, ownerId, doc.id, 2, { action: 'add', listId: second.id })
		).toEqual({ ok: true, revision: 3 });
		await db
			.insert(verseListItems)
			.values({
				listId: first.id,
				addedByUserId: ownerId,
				bookId: 43,
				chapter: 3,
				verse: 16,
				position: 0
			});
		const linked = await listDocumentCollections(db, ownerId, doc.id);
		expect(linked).toHaveLength(2);
		expect(linked.find((row) => row.id === first.id)?.verses).toEqual([
			{ book: 43, chapter: 3, verse: 16 }
		]);
		expect(
			await changeDocumentCollection(db, ownerId, doc.id, 3, { action: 'remove', listId: first.id })
		).toEqual({ ok: true, revision: 4 });
		expect((await listDocumentCollections(db, ownerId, doc.id)).map((row) => row.id)).toEqual([
			second.id
		]);
	});
	it('rejects stale revisions, foreign documents and inaccessible collections', async () => {
		const doc = await preparation();
		const foreign = await collection(strangerId);
		expect(
			await changeDocumentCollection(db, strangerId, doc.id, 1, {
				action: 'add',
				listId: foreign.id
			})
		).toEqual({ ok: false, reason: 'notFound' });
		expect(
			await changeDocumentCollection(db, ownerId, doc.id, 1, { action: 'add', listId: foreign.id })
		).toEqual({ ok: false, reason: 'invalidCollection' });
		expect(
			await changeDocumentCollection(db, ownerId, doc.id, 1, {
				action: 'create',
				title: 'Inline collection'
			})
		).toEqual({ ok: true, revision: 2 });
		expect(
			await changeDocumentCollection(db, ownerId, doc.id, 1, {
				action: 'create',
				title: 'Stale collection'
			})
		).toEqual({ ok: false, reason: 'conflict', currentRevision: 2 });
		expect(await listDocumentCollections(db, strangerId, doc.id)).toEqual([]);
		expect(await listDocumentCollections(db, ownerId, doc.id)).toHaveLength(1);
	});
	it('hides shared collection names and verses immediately after membership is revoked', async () => {
		const doc = await preparation();
		const shared = await collection(strangerId);
		await db.insert(verseListMembers).values({ listId: shared.id, userId: ownerId });
		await changeDocumentCollection(db, ownerId, doc.id, 1, { action: 'add', listId: shared.id });
		expect(await listDocumentCollections(db, ownerId, doc.id)).toHaveLength(1);
		await db.delete(verseListMembers).where(eq(verseListMembers.listId, shared.id));
		expect(await listDocumentCollections(db, ownerId, doc.id)).toEqual([]);
	});
	it('preserves dormant links through conversion and removes deleted collections', async () => {
		const doc = await preparation();
		const list = await collection();
		await changeDocumentCollection(db, ownerId, doc.id, 1, { action: 'add', listId: list.id });
		await changeDocumentKind(db, ownerId, doc.id, 2, 'note');
		expect(await listDocumentCollections(db, ownerId, doc.id)).toEqual([]);
		const note = await getDocument(db, ownerId, doc.id);
		await changeDocumentKind(db, ownerId, doc.id, note!.revision, 'sermon');
		expect(await listDocumentCollections(db, ownerId, doc.id)).toHaveLength(1);
		await db.delete(verseLists).where(eq(verseLists.id, list.id));
		expect(await listDocumentCollections(db, ownerId, doc.id)).toEqual([]);
	});
});
