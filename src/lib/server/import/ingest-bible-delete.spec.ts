import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passageToDbEndpoints } from '../../bible/passage.ts';
import { closeDb, getDb } from '../db/index.ts';
import { resources, users, verseComments } from '../db/schema.ts';
import {
	createDocument,
	getDocument,
	listDocumentPassages,
	replaceDocumentPassages
} from '../repositories/documents.ts';
import { createUser } from '../repositories/users.ts';
import { deleteResource } from './ingest-bible.ts';

describe.sequential('Bible resource deletion with document anchors', () => {
	const db = getDb();
	const sourceId = `DELETE-SOURCE-${randomUUID()}`;
	const targetId = `DELETE-TARGET-${randomUUID()}`;
	let userId: string;

	beforeAll(async () => {
		const user = await createUser(db, {
			email: `resource-document-${randomUUID()}@example.com`,
			password: 'a-fairly-good-password',
			displayName: 'Resource transfer test'
		});
		if (!user.ok) throw new Error('failed to create resource transfer user');
		userId = user.user.id;
		await db.insert(resources).values([
			{
				id: sourceId,
				kind: 'bible',
				name: 'Source Bible',
				abbrev: 'SRC',
				language: 'de',
				status: 'ready',
				isPublic: true
			},
			{
				id: targetId,
				kind: 'bible',
				name: 'Target Bible',
				abbrev: 'DST',
				language: 'de',
				status: 'ready',
				isPublic: true
			}
		]);
	});

	afterAll(async () => {
		if (userId) await db.delete(users).where(eq(users.id, userId));
		await db.delete(resources).where(eq(resources.id, targetId));
		await db.delete(resources).where(eq(resources.id, sourceId));
		await closeDb();
	});

	it('moves translation anchors and increments each affected working-copy revision', async () => {
		const legacyCommentId = randomUUID();
		const collidingSourceId = randomUUID();
		const collidingTargetId = randomUUID();
		await db.insert(verseComments).values([
			{
				id: legacyCommentId,
				userId,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 16,
				commentHtml: '<p>Legacy comment</p>'
			},
			{
				id: collidingSourceId,
				userId,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 17,
				commentHtml: '<p>From source</p>'
			},
			{
				id: collidingTargetId,
				userId,
				resourceId: targetId,
				bookId: 43,
				chapter: 3,
				verse: 17,
				commentHtml: '<p>At target</p>'
			}
		]);
		const document = await createDocument(db, userId, {
			kind: 'note',
			title: 'Translation-specific note',
			bodyMarkdown: '',
			bodyHtml: '',
			plainText: ''
		});
		const endpoints = passageToDbEndpoints({
			start: { book: 43, chapter: 3, verse: 16 },
			end: { book: 43, chapter: 3, verse: 16 }
		});
		if (!endpoints) throw new Error('invalid test passage');
		const attached = await replaceDocumentPassages(db, userId, document.id, [
			{ ...endpoints, resourceId: sourceId }
		]);
		expect(attached.ok).toBe(true);
		const revisionBeforeDelete = attached.ok ? attached.revision : 0;

		await deleteResource(db, sourceId, targetId);

		const [passage] = await listDocumentPassages(db, userId, document.id);
		expect(passage?.resourceId).toBe(targetId);
		expect((await getDocument(db, userId, document.id))?.revision).toBe(revisionBeforeDelete + 1);
		expect(
			await db
				.select({ id: verseComments.id, resourceId: verseComments.resourceId })
				.from(verseComments)
				.where(eq(verseComments.id, legacyCommentId))
		).toEqual([{ id: legacyCommentId, resourceId: targetId }]);
		const [merged] = await db
			.select({ id: verseComments.id, html: verseComments.commentHtml })
			.from(verseComments)
			.where(eq(verseComments.id, collidingTargetId));
		expect(merged?.html).toContain('<p>At target</p>');
		expect(merged?.html).toContain('Übertragen aus SRC');
		expect(merged?.html).toContain('<p>From source</p>');
		expect(
			await db.select().from(verseComments).where(eq(verseComments.id, collidingSourceId))
		).toHaveLength(0);
		expect(await db.select().from(resources).where(eq(resources.id, sourceId))).toHaveLength(0);
	});
});
