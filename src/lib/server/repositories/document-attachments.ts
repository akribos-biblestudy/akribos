import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
	MAX_ATTACHMENT_BYTES,
	MAX_DOCUMENT_ATTACHMENT_BYTES,
	MAX_DOCUMENT_ATTACHMENTS
} from '../../notes/attachments.ts';
import type { Database } from '../db/client.ts';
import { documentAttachments as attachments, documents } from '../db/schema.ts';

const metadata = {
	id: attachments.id,
	filename: attachments.filename,
	mediaType: attachments.mediaType,
	sizeBytes: attachments.sizeBytes,
	createdAt: attachments.createdAt
};
const ownedSermon = (userId: string, documentId: string) =>
	and(
		eq(documents.id, documentId),
		eq(documents.userId, userId),
		eq(documents.kind, 'sermon'),
		isNull(documents.deletedAt)
	);
const ownedFiles = (userId: string, documentId: string) =>
	and(eq(attachments.userId, userId), eq(attachments.documentId, documentId));

export async function listDocumentAttachments(db: Database, userId: string, documentId: string) {
	return db
		.select(metadata)
		.from(attachments)
		.innerJoin(
			documents,
			and(eq(documents.id, attachments.documentId), ownedSermon(userId, documentId))
		)
		.where(ownedFiles(userId, documentId))
		.orderBy(asc(attachments.createdAt), asc(attachments.id));
}

export async function getDocumentAttachment(
	db: Database,
	userId: string,
	documentId: string,
	id: string
) {
	const [file] = await db
		.select({ ...metadata, content: attachments.content })
		.from(attachments)
		.innerJoin(
			documents,
			and(eq(documents.id, attachments.documentId), ownedSermon(userId, documentId))
		)
		.where(and(ownedFiles(userId, documentId), eq(attachments.id, id)))
		.limit(1);
	return file;
}

type Mutation =
	| { type: 'add'; filename: string; mediaType: string; content: Buffer }
	| { type: 'remove'; id: string };
export type AttachmentMutationResult =
	| { ok: true; revision: number; attachments: Awaited<ReturnType<typeof listDocumentAttachments>> }
	| { ok: false; reason: 'notFound' | 'invalidFile' | 'fileTooLarge' | 'attachmentLimit' }
	| { ok: false; reason: 'conflict'; currentRevision: number };

/** The shared document lock serializes size/count checks, metadata, bytes and revision together. */
export async function mutateDocumentAttachment(
	db: Database,
	userId: string,
	documentId: string,
	revision: number,
	mutation: Mutation
): Promise<AttachmentMutationResult> {
	return db.transaction(async (tx) => {
		const [document] = await tx
			.select({ revision: documents.revision })
			.from(documents)
			.where(ownedSermon(userId, documentId))
			.for('update');
		if (!document) return { ok: false, reason: 'notFound' };
		if (document.revision !== revision)
			return { ok: false, reason: 'conflict', currentRevision: document.revision };
		if (mutation.type === 'add') {
			// Names are labels, never paths. Bound the UTF-8 storage/header size as well as file bytes.
			const filename = mutation.filename
				.toWellFormed()
				.normalize('NFC')
				.split(/[/\\]/u)
				.at(-1)!
				.replace(/\p{Cc}/gu, '')
				.trim();
			if (
				!filename ||
				filename === '.' ||
				filename === '..' ||
				Buffer.byteLength(filename) > 255 ||
				!mutation.content.length
			)
				return { ok: false, reason: 'invalidFile' };
			if (mutation.content.length > MAX_ATTACHMENT_BYTES)
				return { ok: false, reason: 'fileTooLarge' };
			const [usage] = await tx
				.select({
					count: sql<number>`count(*)::integer`,
					bytes: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::integer`
				})
				.from(attachments)
				.where(ownedFiles(userId, documentId));
			if (
				usage!.count >= MAX_DOCUMENT_ATTACHMENTS ||
				usage!.bytes + mutation.content.length > MAX_DOCUMENT_ATTACHMENT_BYTES
			)
				return { ok: false, reason: 'attachmentLimit' };
			const mediaType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(mutation.mediaType)
				? mutation.mediaType.toLowerCase()
				: 'application/octet-stream';
			await tx.insert(attachments).values({
				userId,
				documentId,
				filename,
				mediaType,
				sizeBytes: mutation.content.length,
				content: mutation.content
			});
		} else {
			const removed = await tx
				.delete(attachments)
				.where(and(ownedFiles(userId, documentId), eq(attachments.id, mutation.id)))
				.returning({ id: attachments.id });
			if (!removed.length) return { ok: false, reason: 'notFound' };
		}
		const nextRevision = document.revision + 1;
		await tx
			.update(documents)
			.set({ revision: nextRevision, updatedAt: new Date() })
			.where(ownedSermon(userId, documentId));
		return {
			ok: true,
			revision: nextRevision,
			attachments: await listDocumentAttachments(tx as unknown as Database, userId, documentId)
		};
	});
}
