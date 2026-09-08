/** Compact derived Bible-reference data used by large private document libraries. */

import {
	and,
	desc,
	eq,
	exists,
	gt,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql
} from 'drizzle-orm';
import { documentBodyBibleReferenceIndex } from '../../notes/document-markdown.ts';
import {
	NOTE_LIBRARY_TIME_ZONE,
	type DocumentKind,
	type DocumentSource,
	type DocumentVisibility
} from '../../notes/documents.ts';
import type { Database } from '../db/client.ts';
import {
	documentBodyReferenceIndexes,
	documentPassages,
	documentTagLinks,
	documentTags,
	documents
} from '../db/schema.ts';

const BACKFILL_BATCH_SIZE = 100;
/** Increment whenever prose parsing changes so existing working copies are rescanned at startup. */
export const DOCUMENT_REFERENCE_PARSER_VERSION = 2;

/** Replace the projection in the same transaction that changes the authoritative document body. */
export async function syncDocumentBodyReferenceIndex(
	db: Database,
	userId: string,
	documentId: string,
	bodyHtml: string
): Promise<void> {
	const index = documentBodyBibleReferenceIndex(bodyHtml);
	await db
		.insert(documentBodyReferenceIndexes)
		.values({ documentId, userId, ...index, parserVersion: DOCUMENT_REFERENCE_PARSER_VERSION })
		.onConflictDoUpdate({
			target: documentBodyReferenceIndexes.documentId,
			set: { userId, ...index, parserVersion: DOCUMENT_REFERENCE_PARSER_VERSION }
		});
}

/** Refresh missing/outdated projections, including deleted notes and sermons, without editing bodies. */
export async function backfillDocumentBodyReferenceIndexes(
	db: Database,
	options: { force?: boolean } = {}
): Promise<number> {
	let indexed = 0;
	let afterId: string | undefined;
	while (true) {
		const batch = await db.transaction(async (tx) => {
			const pending = await tx
				.select({
					id: documents.id,
					userId: documents.userId,
					bodyHtml: documents.bodyHtml
				})
				.from(documents)
				.leftJoin(
					documentBodyReferenceIndexes,
					and(
						eq(documentBodyReferenceIndexes.documentId, documents.id),
						eq(documentBodyReferenceIndexes.userId, documents.userId)
					)
				)
				.where(
					and(
						afterId ? gt(documents.id, afterId) : undefined,
						options.force
							? undefined
							: or(
									isNull(documentBodyReferenceIndexes.documentId),
									lt(documentBodyReferenceIndexes.parserVersion, DOCUMENT_REFERENCE_PARSER_VERSION)
								)
					)
				)
				.orderBy(documents.id)
				.limit(BACKFILL_BATCH_SIZE)
				// Body writes and deletions use the same document lock: a scan cannot overwrite newer text's index.
				.for('update', { of: documents });
			if (pending.length === 0) return pending;

			await tx
				.insert(documentBodyReferenceIndexes)
				.values(
					pending.map((document) => {
						const index = documentBodyBibleReferenceIndex(document.bodyHtml);
						return {
							documentId: document.id,
							userId: document.userId,
							books: index.books,
							ranges: index.ranges,
							parserVersion: DOCUMENT_REFERENCE_PARSER_VERSION
						};
					})
				)
				.onConflictDoUpdate({
					target: documentBodyReferenceIndexes.documentId,
					set: {
						books: sql`excluded.books`,
						ranges: sql`excluded.ranges`,
						parserVersion: DOCUMENT_REFERENCE_PARSER_VERSION
					}
				});
			return pending;
		});
		if (batch.length === 0) return indexed;
		indexed += batch.length;
		afterId = batch.at(-1)!.id;
	}
}

export type DocumentLibraryIndexFilters = {
	kind?: DocumentKind;
	query?: string;
	normalizedTagPath?: string;
	deleted?: 'exclude' | 'only' | 'include';
};

export type DocumentLibraryIndexRow = {
	id: string;
	createdYear: number;
	books: number[];
	ranges: ReturnType<typeof documentBodyBibleReferenceIndex>['ranges'];
};

/**
 * Returns only the compact reference projection and sorted ids. A missing/stale projection is repaired in
 * memory for correctness during a rolling deployment, without writing from a GET request.
 */
