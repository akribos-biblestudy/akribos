import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '$lib/server/db';
import { documents, users } from '$lib/server/db/schema';
import { DEFAULT_SERMON_COLUMNS } from '$lib/notes/sermon-board';
import { changeSermonBoard, getSermonBoard, importSermonColumn } from './sermon-board';
import {
	changeDocumentKind,
	createDocument,
	getDocument,
	softDeleteDocument,
	updateDocument
} from './documents';
import { createUser } from './users';

const db = getDb();
const userIds: string[] = [];
async function account() {
	const result = await createUser(db, {
		email: `board-${randomUUID()}@example.com`,
		password: 'a-fairly-good-password'
	});
	if (!result.ok) throw new Error('account creation failed');
	userIds.push(result.user.id);
	return result.user.id;
}
const body = {
	title: 'Ausarbeitung',
	bodyMarkdown: 'Text',
	bodyHtml: '<p>Text</p>',
	plainText: 'Text',
	kind: 'sermon' as const
};

afterAll(async () => {
	if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
	await closeDb();
});

describe('personal preparation columns', () => {
	it('accepts only complete own column permutations and checks their revision', async () => {
		const owner = await account();
		const original = (await getSermonBoard(db, owner)).columns.map((column) => column.id);
		for (const ids of [
			original.slice(1),
			[...original.slice(1), original[1]!],
			[...original.slice(1), randomUUID()]
		]) {
			expect(await changeSermonBoard(db, owner, 1, { action: 'sort', ids })).toEqual({
				ok: false,
				reason: 'columnOrder'
			});
		}
		const reordered = [...original].reverse();
		expect(await changeSermonBoard(db, owner, 1, { action: 'sort', ids: reordered })).toMatchObject(
			{ ok: true, revision: 2 }
		);
		expect((await getSermonBoard(db, owner)).columns.map((column) => column.id)).toEqual(reordered);
		expect(await changeSermonBoard(db, owner, 1, { action: 'sort', ids: original })).toEqual({
			ok: false,
			reason: 'boardConflict'
		});
	});
	it('starts with existing columns, persists names/order and rejects stale or foreign changes', async () => {
		const owner = await account();
		const stranger = await account();
		expect(await getSermonBoard(db, owner)).toEqual({
			columns: DEFAULT_SERMON_COLUMNS,
			revision: 1
		});
		const added = await changeSermonBoard(db, owner, 1, {
			action: 'create',
			name: '  Rückmeldung  '
		});
		if (!added.ok) throw new Error('create failed');
		const column = added.columns.at(-1)!;
		expect(column.name).toBe('Rückmeldung');
		expect(
			await changeSermonBoard(db, owner, 1, { action: 'rename', id: 'idea', name: 'Veraltet' })
		).toMatchObject({ ok: false, reason: 'boardConflict' });
		expect(
			await changeSermonBoard(db, stranger, 1, { action: 'rename', id: column.id, name: 'Fremd' })
		).toMatchObject({ ok: false, reason: 'columnMissing' });
		expect(
			await changeSermonBoard(db, owner, 2, { action: 'create', name: 'rückmeldung' })
		).toMatchObject({ ok: false, reason: 'columnName' });
		expect(
			await changeSermonBoard(db, owner, 2, { action: 'rename', id: column.id, name: '' })
		).toMatchObject({ ok: false, reason: 'columnName' });
		await changeSermonBoard(db, owner, 2, {
			action: 'rename',
			id: column.id,
			name: 'Im Team prüfen'
		});
		await changeSermonBoard(db, owner, 3, { action: 'reorder', id: column.id, direction: 'left' });
		expect((await getSermonBoard(db, owner)).columns[4]).toEqual({
			id: column.id,
			name: 'Im Team prüfen'
		});
		expect((await getSermonBoard(db, stranger)).columns).toEqual(DEFAULT_SERMON_COLUMNS);
		await expect(
			createDocument(db, stranger, { ...body, sermonStatus: column.id })
		).rejects.toThrow('unknown account column');
		const ownDocument = await createDocument(db, stranger, body);
		await expect(
			updateDocument(db, stranger, ownDocument.id, ownDocument.revision, {
				sermonStatus: column.id
			})
		).rejects.toThrow('unknown account column');
	});

	it('moves every affected document atomically on deletion, including dormant metadata and trash', async () => {
		const owner = await account();
		const stranger = await account();
		const active = await createDocument(db, owner, body);
		const dormant = await createDocument(db, owner, body);
		const trash = await createDocument(db, owner, body);
		const foreign = await createDocument(db, stranger, body);
		await changeDocumentKind(db, owner, dormant.id, 1, 'note');
		await softDeleteDocument(db, owner, trash.id, 1);
		expect(
			await changeSermonBoard(db, owner, 1, {
				action: 'delete',
				id: 'idea',
				targetId: randomUUID()
			})
		).toMatchObject({ ok: false, reason: 'columnTarget' });
		await changeSermonBoard(db, owner, 1, { action: 'delete', id: 'idea', targetId: 'research' });
		const rows = await db.select().from(documents).where(eq(documents.userId, owner));
		expect(rows.map((row) => row.sermonStatus)).toEqual(['research', 'research', 'research']);
		expect(rows.find((row) => row.id === active.id)?.revision).toBe(2);
		expect(rows.find((row) => row.id === dormant.id)?.revision).toBe(3);
		expect(await getDocument(db, stranger, foreign.id)).toMatchObject({
			sermonStatus: 'idea',
			revision: 1
		});
		expect(await updateDocument(db, owner, active.id, 1, { title: 'Stale' })).toMatchObject({
			ok: false,
			reason: 'conflict'
		});
		expect(await changeDocumentKind(db, owner, dormant.id, 3, 'sermon')).toMatchObject({
			ok: true,
			document: { sermonStatus: 'research' }
		});
		expect(await createDocument(db, owner, body)).toMatchObject({ sermonStatus: 'research' });
		const note = await createDocument(db, owner, { ...body, kind: 'note' });
		expect(await changeDocumentKind(db, owner, note.id, 1, 'sermon')).toMatchObject({
			ok: true,
			document: { sermonStatus: 'research' }
		});
	});

	it('keeps one column and serializes simultaneous edits', async () => {
		const owner = await account();
		const results = await Promise.all([
			changeSermonBoard(db, owner, 1, { action: 'create', name: 'A' }),
			changeSermonBoard(db, owner, 1, { action: 'create', name: 'B' })
		]);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(results.filter((result) => !result.ok)).toEqual([
			{ ok: false, reason: 'boardConflict' }
		]);
		let board = await getSermonBoard(db, owner);
		for (const column of board.columns.slice(1)) {
			await changeSermonBoard(db, owner, board.revision, {
				action: 'delete',
				id: column.id,
				targetId: 'idea'
			});
			board = await getSermonBoard(db, owner);
		}
		expect(
			await changeSermonBoard(db, owner, board.revision, {
				action: 'delete',
				id: 'idea',
				targetId: 'idea'
			})
		).toMatchObject({ ok: false, reason: 'lastColumn' });
	});

	it('imports custom columns by name and reuses them without affecting other accounts', async () => {
		const owner = await account();
		await db.transaction(async (tx) => {
			const transactionDb = tx as unknown as typeof db;
			const id = await importSermonColumn(transactionDb, owner, randomUUID(), 'Im Team prüfen');
			expect(await importSermonColumn(transactionDb, owner, randomUUID(), 'Im Team prüfen')).toBe(
				id
			);
			await createDocument(transactionDb, owner, { ...body, sermonStatus: id });
		});
		expect((await getSermonBoard(db, owner)).columns).toHaveLength(6);
		await db.transaction(async (tx) => {
			const transactionDb = tx as unknown as typeof db;
			const id = await importSermonColumn(transactionDb, owner, 'idea', 'Ideensammlung im Team');
			expect(id).not.toBe('idea');
			expect(
				(await getSermonBoard(transactionDb, owner)).columns.find((column) => column.id === id)
					?.name
			).toBe('Ideensammlung im Team');
		});
	});

	it('cannot create a dangling status while another request removes its column', async () => {
		const owner = await account();
		const results = await Promise.allSettled([
			createDocument(db, owner, { ...body, sermonStatus: 'idea' }),
			changeSermonBoard(db, owner, 1, { action: 'delete', id: 'idea', targetId: 'research' })
		]);
		expect(results[1]).toMatchObject({ status: 'fulfilled', value: { ok: true } });
		const rows = await db.select().from(documents).where(eq(documents.userId, owner));
		expect(rows.every((document) => document.sermonStatus === 'research')).toBe(true);
		if (results[0]?.status === 'rejected')
			expect(results[0].reason.message).toBe('unknown account column');
	});
});
