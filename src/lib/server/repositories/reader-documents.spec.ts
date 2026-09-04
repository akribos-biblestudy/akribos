import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passageToDbEndpoints } from '$lib/bible/passage';
import { config } from '$lib/server/config';
import { createDb } from '$lib/server/db/client';
import { resources, users } from '$lib/server/db/schema';
import { createDocument, replaceDocumentPassages, softDeleteDocument } from './documents';
import { loadReaderDocumentAnchors } from './reader-documents';
import { createUser } from './users';

const { client, db } = createDb(config().DATABASE_URL, { max: 1 });
const EMPTY_BODY = { bodyMarkdown: '', bodyHtml: '', plainText: '' };

function passage(start: { book: number; chapter: number; verse: number }, end = start) {
	const result = passageToDbEndpoints({ start, end });
	if (!result) throw new Error('invalid reader-document test passage');
	return result;
}

describe.sequential('reader document anchors', () => {
	const resourceA = `READER-DOC-A-${randomUUID()}`;
	const resourceB = `READER-DOC-B-${randomUUID()}`;
	let ownerId: string;
	let otherUserId: string;

	beforeAll(async () => {
		const owner = await createUser(db, {
			email: `reader-doc-owner-${randomUUID()}@example.com`,
			password: 'a-fairly-good-password',
			displayName: 'Reader document owner'
		});
		const other = await createUser(db, {
			email: `reader-doc-other-${randomUUID()}@example.com`,
			password: 'a-fairly-good-password',
			displayName: 'Other reader'
		});
		if (!owner.ok || !other.ok) throw new Error('failed to create reader-document test users');
		ownerId = owner.user.id;
		otherUserId = other.user.id;
		await db.insert(resources).values([
			{
				id: resourceA,
				kind: 'bible',
				name: 'Reader document Bible A',
				abbrev: 'RDA',
				language: 'de',
				status: 'ready',
				isPublic: true
			},
			{
				id: resourceB,
				kind: 'bible',
				name: 'Reader document Bible B',
				abbrev: 'RDB',
				language: 'de',
				status: 'ready',
				isPublic: true
			}
		]);
	});

	afterAll(async () => {
		if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
		if (otherUserId) await db.delete(users).where(eq(users.id, otherUserId));
		await db.delete(resources).where(inArray(resources.id, [resourceA, resourceB]));
		await client.end();
	});

	it('returns canonical and exact-resource overlaps without crossing owners or translations', async () => {
		async function add(
			userId: string,
			title: string,
			resourceId: string | null,
			start = { book: 43, chapter: 3, verse: 18 },
			end = { book: 43, chapter: 4, verse: 2 }
		) {
			const document = await createDocument(db, userId, {
				kind: 'note',
				title,
				...EMPTY_BODY
			});
			const updated = await replaceDocumentPassages(db, userId, document.id, [
				{ ...passage(start, end), resourceId }
			]);
			if (!updated.ok) throw new Error(`failed to attach ${title}`);
			return document;
		}

		const canonical = await add(ownerId, 'Canonical', null);
		const exact = await add(ownerId, 'Exact translation', resourceA);
		await add(ownerId, 'Other translation', resourceB);
		await add(otherUserId, 'Other owner', null);
		const deleted = await add(ownerId, 'Deleted', null);
		await softDeleteDocument(db, ownerId, deleted.id);

		const anchors = await loadReaderDocumentAnchors(db, ownerId, resourceA, {
			book: 43,
			chapter: 4
		});
		expect(anchors.map((row) => row.documentId)).toEqual(
			expect.arrayContaining([canonical.id, exact.id])
		);
		expect(anchors.map((row) => row.title)).not.toEqual(
			expect.arrayContaining(['Other translation', 'Other owner', 'Deleted'])
		);
		expect(await loadReaderDocumentAnchors(db, ownerId, null, { book: 43, chapter: 4 })).toEqual(
			[]
		);
		expect(await loadReaderDocumentAnchors(db, null, resourceA, { book: 43, chapter: 4 })).toEqual(
			[]
		);
	});
});
