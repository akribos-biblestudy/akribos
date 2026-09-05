import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DocumentKind } from '../../notes/documents.ts';
import { documentLinkTargetIds } from '../../notes/document-links.ts';
import type { Database } from '../db/client.ts';
import { documentLinks, documents } from '../db/schema.ts';

export type DocumentRelationSummary = {
	id: string;
	title: string;
	kind: DocumentKind;
	updatedAt: Date;
	deleted: boolean;
};

/** Replaces the derived link index after the Markdown body changes. Unknown and foreign ids vanish. */
export async function syncDocumentLinks(
	db: Database,
	userId: string,
	sourceDocumentId: string,
	markdown: string
): Promise<void> {
	await db
		.delete(documentLinks)
		.where(
			and(eq(documentLinks.userId, userId), eq(documentLinks.sourceDocumentId, sourceDocumentId))
		);
	const candidates = documentLinkTargetIds(markdown).filter((id) => id !== sourceDocumentId);
	if (candidates.length === 0) return;
	const targets = await db
		.select({ id: documents.id })
		.from(documents)
		.where(and(eq(documents.userId, userId), inArray(documents.id, candidates)));
	if (targets.length === 0) return;
	await db.insert(documentLinks).values(
		targets.map((target) => ({
			userId,
			sourceDocumentId,
			targetDocumentId: target.id
		}))
	);
}

/** Lists both directions with live titles; deleted outgoing targets remain visible but unavailable. */
export async function listDocumentRelations(
	db: Database,
	userId: string,
	documentId: string
): Promise<{ outgoing: DocumentRelationSummary[]; incoming: DocumentRelationSummary[] }> {
	const outgoingDocument = alias(documents, 'outgoing_document');
	const incomingDocument = alias(documents, 'incoming_document');
	const [outgoing, incoming] = await Promise.all([
		db
			.select({
				id: outgoingDocument.id,
				title: outgoingDocument.title,
				kind: outgoingDocument.kind,
				updatedAt: outgoingDocument.updatedAt,
				deletedAt: outgoingDocument.deletedAt
			})
			.from(documentLinks)
			.innerJoin(
				outgoingDocument,
				and(
					eq(outgoingDocument.id, documentLinks.targetDocumentId),
					eq(outgoingDocument.userId, documentLinks.userId)
				)
			)
			.where(and(eq(documentLinks.userId, userId), eq(documentLinks.sourceDocumentId, documentId)))
			.orderBy(desc(outgoingDocument.updatedAt), outgoingDocument.title),
		db
			.select({
				id: incomingDocument.id,
				title: incomingDocument.title,
				kind: incomingDocument.kind,
				updatedAt: incomingDocument.updatedAt,
				deletedAt: incomingDocument.deletedAt
			})
			.from(documentLinks)
			.innerJoin(
				incomingDocument,
				and(
					eq(incomingDocument.id, documentLinks.sourceDocumentId),
					eq(incomingDocument.userId, documentLinks.userId)
				)
			)
			.where(
				and(
					eq(documentLinks.userId, userId),
					eq(documentLinks.targetDocumentId, documentId),
					isNull(incomingDocument.deletedAt)
				)
			)
			.orderBy(desc(incomingDocument.updatedAt), incomingDocument.title)
	]);
	const map = (row: (typeof outgoing)[number]): DocumentRelationSummary => ({
		id: row.id,
		title: row.title,
		kind: row.kind,
		updatedAt: row.updatedAt,
		deleted: row.deletedAt !== null
	});
	return { outgoing: outgoing.map(map), incoming: incoming.map(map) };
}
