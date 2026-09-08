import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passageToDbEndpoints } from '../../bible/passage.ts';
import { MAX_DOCUMENT_PASSAGES } from '../../notes/documents.ts';
import { prepareDocumentBody } from '../documents/application.ts';
import { closeDb, getDb } from '../db/index.ts';
import {
	documentBodyReferenceIndexes,
	documents,
	resources,
	users,
	verseComments
} from '../db/schema.ts';
import {
	getOwnedDocumentPublication,
	getPublishedDocumentBySlug,
	publishDocument
} from './document-publications.ts';
import {
	listDocumentsByTag,
	listDocumentTags,
	listDocumentTagTree,
	listDocumentTagTreeWithCounts,
	syncDocumentTags
} from './document-tags.ts';
import { listDocumentRelations } from './document-links.ts';
import {
	backfillDocumentBodyReferenceIndexes,
	DOCUMENT_REFERENCE_PARSER_VERSION,
	listDocumentLibraryIndex,
	listDocumentLibrarySummaries
} from './document-reference-index.ts';
import {
	createDocument,
	createDocumentFromLegacyVerseComment,
	createDocumentWithPassages,
	findDocumentsOverlappingPassage,
	getDocument,
	listDocuments,
	listDocumentPassages,
	replaceDocumentPassages,
	restoreDocument,
	softDeleteDocument,
	updateDocument
} from './documents.ts';
import { createUser } from './users.ts';

const EMPTY_BODY = { bodyMarkdown: '', bodyHtml: '', plainText: '' };

function passage(start: { book: number; chapter: number; verse: number }, end = start) {
	const endpoints = passageToDbEndpoints({ start, end });
	if (!endpoints) throw new Error('invalid test passage');
	return endpoints;
}

