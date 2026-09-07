import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES, MAX_DOCUMENT_ATTACHMENTS } from '../../notes/attachments.ts';
import { closeDb, getDb } from '../db/index.ts';
import { documentAttachments, documents, users } from '../db/schema.ts';
import {
	createDocument,
	changeDocumentKind,
	getDocument,
	softDeleteDocument,
	restoreDocument
} from './documents.ts';
import {
	getDocumentAttachment,
	listDocumentAttachments,
	mutateDocumentAttachment
} from './document-attachments.ts';

describe.sequential('private document attachments', () => {
	const db = getDb();
	let owner: string;
	let admin: string;
	const content = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
	const file = {
		type: 'add' as const,
		filename: 'Präsentation.pdf',
		mediaType: 'application/pdf',
		content
	};
	const sermon = () =>
		createDocument(db, owner, {
			kind: 'sermon',
			title: 'Anlagen',
			bodyMarkdown: '',
			bodyHtml: '',
			plainText: ''
		});
	beforeAll(async () => {
		const rows = await db
			.insert(users)
			.values([
				{ email: `attachment-owner-${randomUUID()}@example.com`, passwordHash: 'not-a-login' },
				{
					email: `attachment-admin-${randomUUID()}@example.com`,
					passwordHash: 'not-a-login',
					role: 'admin' as const
				}
			])
			.returning({ id: users.id });
		owner = rows[0]!.id;
		admin = rows[1]!.id;
	});
	afterAll(async () => {
		await db.delete(users).where(inArray(users.id, [owner, admin]));
		await closeDb();
	});

	it('roundtrips binary bytes, returns metadata only and rejects foreign users including administrators', async () => {
		const doc = await sermon();
		const result = await mutateDocumentAttachment(db, owner, doc.id, 1, file);
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('upload failed');
		expect(result.revision).toBe(2);
		const [metadata] = result.attachments;
		expect(metadata).not.toHaveProperty('content');
		expect(metadata).toMatchObject({ filename: file.filename, sizeBytes: content.length });
		expect((await getDocumentAttachment(db, owner, doc.id, metadata!.id))?.content).toEqual(
			content
		);
		expect(await listDocumentAttachments(db, admin, doc.id)).toEqual([]);
		expect(await getDocumentAttachment(db, admin, doc.id, metadata!.id)).toBeUndefined();
		expect(
			await mutateDocumentAttachment(db, admin, doc.id, 2, { type: 'remove', id: metadata!.id })
		).toEqual({ ok: false, reason: 'notFound' });
		const otherDoc = await sermon();
		expect(await getDocumentAttachment(db, owner, otherDoc.id, metadata!.id)).toBeUndefined();
		expect(
			await mutateDocumentAttachment(db, owner, otherDoc.id, 1, {
				type: 'remove',
				id: metadata!.id
			})
		).toEqual({ ok: false, reason: 'notFound' });
		await expect(
			db.insert(documentAttachments).values({
				documentId: doc.id,
				userId: admin,
				filename: 'forged',
				mediaType: file.mediaType,
				content,
				sizeBytes: content.length
			})
		).rejects.toThrow();
	});

	it('serializes concurrent uploads and rejects stale deletes without losing attachments', async () => {
		const doc = await sermon();
		const results = await Promise.all([
			mutateDocumentAttachment(db, owner, doc.id, 1, file),
			mutateDocumentAttachment(db, owner, doc.id, 1, file)
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.find((r) => !r.ok)).toEqual({
			ok: false,
			reason: 'conflict',
			currentRevision: 2
		});
		const [stored] = await listDocumentAttachments(db, owner, doc.id);
		expect(
			await mutateDocumentAttachment(db, owner, doc.id, 1, { type: 'remove', id: stored!.id })
		).toMatchObject({ ok: false, reason: 'conflict' });
		expect(
			await mutateDocumentAttachment(db, owner, doc.id, 2, { type: 'remove', id: stored!.id })
		).toEqual({ ok: true, revision: 3, attachments: [] });
		expect(await getDocumentAttachment(db, owner, doc.id, stored!.id)).toBeUndefined();
	});

	it('retains files through trash and type conversion while making them inaccessible until restored', async () => {
		const doc = await sermon();
		await mutateDocumentAttachment(db, owner, doc.id, 1, file);
		const [stored] = await listDocumentAttachments(db, owner, doc.id);
		await changeDocumentKind(db, owner, doc.id, 2, 'note');
		expect(await listDocumentAttachments(db, owner, doc.id)).toEqual([]);
		expect(await mutateDocumentAttachment(db, owner, doc.id, 3, file)).toEqual({
			ok: false,
			reason: 'notFound'
		});
		await changeDocumentKind(db, owner, doc.id, 3, 'sermon');
		expect((await getDocumentAttachment(db, owner, doc.id, stored!.id))?.content).toEqual(content);
		await softDeleteDocument(db, owner, doc.id, 4);
		expect(await getDocumentAttachment(db, owner, doc.id, stored!.id)).toBeUndefined();
		await restoreDocument(db, owner, doc.id, 5);
		expect((await getDocumentAttachment(db, owner, doc.id, stored!.id))?.content).toEqual(content);
		await db.delete(documents).where(eq(documents.id, doc.id));
		expect(
			await db
				.select({ id: documentAttachments.id })
				.from(documentAttachments)
				.where(eq(documentAttachments.documentId, doc.id))
		).toEqual([]);
	});

	it('enforces count, file size and filename limits without incrementing revisions on rejection', async () => {
		const doc = await sermon();
		for (const invalid of [
			{ ...file, filename: '\r\n' },
			{ ...file, filename: 'ä'.repeat(128) },
			{ ...file, content: Buffer.alloc(0) }
		]) {
			expect(await mutateDocumentAttachment(db, owner, doc.id, 1, invalid)).toEqual({
				ok: false,
				reason: 'invalidFile'
			});
		}
		expect(
			await mutateDocumentAttachment(db, owner, doc.id, 1, {
				...file,
				content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)
			})
		).toEqual({ ok: false, reason: 'fileTooLarge' });
		await db.insert(documentAttachments).values(
			Array.from({ length: MAX_DOCUMENT_ATTACHMENTS }, (_, i) => ({
				userId: owner,
				documentId: doc.id,
				filename: `${i}.bin`,
				mediaType: 'application/octet-stream',
				content,
				sizeBytes: content.length
			}))
		);
		expect(await mutateDocumentAttachment(db, owner, doc.id, 1, file)).toEqual({
			ok: false,
			reason: 'attachmentLimit'
		});
		expect((await getDocument(db, owner, doc.id))?.revision).toBe(1);
	});
});
