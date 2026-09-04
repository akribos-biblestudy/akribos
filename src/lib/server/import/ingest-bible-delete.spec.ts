import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passageToDbEndpoints } from '../../bible/passage.ts';
import { closeDb, getDb } from '../db/index.ts';
import { resources, users, verseComments } from '../db/schema.ts';
import { backfillLegacyVerseComments } from '../documents/legacy-backfill.ts';
import {
	createDocument,
	createDocumentFromLegacyVerseComment,
	getDocument,
	getDocumentByLegacyVerseCommentId,
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

	it('requires an eligible replacement and transfers comments and deduplicated anchors safely', async () => {
		const legacyCommentId = randomUUID();
		const collidingSourceId = randomUUID();
		const collidingTargetId = randomUUID();
		const pendingSourceId = randomUUID();
		const mappedTargetId = randomUUID();
		const mappedSourceId = randomUUID();
		const pendingTargetId = randomUUID();
		const mappedSourceBothId = randomUUID();
		const mappedTargetBothId = randomUUID();
		const collisionTimestamp = new Date();
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
			},
			{
				id: pendingSourceId,
				userId,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 18,
				commentHtml: '<p>Pending source</p>',
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp
			},
			{
				id: mappedTargetId,
				userId,
				resourceId: targetId,
				bookId: 43,
				chapter: 3,
				verse: 18,
				commentHtml: '<p>Mapped target</p>',
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp
			},
			{
				id: mappedSourceId,
				userId,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 19,
				commentHtml: '<p>Mapped source</p>',
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp
			},
			{
				id: pendingTargetId,
				userId,
				resourceId: targetId,
				bookId: 43,
				chapter: 3,
				verse: 19,
				commentHtml: '<p>Pending target</p>',
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp
			},
			{
				id: mappedSourceBothId,
				userId,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 20,
				commentHtml: '<p>Mapped source with mapped target</p>',
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp
			},
			{
				id: mappedTargetBothId,
				userId,
				resourceId: targetId,
				bookId: 43,
				chapter: 3,
				verse: 20,
				commentHtml: '<p>Mapped target with mapped source</p>',
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp
			}
		]);
		async function materialize(
			id: string,
			resourceId: string,
			verse: number,
			text: string
		): Promise<void> {
			const result = await createDocumentFromLegacyVerseComment(db, {
				id,
				userId,
				resourceId,
				bookId: 43,
				chapter: 3,
				verse,
				commentHtml: `<p>${text}</p>`,
				createdAt: collisionTimestamp,
				updatedAt: collisionTimestamp,
				title: `${text} legacy note`,
				bodyMarkdown: text,
				bodyHtml: `<p>${text}</p>`,
				plainText: text
			});
			expect(result.ok && result.created).toBe(true);
		}
		await materialize(mappedTargetId, targetId, 18, 'Mapped target');
		await materialize(mappedSourceId, sourceId, 19, 'Mapped source');
		await materialize(mappedSourceBothId, sourceId, 20, 'Mapped source with mapped target');
		await materialize(mappedTargetBothId, targetId, 20, 'Mapped target with mapped source');
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
			{ ...endpoints, resourceId: sourceId, position: 1 },
			{ ...endpoints, resourceId: targetId, position: 3 },
			{ ...endpoints, resourceId: null, position: 5 }
		]);
		expect(attached.ok).toBe(true);
		const revisionBeforeDelete = attached.ok ? attached.revision : 0;

		await db.update(resources).set({ isPublic: false }).where(eq(resources.id, targetId));
		await expect(deleteResource(db, sourceId, targetId)).rejects.toThrow(
			'invalid replacement Bible'
		);
		expect(await db.select().from(resources).where(eq(resources.id, sourceId))).toHaveLength(1);
		await db
			.update(resources)
			.set({ isPublic: true, status: 'importing' })
			.where(eq(resources.id, targetId));
		await expect(deleteResource(db, sourceId, targetId)).rejects.toThrow(
			'invalid replacement Bible'
		);
		await db.update(resources).set({ status: 'ready' }).where(eq(resources.id, targetId));

		await deleteResource(db, sourceId, targetId);

		const passages = await listDocumentPassages(db, userId, document.id);
		expect(passages.filter((passage) => passage.resourceId === targetId)).toEqual([
			expect.objectContaining({ resourceId: targetId, position: 1 })
		]);
		expect(passages.filter((passage) => passage.resourceId === null)).toHaveLength(1);
		expect((await getDocument(db, userId, document.id))?.revision).toBe(revisionBeforeDelete + 1);
		expect(
			await db
				.select({ id: verseComments.id, resourceId: verseComments.resourceId })
				.from(verseComments)
				.where(eq(verseComments.id, legacyCommentId))
		).toEqual([{ id: legacyCommentId, resourceId: targetId }]);
		const collisionCases = [
			{
				state: 'pending source / pending target',
				sourceCommentId: collidingSourceId,
				targetCommentId: collidingTargetId,
				sourceHtml: '<p>From source</p>',
				targetHtml: '<p>At target</p>'
			},
			{
				state: 'pending source / mapped target',
				sourceCommentId: pendingSourceId,
				targetCommentId: mappedTargetId,
				sourceHtml: '<p>Pending source</p>',
				targetHtml: '<p>Mapped target</p>'
			},
			{
				state: 'mapped source / pending target',
				sourceCommentId: mappedSourceId,
				targetCommentId: pendingTargetId,
				sourceHtml: '<p>Mapped source</p>',
				targetHtml: '<p>Pending target</p>'
			},
			{
				state: 'mapped source / mapped target',
				sourceCommentId: mappedSourceBothId,
				targetCommentId: mappedTargetBothId,
				sourceHtml: '<p>Mapped source with mapped target</p>',
				targetHtml: '<p>Mapped target with mapped source</p>'
			}
		] as const;

		for (const collision of collisionCases) {
			const [remainingComment] = await db
				.select({ resourceId: verseComments.resourceId, html: verseComments.commentHtml })
				.from(verseComments)
				.where(eq(verseComments.id, collision.targetCommentId));
			expect(remainingComment, collision.state).toMatchObject({ resourceId: targetId });
			expect(remainingComment?.html, collision.state).toContain(collision.targetHtml);
			expect(remainingComment?.html, collision.state).toContain('Übertragen aus SRC');
			expect(remainingComment?.html, collision.state).toContain(collision.sourceHtml);
			expect(
				await db
					.select({ id: verseComments.id })
					.from(verseComments)
					.where(eq(verseComments.id, collision.sourceCommentId)),
				collision.state
			).toHaveLength(0);

			const sourceDocument = await getDocumentByLegacyVerseCommentId(
				db,
				userId,
				collision.sourceCommentId
			);
			const targetDocument = await getDocumentByLegacyVerseCommentId(
				db,
				userId,
				collision.targetCommentId
			);
			expect(sourceDocument?.bodyHtml, collision.state).toBe(collision.sourceHtml);
			expect(targetDocument?.bodyHtml, collision.state).toBe(collision.targetHtml);
			expect(
				sourceDocument && (await listDocumentPassages(db, userId, sourceDocument.id)),
				collision.state
			).toEqual([expect.objectContaining({ resourceId: targetId })]);
			expect(
				targetDocument && (await listDocumentPassages(db, userId, targetDocument.id)),
				collision.state
			).toEqual([expect.objectContaining({ resourceId: targetId })]);
		}

		// The ordinary non-colliding source row is still picked up exactly once by the resumable path.
		await backfillLegacyVerseComments(db);
		expect(await getDocumentByLegacyVerseCommentId(db, userId, legacyCommentId)).toBeDefined();
		for (const collision of collisionCases) {
			expect(
				await getDocumentByLegacyVerseCommentId(db, userId, collision.sourceCommentId),
				collision.state
			).toBeDefined();
			expect(
				await getDocumentByLegacyVerseCommentId(db, userId, collision.targetCommentId),
				collision.state
			).toBeDefined();
		}
		expect(await db.select().from(resources).where(eq(resources.id, sourceId))).toHaveLength(0);
	});
});