describe.sequential('unified document repositories', () => {
	const db = getDb();
	const resourceId = `DOCSPEC-${randomUUID()}`;
	const privateResourceId = `DOCSPEC-PRIVATE-${randomUUID()}`;
	let ownerId: string;
	let adminId: string;

	beforeAll(async () => {
		const owner = await createUser(db, {
			email: `document-owner-${randomUUID()}@example.com`,
			password: 'a-fairly-good-password',
			displayName: 'Document Owner'
		});
		const admin = await createUser(db, {
			email: `document-admin-${randomUUID()}@example.com`,
			password: 'a-fairly-good-password',
			displayName: 'Public Author'
		});
		if (!owner.ok || !admin.ok) throw new Error('failed to create document test users');
		ownerId = owner.user.id;
		adminId = admin.user.id;
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, adminId));
		await db.insert(resources).values([
			{
				id: resourceId,
				kind: 'bible',
				name: 'Document spec Bible',
				abbrev: 'DSB',
				language: 'de',
				status: 'ready',
				isPublic: true
			},
			{
				id: privateResourceId,
				kind: 'bible',
				name: 'Private document spec Bible',
				abbrev: 'PDSB',
				language: 'de',
				status: 'ready',
				isPublic: false
			}
		]);
	});

	afterAll(async () => {
		if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
		if (adminId) await db.delete(users).where(eq(users.id, adminId));
		await db.delete(resources).where(eq(resources.id, privateResourceId));
		await db.delete(resources).where(eq(resources.id, resourceId));
		await closeDb();
	});

	it('enforces ownership, optimistic revisions, soft deletion and explicit restore', async () => {
		const created = await createDocument(db, ownerId, {
			kind: 'note',
			title: '  My   private note  ',
			...EMPTY_BODY
		});
		expect(created.title).toBe('My private note');
		expect(await getDocument(db, adminId, created.id)).toBeUndefined();

		const stale = await updateDocument(db, ownerId, created.id, created.revision + 1, {
			title: 'Must not win'
		});
		expect(stale).toEqual({ ok: false, reason: 'conflict', currentRevision: created.revision });

		const updated = await updateDocument(db, ownerId, created.id, created.revision, {
			title: 'Saved'
		});
		expect(updated.ok && updated.document.revision).toBe(created.revision + 1);
		const deleted = await softDeleteDocument(db, ownerId, created.id);
		expect(deleted.ok).toBe(true);
		expect(await getDocument(db, ownerId, created.id)).toBeUndefined();
		const restored = await restoreDocument(db, ownerId, created.id);
		expect(restored.ok).toBe(true);
		expect((await getDocument(db, ownerId, created.id))?.title).toBe('Saved');
	});

	it('indexes private document links in both directions without crossing owners', async () => {
		const target = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Linked target',
			...EMPTY_BODY
		});
		const foreignTarget = await createDocument(db, adminId, {
			kind: 'sermon',
			title: 'Foreign target',
			sermonStatus: 'idea',
			...EMPTY_BODY
		});
		const linkedBody = prepareDocumentBody(
			`[Eigenes Ziel](/notes/${target.id}) und [fremdes Ziel](/notes/${foreignTarget.id})`
		);
		const source = await createDocument(db, ownerId, {
			kind: 'sermon',
			title: 'Link source',
			sermonStatus: 'idea',
			...linkedBody
		});

		expect(
			(await listDocumentRelations(db, ownerId, source.id)).outgoing.map((row) => row.id)
		).toEqual([target.id]);
		expect(
			(await listDocumentRelations(db, ownerId, target.id)).incoming.map((row) => row.id)
		).toEqual([source.id]);
		expect((await listDocumentRelations(db, adminId, foreignTarget.id)).incoming).toEqual([]);

		const removed = await updateDocument(db, ownerId, source.id, source.revision, {
			body: prepareDocumentBody('Link entfernt')
		});
		expect(removed.ok).toBe(true);
		expect((await listDocumentRelations(db, ownerId, target.id)).incoming).toEqual([]);
	});

	it('keeps the note library ordered by creation date when an older note is edited', async () => {
		const query = `Creation order ${randomUUID()}`;
		const older = await createDocument(db, ownerId, {
			kind: 'note',
			title: `${query} older`,
			...EMPTY_BODY
		});
		const newer = await createDocument(db, ownerId, {
			kind: 'note',
			title: `${query} newer`,
			...EMPTY_BODY
		});
		const oldCreatedAt = new Date('2024-12-31T22:59:59Z');
		const newCreatedAt = new Date('2024-12-31T23:00:00Z');
		await db
			.update(documents)
			.set({ createdAt: oldCreatedAt, updatedAt: oldCreatedAt })
			.where(eq(documents.id, older.id));
		await db
			.update(documents)
			.set({ createdAt: newCreatedAt, updatedAt: newCreatedAt })
			.where(eq(documents.id, newer.id));
		const ids = async () =>
			(await listDocumentLibraryIndex(db, ownerId, { kind: 'note', query })).map((row) => row.id);
		expect(await ids()).toEqual([newer.id, older.id]);
		expect(
			(await updateDocument(db, ownerId, older.id, older.revision, { title: `${query} edited` })).ok
		).toBe(true);
		expect(await ids()).toEqual([newer.id, older.id]);
		const [summary] = await listDocumentLibrarySummaries(db, ownerId, [older.id]);
		expect(
			(await listDocumentLibraryIndex(db, ownerId, { kind: 'note', query })).map(
				(row) => row.createdYear
			)
		).toEqual([2025, 2024]);
		expect(summary?.createdAt).toEqual(oldCreatedAt);
		expect(summary!.updatedAt.getTime()).toBeGreaterThan(newCreatedAt.getTime());
	});

	it('keeps a compact Bible-reference index with an idempotent legacy backfill', async () => {
		const body = prepareDocumentBody('Joh 3,16 und 1Mo 50,26-2Mo 1,2.');
		const indexed = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Indexed references',
			...body
		});
		const indexedRow = (await listDocumentLibraryIndex(db, ownerId)).find(
			(row) => row.id === indexed.id
		);
		expect(indexedRow?.books).toEqual([1, 2, 43]);
		expect(indexedRow?.ranges).toHaveLength(2);

		const summaries = await listDocumentLibrarySummaries(db, ownerId, [indexed.id]);
		expect(summaries).toEqual([
			expect.objectContaining({ id: indexed.id, title: 'Indexed references' })
		]);
		expect(await listDocumentLibrarySummaries(db, adminId, [indexed.id])).toEqual([]);

		const replacement = prepareDocumentBody('Röm 8,1');
		const updated = await updateDocument(db, ownerId, indexed.id, indexed.revision, {
			body: replacement
		});
		expect(updated.ok).toBe(true);
		expect(
			(await listDocumentLibraryIndex(db, ownerId)).find((row) => row.id === indexed.id)?.books
		).toEqual([45]);

		const [legacy] = await db
			.insert(documents)
			.values({
				userId: ownerId,
				kind: 'note',
				title: 'Unindexed legacy body',
				...prepareDocumentBody('Mt 5,3')
			})
			.returning({ id: documents.id });
		expect(
			(await listDocumentLibraryIndex(db, ownerId)).find((row) => row.id === legacy!.id)?.books
		).toEqual([40]);
		await backfillDocumentBodyReferenceIndexes(db);
		const storedLegacyIndex = () =>
			db
				.select({ books: documentBodyReferenceIndexes.books })
				.from(documentBodyReferenceIndexes)
				.where(eq(documentBodyReferenceIndexes.documentId, legacy!.id));
		expect(await storedLegacyIndex()).toEqual([{ books: [40] }]);
		await backfillDocumentBodyReferenceIndexes(db);
		expect(await storedLegacyIndex()).toEqual([{ books: [40] }]);
	});

	it('rescans outdated references across batches and owners without changing working copies', async () => {
		const originals = await db
			.insert(documents)
			.values(
				Array.from({ length: 105 }, (_, index) => ({
					userId: index % 2 ? ownerId : adminId,
					kind: index % 2 ? ('note' as const) : ('sermon' as const),
					sermonStatus: index % 2 ? null : 'idea',
					title: `Parser rescan ${index}`,
					deletedAt: index % 3 ? null : new Date(),
					...prepareDocumentBody(index === 0 ? 'Keine Stelle' : 'Siehe 2. Sam 9,2')
				}))
			)
			.returning();
		const ids = originals.map(({ id }) => id);
		await db.insert(documentBodyReferenceIndexes).values(
			originals.slice(0, -1).map((document) => ({
				documentId: document.id,
				userId: document.userId,
				books: [9],
				ranges: [{ startBook: 9, endBook: 9, startKey: 9009002, endKey: 9009002 }]
				// The migration's default stamps existing rows with the old parser version.
			}))
		);

		const visible = await listDocumentLibraryIndex(db, ownerId, { deleted: 'include' });
		expect(
			visible.filter((row) => ids.includes(row.id)).every((row) => row.books.join() === '10')
		).toBe(true);
		expect(visible.some((row) => row.id === originals[0]!.id)).toBe(false);
		const stored = () =>
			db
				.select()
				.from(documentBodyReferenceIndexes)
				.where(inArray(documentBodyReferenceIndexes.documentId, ids));
		// The read-only fallback corrects old results in memory without writing from a library GET.
		expect(
			(await stored()).every((row) => row.parserVersion === 1 && row.books.join() === '9')
		).toBe(true);

		expect(await backfillDocumentBodyReferenceIndexes(db)).toBeGreaterThanOrEqual(105);
		const indexes = await stored();
		expect(indexes).toHaveLength(105);
		for (const original of originals) {
			const empty = original.id === originals[0]!.id;
			expect(indexes.find((row) => row.documentId === original.id)).toMatchObject({
				userId: original.userId,
				parserVersion: DOCUMENT_REFERENCE_PARSER_VERSION,
				books: empty ? [] : [10],
				ranges: empty ? [] : [{ startBook: 10, endBook: 10, startKey: 10009002, endKey: 10009002 }]
			});
		}
		expect(await backfillDocumentBodyReferenceIndexes(db)).toBe(0);
		expect(await backfillDocumentBodyReferenceIndexes(db, { force: true })).toBeGreaterThanOrEqual(
			105
		);
		expect(
			await db.select().from(documents).where(inArray(documents.id, ids)).orderBy(documents.id)
		).toEqual(originals.sort((a, b) => a.id.localeCompare(b.id)));
	});

	it('atomically creates a working copy with its initial passage', async () => {
		const created = await createDocumentWithPassages(
			db,
			ownerId,
			{
				kind: 'note',
				title: 'Atomic initial passage',
				...EMPTY_BODY
			},
			[{ ...passage({ book: 43, chapter: 3, verse: 16 }), resourceId }]
		);
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error('expected atomic document creation to succeed');
		expect(created.document.revision).toBe(2);
		expect(await listDocumentPassages(db, ownerId, created.document.id)).toHaveLength(1);

		const rollbackTitle = `Atomic rollback ${randomUUID()}`;
		const rejected = await createDocumentWithPassages(
			db,
			ownerId,
			{ kind: 'sermon', title: rollbackTitle, sermonStatus: 'idea', ...EMPTY_BODY },
			[{ ...passage({ book: 43, chapter: 3, verse: 17 }), resourceId: privateResourceId }]
		);
		expect(rejected).toEqual({
			ok: false,
			reason: 'invalidResource',
			resourceId: privateResourceId
		});
		expect(
			await db
				.select({ id: documents.id })
				.from(documents)
				.where(and(eq(documents.userId, ownerId), eq(documents.title, rollbackTitle)))
		).toEqual([]);
	});

	it('replaces validated canonical and translation anchors and finds inclusive overlaps', async () => {
		const document = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Cross-chapter study',
			...EMPTY_BODY
		});
		const canonical = passage(
			{ book: 43, chapter: 3, verse: 16 },
			{ book: 43, chapter: 4, verse: 2 }
		);
		const translated = passage({ book: 1, chapter: 1, verse: 1 });
		const replaced = await replaceDocumentPassages(
			db,
			ownerId,
			document.id,
			[
				{ ...canonical, resourceId: null },
				{ ...translated, resourceId }
			],
			document.revision
		);
		expect(replaced.ok).toBe(true);
		expect(await listDocumentPassages(db, ownerId, document.id)).toHaveLength(2);

		const overlap = passage({ book: 43, chapter: 4, verse: 1 });
		expect(
			(await findDocumentsOverlappingPassage(db, ownerId, { ...overlap, resourceId })).map(
				(row) => row.id
			)
		).toContain(document.id);
		expect(
			await replaceDocumentPassages(db, ownerId, document.id, [
				{ ...translated, resourceId: privateResourceId }
			])
		).toEqual({ ok: false, reason: 'invalidResource', resourceId: privateResourceId });
		await expect(
			replaceDocumentPassages(
				db,
				ownerId,
				document.id,
				Array.from({ length: MAX_DOCUMENT_PASSAGES + 1 }, (_, position) => ({
					...translated,
					resourceId: null,
					position
				}))
			)
		).rejects.toMatchObject({ code: 'passage' });

		await softDeleteDocument(db, ownerId, document.id);
		expect(
			(await findDocumentsOverlappingPassage(db, ownerId, overlap)).map((row) => row.id)
		).not.toContain(document.id);
		expect(
			(
				await findDocumentsOverlappingPassage(db, ownerId, {
					...overlap,
					deleted: 'only'
				})
			).map((row) => row.id)
		).toContain(document.id);
	});

	it('creates nested ancestors and never crosses ownership while filtering', async () => {
		const document = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Tagged note',
			...EMPTY_BODY
		});
		const synced = await syncDocumentTags(
			db,
			ownerId,
			document.id,
			['#Theology/Grace'],
			document.revision
		);
		expect(synced.ok && synced.tags[0]?.path).toBe('Theology/Grace');
		expect((await listDocumentTagTree(db, ownerId)).map((tag) => tag.path)).toEqual(
			expect.arrayContaining(['Theology', 'Theology/Grace'])
		);
		expect((await listDocumentTags(db, ownerId, document.id)).map((tag) => tag.path)).toEqual([
			'Theology/Grace'
		]);
		expect((await listDocumentsByTag(db, ownerId, 'theology')).map((row) => row.id)).toContain(
			document.id
		);
		expect((await listDocuments(db, ownerId, { query: 'Grace' })).map((row) => row.id)).toContain(
			document.id
		);
		const unicodeDocument = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Unicode tagged note',
			...EMPTY_BODY
		});
		const unicodeSync = await syncDocumentTags(db, ownerId, unicodeDocument.id, ['😀/Kind']);
		expect(unicodeSync.ok).toBe(true);
		expect((await listDocumentsByTag(db, ownerId, '😀')).map((row) => row.id)).toContain(
			unicodeDocument.id
		);
		expect(await syncDocumentTags(db, adminId, document.id, ['Foreign'])).toEqual({
			ok: false,
			reason: 'notFound'
		});

		await softDeleteDocument(db, ownerId, document.id);
		expect((await listDocumentsByTag(db, ownerId, 'theology')).map((row) => row.id)).not.toContain(
			document.id
		);
		expect(
			(await listDocumentsByTag(db, ownerId, 'theology', { deleted: 'only' })).map((row) => row.id)
		).toContain(document.id);
	});

	it('counts active note descendants in the tag tree without including sermons', async () => {
		const root = `Count-${randomUUID()}`;
		const note = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Counted note',
			...EMPTY_BODY
		});
		const secondNote = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Second counted note',
			...EMPTY_BODY
		});
		const sermon = await createDocument(db, ownerId, {
			kind: 'sermon',
			title: 'Uncounted sermon',
			sermonStatus: 'idea',
			...EMPTY_BODY
		});
		await syncDocumentTags(db, ownerId, note.id, [`${root}/Child/A`], note.revision);
		await syncDocumentTags(db, ownerId, secondNote.id, [`${root}/Child/B`], secondNote.revision);
		await syncDocumentTags(db, ownerId, sermon.id, [`${root}/Child/C`], sermon.revision);

		let counts = await listDocumentTagTreeWithCounts(db, ownerId);
		expect(counts.find((tag) => tag.path === root)?.documentCount).toBe(2);
		expect(counts.find((tag) => tag.path === `${root}/Child`)?.documentCount).toBe(2);
		expect(counts.find((tag) => tag.path === `${root}/Child/A`)?.documentCount).toBe(1);
		expect(counts.find((tag) => tag.path === `${root}/Child/C`)?.documentCount).toBe(0);

		await softDeleteDocument(db, ownerId, note.id);
		counts = await listDocumentTagTreeWithCounts(db, ownerId);
		expect(counts.find((tag) => tag.path === root)?.documentCount).toBe(1);
		const deletedCounts = await listDocumentTagTreeWithCounts(db, ownerId, 'only');
		expect(deletedCounts.find((tag) => tag.path === root)?.documentCount).toBe(1);
	});

	it('locks the working copy before changing tag links', async () => {
		const document = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Concurrent tag note',
			...EMPTY_BODY
		});
		let syncPromise: ReturnType<typeof syncDocumentTags> | undefined;
		let syncSettled = false;

		await db.transaction(async (tx) => {
			await tx
				.select({ id: documents.id })
				.from(documents)
				.where(eq(documents.id, document.id))
				.for('update');
			syncPromise = syncDocumentTags(
				db,
				ownerId,
				document.id,
				['Concurrent/Child'],
				document.revision
			);
			void syncPromise.then(
				() => (syncSettled = true),
				() => (syncSettled = true)
			);
			await new Promise((resolve) => setTimeout(resolve, 75));
			expect(syncSettled).toBe(false);
			await tx
				.update(documents)
				.set({ revision: sql`${documents.revision} + 1`, updatedAt: new Date() })
				.where(eq(documents.id, document.id));
		});

		if (!syncPromise) throw new Error('tag sync did not start');
		expect(await syncPromise).toEqual({
			ok: false,
			reason: 'conflict',
			currentRevision: document.revision + 1
		});
		expect((await listDocumentTagTree(db, ownerId)).map((tag) => tag.path)).not.toContain(
			'Concurrent/Child'
		);
	});

	it('publishes only an admin-owned note and keeps working changes out of its snapshot', async () => {
		const ownerNote = await createDocument(db, ownerId, {
			kind: 'note',
			title: 'Owner note',
			visibility: 'unlisted',
			...EMPTY_BODY
		});
		expect(
			await publishDocument(db, ownerId, ownerNote.id, {
				slug: `owner-${randomUUID()}`,
				excerpt: '',
				visibility: 'unlisted'
			})
		).toMatchObject({ ok: false, reason: 'forbidden' });
		expect(
			await publishDocument(db, adminId, ownerNote.id, {
				slug: `foreign-${randomUUID()}`,
				excerpt: '',
				visibility: 'unlisted'
			})
		).toMatchObject({ ok: false, reason: 'notFound' });
		const sermon = await createDocument(db, adminId, {
			kind: 'sermon',
			title: 'Private sermon',
			sermonStatus: 'idea',
			...EMPTY_BODY
		});
		expect(
			await publishDocument(db, adminId, sermon.id, {
				slug: `sermon-${randomUUID()}`,
				excerpt: '',
				visibility: 'unlisted'
			})
		).toMatchObject({ ok: false, reason: 'notPublishable' });

		const note = await createDocument(db, adminId, {
			kind: 'note',
			title: 'Snapshot note',
			visibility: 'private',
			bodyMarkdown: 'Version one',
			bodyHtml: '<p>Version one</p>',
			plainText: 'Version one'
		});
		expect(
			await publishDocument(db, adminId, note.id, {
				slug: `rejected-public-${randomUUID()}`,
				excerpt: '',
				visibility: 'public' as never,
				expectedRevision: note.revision
			})
		).toMatchObject({ ok: false, reason: 'private' });
		expect(await getOwnedDocumentPublication(db, adminId, note.id)).toBeUndefined();
		expect((await getDocument(db, adminId, note.id))?.revision).toBe(note.revision);
		const slug = `snapshot-${randomUUID()}`;
		const first = await publishDocument(db, adminId, note.id, {
			slug,
			excerpt: 'First excerpt',
			visibility: 'unlisted',
			expectedRevision: note.revision
		});
		expect(first.ok && first.publication.bodyMarkdown).toBe('Version one');
		expect(first.ok && first.publication.publicationRevision).toBe(note.revision + 1);
		expect((await getDocument(db, adminId, note.id))?.visibility).toBe('unlisted');
		expect(await getOwnedDocumentPublication(db, ownerId, note.id)).toBeUndefined();
		expect((await getOwnedDocumentPublication(db, adminId, note.id))?.slug).toBe(slug);
		const conflictingNote = await createDocument(db, adminId, {
			kind: 'note',
			title: 'Conflicting slug note',
			visibility: 'private',
			...EMPTY_BODY
		});
		expect(
			await publishDocument(db, adminId, conflictingNote.id, {
				slug,
				excerpt: '',
				visibility: 'unlisted',
				expectedRevision: conflictingNote.revision
			})
		).toMatchObject({ ok: false, reason: 'slugConflict' });
		expect(await getDocument(db, adminId, conflictingNote.id)).toMatchObject({
			visibility: 'private',
			revision: conflictingNote.revision
		});
		expect(await getOwnedDocumentPublication(db, adminId, conflictingNote.id)).toBeUndefined();
		const unlistedSlug = `unlisted-${randomUUID()}`;
		const unlisted = await publishDocument(db, adminId, conflictingNote.id, {
			slug: unlistedSlug,
			excerpt: '',
			visibility: 'unlisted',
			expectedRevision: conflictingNote.revision
		});
		expect(unlisted.ok && unlisted.publication.visibility).toBe('unlisted');
		expect((await getPublishedDocumentBySlug(db, unlistedSlug))?.documentId).toBe(
			conflictingNote.id
		);

		const publishedRevision = first.ok ? first.publication.publicationRevision : 0;
		const changed = await updateDocument(db, adminId, note.id, publishedRevision, {
			body: {
				bodyMarkdown: 'Version two',
				bodyHtml: '<p>Version two</p>',
				plainText: 'Version two'
			}
		});
		expect(changed.ok).toBe(true);
		expect((await getPublishedDocumentBySlug(db, slug))?.bodyMarkdown).toBe('Version one');

		if (!changed.ok) throw new Error('working-copy update failed');
		const second = await publishDocument(db, adminId, note.id, {
			slug,
			excerpt: 'Second excerpt',
			visibility: 'unlisted',
			expectedRevision: changed.document.revision
		});
		expect(second.ok && second.publication.bodyMarkdown).toBe('Version two');
		expect(second.ok && second.publication.publicationRevision).toBe(changed.document.revision);
		expect((await getDocument(db, adminId, note.id))?.revision).toBe(changed.document.revision);
	});

	it('serializes publication snapshots with concurrent working-copy mutations', async () => {
		const note = await createDocument(db, adminId, {
			kind: 'note',
			title: 'Locking note',
			visibility: 'unlisted',
			...EMPTY_BODY
		});
		const slug = `locking-${randomUUID()}`;
		let publicationPromise: ReturnType<typeof publishDocument> | undefined;
		let publicationSettled = false;

		await db.transaction(async (tx) => {
			await tx
				.select({ id: documents.id })
				.from(documents)
				.where(eq(documents.id, note.id))
				.for('update');
			publicationPromise = publishDocument(db, adminId, note.id, {
				slug,
				excerpt: '',
				visibility: 'unlisted',
				expectedRevision: note.revision
			});
			void publicationPromise.then(
				() => (publicationSettled = true),
				() => (publicationSettled = true)
			);
			await new Promise((resolve) => setTimeout(resolve, 75));
			expect(publicationSettled).toBe(false);
			await tx
				.update(documents)
				.set({
					title: 'Concurrent working copy',
					revision: sql`${documents.revision} + 1`,
					updatedAt: new Date()
				})
				.where(eq(documents.id, note.id));
		});

		if (!publicationPromise) throw new Error('publication did not start');
		expect(await publicationPromise).toEqual({
			ok: false,
			reason: 'conflict',
			currentRevision: note.revision + 1
		});
		expect(await getPublishedDocumentBySlug(db, slug)).toBeUndefined();
	});

	it('creates an idempotent private document for a legacy verse comment', async () => {
		const legacyId = randomUUID();
		const now = new Date();
		await db.insert(verseComments).values({
			id: legacyId,
			userId: ownerId,
			resourceId,
			bookId: 43,
			chapter: 3,
			verse: 16,
			commentHtml: '<p>Legacy</p>'
		});
		const input = {
			id: legacyId,
			userId: ownerId,
			resourceId,
			bookId: 43,
			chapter: 3,
			verse: 16,
			commentHtml: '<p>Legacy</p>',
			createdAt: now,
			updatedAt: now,
			title: 'John 3:16',
			bodyMarkdown: 'Legacy',
			bodyHtml: '<p>Legacy</p>',
			plainText: 'Legacy'
		};
		const first = await createDocumentFromLegacyVerseComment(db, input);
		const second = await createDocumentFromLegacyVerseComment(db, input);
		expect(first.ok && first.created).toBe(true);
		expect(second.ok && second.created).toBe(false);
		expect(first.ok && second.ok && second.document.id).toBe(first.ok ? first.document.id : '');

		const hiddenLegacyId = randomUUID();
		await db.insert(verseComments).values({
			id: hiddenLegacyId,
			userId: ownerId,
			resourceId: privateResourceId,
			bookId: 43,
			chapter: 3,
			verse: 17,
			commentHtml: '<p>Historically hidden translation</p>'
		});
		const hidden = await createDocumentFromLegacyVerseComment(db, {
			...input,
			id: hiddenLegacyId,
			resourceId: privateResourceId,
			verse: 17,
			title: 'Historical hidden Bible note'
		});
		expect(hidden.ok && hidden.created).toBe(true);
		expect(
			hidden.ok && (await listDocumentPassages(db, ownerId, hidden.document.id))[0]
		).toMatchObject({ resourceId: privateResourceId });
	});
});
