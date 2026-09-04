import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passageToDbEndpoints } from '../../bible/passage.ts';
import { closeDb, getDb } from '../db/index.ts';
import { resources, users, verseComments } from '../db/schema.ts';
import {
	publishArticle,
	getPublishedArticleBySlug,
	listPublishedArticles
} from './document-publications.ts';
import {
	listDocumentsByTag,
	listDocumentTags,
	listDocumentTagTree,
	syncDocumentTags
} from './document-tags.ts';
import {
	createDocument,
	createDocumentFromLegacyVerseComment,
	findDocumentsOverlappingPassage,
	getDocument,
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
		expect(await syncDocumentTags(db, adminId, document.id, ['Foreign'])).toEqual({
			ok: false,
			reason: 'notFound'
		});
	});

	it('publishes only an admin-owned article and keeps working changes out of its snapshot', async () => {
		const ownerArticle = await createDocument(db, ownerId, {
			kind: 'article',
			title: 'Owner article',
			visibility: 'public',
			...EMPTY_BODY
		});
		expect(
			await publishArticle(db, ownerId, ownerArticle.id, {
				slug: `owner-${randomUUID()}`,
				excerpt: ''
			})
		).toMatchObject({ ok: false, reason: 'forbidden' });
		expect(
			await publishArticle(db, adminId, ownerArticle.id, {
				slug: `foreign-${randomUUID()}`,
				excerpt: ''
			})
		).toMatchObject({ ok: false, reason: 'notFound' });

		const article = await createDocument(db, adminId, {
			kind: 'article',
			title: 'Snapshot article',
			visibility: 'public',
			bodyMarkdown: 'Version one',
			bodyHtml: '<p>Version one</p>',
			plainText: 'Version one'
		});
		const slug = `snapshot-${randomUUID()}`;
		const first = await publishArticle(db, adminId, article.id, {
			slug,
			excerpt: 'First excerpt',
			expectedRevision: article.revision
		});
		expect(first.ok && first.publication.bodyMarkdown).toBe('Version one');

		const changed = await updateDocument(db, adminId, article.id, article.revision, {
			body: {
				bodyMarkdown: 'Version two',
				bodyHtml: '<p>Version two</p>',
				plainText: 'Version two'
			}
		});
		expect(changed.ok).toBe(true);
		expect((await getPublishedArticleBySlug(db, slug))?.bodyMarkdown).toBe('Version one');
		expect((await listPublishedArticles(db)).map((row) => row.documentId)).toContain(article.id);

		if (!changed.ok) throw new Error('working-copy update failed');
		const second = await publishArticle(db, adminId, article.id, {
			slug,
			excerpt: 'Second excerpt',
			expectedRevision: changed.document.revision
		});
		expect(second.ok && second.publication.bodyMarkdown).toBe('Version two');
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
	});
});