export async function listDocumentLibraryIndex(
	db: Database,
	userId: string,
	filters: DocumentLibraryIndexFilters = {}
): Promise<DocumentLibraryIndexRow[]> {
	const conditions = [eq(documents.userId, userId)];
	if (filters.kind) conditions.push(eq(documents.kind, filters.kind));
	if (filters.deleted === 'only') conditions.push(isNotNull(documents.deletedAt));
	else if (filters.deleted !== 'include') conditions.push(isNull(documents.deletedAt));

	const query = filters.query?.trim();
	if (query) {
		const pattern = `%${query}%`;
		conditions.push(
			filters.normalizedTagPath
				? or(ilike(documents.title, pattern), ilike(documents.plainText, pattern))!
				: or(
						ilike(documents.title, pattern),
						ilike(documents.plainText, pattern),
						exists(
							db
								.select({ id: documentTagLinks.tagId })
								.from(documentTagLinks)
								.innerJoin(documentTags, eq(documentTags.id, documentTagLinks.tagId))
								.where(
									and(
										eq(documentTagLinks.documentId, documents.id),
										eq(documentTags.userId, userId),
										ilike(documentTags.path, pattern)
									)
								)
						)
					)!
		);
	}
	if (filters.normalizedTagPath) {
		const normalized = filters.normalizedTagPath;
		conditions.push(
			exists(
				db
					.select({ id: documentTagLinks.tagId })
					.from(documentTagLinks)
					.innerJoin(documentTags, eq(documentTags.id, documentTagLinks.tagId))
					.where(
						and(
							eq(documentTagLinks.documentId, documents.id),
							eq(documentTags.userId, userId),
							sql`(${documentTags.normalizedPath} = ${normalized}
								or left(${documentTags.normalizedPath}, char_length(${normalized}::text) + 1) = ${`${normalized}/`})`
						)
					)
			)
		);
	}

	const rows = await db
		.select({
			id: documents.id,
			createdYear: sql<number>`extract(year from ${documents.createdAt} at time zone ${NOTE_LIBRARY_TIME_ZONE})::integer`,
			books: documentBodyReferenceIndexes.books,
			ranges: documentBodyReferenceIndexes.ranges,
			fallbackBodyHtml: sql<string | null>`case
				when ${documentBodyReferenceIndexes.documentId} is null then ${documents.bodyHtml}
				else null
			end`
		})
		.from(documents)
		.leftJoin(
			documentBodyReferenceIndexes,
			and(
				eq(documentBodyReferenceIndexes.documentId, documents.id),
				eq(documentBodyReferenceIndexes.userId, documents.userId),
				eq(documentBodyReferenceIndexes.parserVersion, DOCUMENT_REFERENCE_PARSER_VERSION)
			)
		)
		.where(and(...conditions))
		.orderBy(desc(documents.createdAt), desc(documents.id));

	return rows.map((row) => {
		const fallback = row.fallbackBodyHtml
			? documentBodyBibleReferenceIndex(row.fallbackBodyHtml)
			: { books: [], ranges: [] };
		return {
			id: row.id,
			createdYear: row.createdYear,
			books: row.books ?? fallback.books,
			ranges: row.ranges ?? fallback.ranges
		};
	});
}

export type DocumentAnchorReferenceIndexRow = {
	documentId: string;
	resourceId: string | null;
	startBook: number;
	endBook: number;
	startKey: number;
	endKey: number;
};

/** Owner-scoped explicit anchors, projected without loading any document body. */
export async function listDocumentAnchorReferenceIndex(
	db: Database,
	userId: string,
	filters: { kind?: DocumentKind; deleted?: 'exclude' | 'only' | 'include' } = {}
): Promise<DocumentAnchorReferenceIndexRow[]> {
	const conditions = [eq(documents.userId, userId)];
	if (filters.kind) conditions.push(eq(documents.kind, filters.kind));
	if (filters.deleted === 'only') conditions.push(isNotNull(documents.deletedAt));
	else if (filters.deleted !== 'include') conditions.push(isNull(documents.deletedAt));

	return db
		.select({
			documentId: documentPassages.documentId,
			resourceId: documentPassages.resourceId,
			startBook: documentPassages.startBookId,
			endBook: documentPassages.endBookId,
			startKey: documentPassages.startKey,
			endKey: documentPassages.endKey
		})
		.from(documentPassages)
		.innerJoin(documents, eq(documents.id, documentPassages.documentId))
		.where(and(...conditions));
}

export type DocumentLibrarySummary = {
	id: string;
	kind: DocumentKind;
	title: string;
	plainText: string;
	visibility: DocumentVisibility;
	revision: number;
	source: DocumentSource;
	createdAt: Date;
	updatedAt: Date;
};

/** Loads preview text only for the ids on the requested library page. */
export async function listDocumentLibrarySummaries(
	db: Database,
	userId: string,
	documentIds: string[]
): Promise<DocumentLibrarySummary[]> {
	if (documentIds.length === 0) return [];
	return db
		.select({
			id: documents.id,
			kind: documents.kind,
			title: documents.title,
			plainText: sql<string>`left(regexp_replace(${documents.plainText}, ${'\\s+'}, ' ', 'g'), 181)`,
			visibility: documents.visibility,
			revision: documents.revision,
			source: documents.source,
			createdAt: documents.createdAt,
			updatedAt: documents.updatedAt
		})
		.from(documents)
		.where(and(eq(documents.userId, userId), inArray(documents.id, documentIds)));
}
