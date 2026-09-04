/**
 * Private document working copies and their Bible passage anchors.
 *
 * Every user-scoped operation includes the owner in its database predicate. A UUID is therefore
 * never an authority token: another user's document is indistinguishable from a missing one. Public
 * published reads live separately in `document-publications.ts` and never use this mutable table.
 */

import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { passageFromDbEndpoints, passageToDbEndpoints } from '../../bible/passage.ts';
import {
	isDocumentKind,
	isDocumentPassageCountAllowed,
	isDocumentSource,
	isDocumentVisibility,
	isSermonWorkflowState,
	isValidDocumentMarkdown,
	isValidDocumentTitle,
	normalizeDocumentTitle,
	type DocumentKind,
	type DocumentSource,
	type DocumentVisibility,
	type SermonWorkflowState
} from '../../notes/documents.ts';
import type { Database } from '../db/client.ts';
import {
	documentPassages,
	documentPublications,
	documents,
	resources,
	verseComments,
	type Document,
	type DocumentPassage
} from '../db/schema.ts';

export type { DocumentKind, DocumentSource, DocumentVisibility, SermonWorkflowState };

export type PreparedDocumentBody = {
	bodyMarkdown: string;
	bodyHtml: string;
	plainText: string;
};

export type CreateDocumentInput = PreparedDocumentBody & {
	kind: DocumentKind;
	title: string;
	visibility?: DocumentVisibility;
	source?: DocumentSource;
	sourceFilename?: string | null;
	legacyVerseCommentId?: string | null;
	sermonStatus?: SermonWorkflowState | null;
	sermonDate?: Date | null;
	sermonSeries?: string | null;
};

export type UpdateDocumentInput = {
	title?: string;
	visibility?: DocumentVisibility;
	body?: PreparedDocumentBody;
	sermonStatus?: SermonWorkflowState | null;
	sermonDate?: Date | null;
	sermonSeries?: string | null;
};

export type DocumentMutationResult =
	| { ok: true; document: Document }
	| { ok: false; reason: 'notFound' }
	| { ok: false; reason: 'conflict'; currentRevision: number };

export type DocumentRevisionResult =
	| { ok: true; revision: number }
	| { ok: false; reason: 'notFound' }
	| { ok: false; reason: 'conflict'; currentRevision: number }
	| { ok: false; reason: 'invalidResource'; resourceId: string };

export type DocumentPassageInput = Pick<
	DocumentPassage,
	| 'startBookId'
	| 'startChapter'
	| 'startVerse'
	| 'endBookId'
	| 'endChapter'
	| 'endVerse'
	| 'startKey'
	| 'endKey'
> & {
	resourceId?: string | null;
	position?: number;
};

export class InvalidDocumentInputError extends Error {
	readonly code:
		| 'title'
		| 'body'
		| 'kind'
		| 'visibility'
		| 'source'
		| 'legacySource'
		| 'sermonFields'
		| 'filename'
		| 'passage';

	constructor(code: InvalidDocumentInputError['code'], message: string) {
		super(message);
		this.name = 'InvalidDocumentInputError';
		this.code = code;
	}
}

function cleanTitle(title: string): string {
	const clean = normalizeDocumentTitle(title);
	if (!isValidDocumentTitle(clean)) {
		throw new InvalidDocumentInputError('title', 'document title is empty or too long');
	}
	return clean;
}

function validateBody(body: PreparedDocumentBody): void {
	if (!isValidDocumentMarkdown(body.bodyMarkdown)) {
		throw new InvalidDocumentInputError('body', 'document Markdown is invalid or too large');
	}
}

function cleanSourceFilename(filename: string | null | undefined): string | null {
	if (filename == null) return null;
	const clean = filename.trim();
	if (!clean) return null;
	if (clean.includes('/') || clean.includes('\\') || clean === '.' || clean === '..') {
		throw new InvalidDocumentInputError('filename', 'source filename must be a basename');
	}
	return clean;
}

function cleanOptionalText(value: string | null | undefined): string | null {
	if (value == null) return null;
	return value.trim() || null;
}

function validateCreateInput(input: CreateDocumentInput): void {
	if (!isDocumentKind(input.kind)) {
		throw new InvalidDocumentInputError('kind', 'unknown document kind');
	}
	if (input.visibility && !isDocumentVisibility(input.visibility)) {
		throw new InvalidDocumentInputError('visibility', 'unknown document visibility');
	}
	const source = input.source ?? 'native';
	if (!isDocumentSource(source)) {
		throw new InvalidDocumentInputError('source', 'unknown document source');
	}
	if ((source === 'legacy-verse-comment') !== Boolean(input.legacyVerseCommentId)) {
		throw new InvalidDocumentInputError(
			'legacySource',
			'legacy source and legacy verse-comment id must be set together'
		);
	}
	if (input.kind === 'sermon') {
		if (input.sermonStatus != null && !isSermonWorkflowState(input.sermonStatus)) {
			throw new InvalidDocumentInputError('sermonFields', 'unknown sermon status');
		}
	} else if (input.sermonStatus != null || input.sermonDate != null || input.sermonSeries != null) {
		throw new InvalidDocumentInputError(
			'sermonFields',
			'sermon metadata is only valid for sermon documents'
		);
	}
	validateBody(input);
}

/** Creates a private working copy. Prepared Markdown derivatives are stored without reinterpretation. */
export async function createDocument(
	db: Database,
	userId: string,
	input: CreateDocumentInput
): Promise<Document> {
	validateCreateInput(input);
	const [document] = await db
		.insert(documents)
		.values({
			userId,
			kind: input.kind,
			title: cleanTitle(input.title),
			bodyMarkdown: input.bodyMarkdown,
			bodyHtml: input.bodyHtml,
			plainText: input.plainText,
			visibility: input.visibility ?? 'private',
			source: input.source ?? 'native',
			sourceFilename: cleanSourceFilename(input.sourceFilename),
			legacyVerseCommentId: input.legacyVerseCommentId ?? null,
			sermonStatus: input.kind === 'sermon' ? (input.sermonStatus ?? 'idea') : null,
			sermonDate: input.kind === 'sermon' ? (input.sermonDate ?? null) : null,
			sermonSeries: input.kind === 'sermon' ? cleanOptionalText(input.sermonSeries) : null
		})
		.returning();
	return document!;
}

type InitialPassageFailure = Exclude<DocumentRevisionResult, { ok: true }>;

export type CreateDocumentWithPassagesResult =
	{ ok: true; document: Document } | InitialPassageFailure;

class InitialPassagePersistenceError extends Error {
	readonly result: InitialPassageFailure;

	constructor(result: InitialPassageFailure) {
		super(`initial document passages failed: ${result.reason}`);
		this.name = 'InitialPassagePersistenceError';
		this.result = result;
	}
}

/** Creates a working copy and its initial anchors as one all-or-nothing persistence operation. */
export async function createDocumentWithPassages(
	db: Database,
	userId: string,
	input: CreateDocumentInput,
	passages: DocumentPassageInput[]
): Promise<CreateDocumentWithPassagesResult> {
	try {
		const document = await db.transaction(async (transaction) => {
			// `replaceDocumentPassages` owns its own transaction for standalone calls. postgres-js maps
			// that nested transaction to a savepoint inside this creation boundary.
			const transactionDb = transaction as unknown as Database;
			const created = await createDocument(transactionDb, userId, input);
			if (passages.length === 0) return created;
			const attached = await replaceDocumentPassages(
				transactionDb,
				userId,
				created.id,
				passages,
				created.revision
			);
			if (!attached.ok) throw new InitialPassagePersistenceError(attached);
			return { ...created, revision: attached.revision };
		});
		return { ok: true, document };
	} catch (caught) {
		if (caught instanceof InitialPassagePersistenceError) return caught.result;
		throw caught;
	}
}

/** Returns only an owned document; deleted working copies stay hidden unless explicitly requested. */
export async function getDocument(
	db: Database,
	userId: string,
	documentId: string,
	options: { includeDeleted?: boolean } = {}
): Promise<Document | undefined> {
	const conditions = [eq(documents.id, documentId), eq(documents.userId, userId)];
	if (!options.includeDeleted) conditions.push(isNull(documents.deletedAt));
	const [document] = await db
		.select()
		.from(documents)
		.where(and(...conditions))
		.limit(1);
	return document;
}

export type ListDocumentFilters = {
	kind?: DocumentKind;
	visibility?: DocumentVisibility;
	query?: string;
	deleted?: 'exclude' | 'only' | 'include';
};

/** Lists one owner's working copies, newest first. */
export async function listDocuments(
	db: Database,
	userId: string,
	filters: ListDocumentFilters = {}
): Promise<Document[]> {
	const conditions = [eq(documents.userId, userId)];
	if (filters.kind) conditions.push(eq(documents.kind, filters.kind));
	if (filters.visibility) conditions.push(eq(documents.visibility, filters.visibility));
	if (filters.deleted === 'only') conditions.push(isNotNull(documents.deletedAt));
	else if (filters.deleted !== 'include') conditions.push(isNull(documents.deletedAt));

	const query = filters.query?.trim();
	if (query) {
		const pattern = `%${query}%`;
		conditions.push(or(ilike(documents.title, pattern), ilike(documents.plainText, pattern))!);
	}

	return db
		.select()
		.from(documents)
		.where(and(...conditions))
		.orderBy(desc(documents.updatedAt), desc(documents.id));
}

/**
 * Updates a working copy only when the caller still holds its current revision. Content derivatives
 * travel as one object so Markdown, rendered HTML and search text cannot be updated independently.
 */
export async function updateDocument(
	db: Database,
	userId: string,
	documentId: string,
	expectedRevision: number,
	input: UpdateDocumentInput
): Promise<DocumentMutationResult> {
	const current = await getDocument(db, userId, documentId);
	if (!current) return { ok: false, reason: 'notFound' };
	if (current.revision !== expectedRevision) {
		return { ok: false, reason: 'conflict', currentRevision: current.revision };
	}

	if (input.visibility && !isDocumentVisibility(input.visibility)) {
		throw new InvalidDocumentInputError('visibility', 'unknown document visibility');
	}
	if (current.kind !== 'sermon') {
		if (
			input.sermonStatus !== undefined ||
			input.sermonDate !== undefined ||
			input.sermonSeries !== undefined
		) {
			throw new InvalidDocumentInputError(
				'sermonFields',
				'sermon metadata is only valid for sermon documents'
			);
		}
	} else if (
		input.sermonStatus !== undefined &&
		(input.sermonStatus == null || !isSermonWorkflowState(input.sermonStatus))
	) {
		throw new InvalidDocumentInputError('sermonFields', 'a sermon must have a valid status');
	}

	const changes: PgUpdateSetSource<typeof documents> = {
		updatedAt: new Date(),
		revision: sql`${documents.revision} + 1`
	};
	if (input.title !== undefined) changes.title = cleanTitle(input.title);
	if (input.visibility !== undefined) changes.visibility = input.visibility;
	if (input.body !== undefined) {
		validateBody(input.body);
		changes.bodyMarkdown = input.body.bodyMarkdown;
		changes.bodyHtml = input.body.bodyHtml;
		changes.plainText = input.body.plainText;
	}
	if (current.kind === 'sermon') {
		if (input.sermonStatus !== undefined) changes.sermonStatus = input.sermonStatus;
		if (input.sermonDate !== undefined) changes.sermonDate = input.sermonDate;
		if (input.sermonSeries !== undefined) {
			changes.sermonSeries = cleanOptionalText(input.sermonSeries);
		}
	}

	const [document] = await db
		.update(documents)
		.set(changes)
		.where(
			and(
				eq(documents.id, documentId),
				eq(documents.userId, userId),
				eq(documents.revision, expectedRevision),
				isNull(documents.deletedAt)
			)
		)
		.returning();
	if (document) return { ok: true, document };

	const latest = await getDocument(db, userId, documentId);
	return latest
		? { ok: false, reason: 'conflict', currentRevision: latest.revision }
		: { ok: false, reason: 'notFound' };
}

async function currentOwnedRevision(
	db: Pick<Database, 'select'>,
	userId: string,
	documentId: string,
	includeDeleted = false,
	lockForUpdate = false
): Promise<number | undefined> {
	const conditions = [eq(documents.id, documentId), eq(documents.userId, userId)];
	if (!includeDeleted) conditions.push(isNull(documents.deletedAt));
	const query = db
		.select({ revision: documents.revision })
		.from(documents)
		.where(and(...conditions))
		.limit(1);
	const [row] = lockForUpdate ? await query.for('update') : await query;
	return row?.revision;
}

/** Soft deletion also unpublishes atomically; restoring never republishes stale content. */
export async function softDeleteDocument(
	db: Database,
	userId: string,
	documentId: string,
	expectedRevision?: number
): Promise<DocumentRevisionResult> {
	return db.transaction(async (tx) => {
		const currentRevision = await currentOwnedRevision(tx, userId, documentId, false, true);
		if (currentRevision === undefined) return { ok: false, reason: 'notFound' };
		if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
			return { ok: false, reason: 'conflict', currentRevision };
		}

		const [row] = await tx
			.update(documents)
			.set({
				deletedAt: new Date(),
				updatedAt: new Date(),
				revision: sql`${documents.revision} + 1`
			})
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.userId, userId),
					eq(documents.revision, currentRevision),
					isNull(documents.deletedAt)
				)
			)
			.returning({ revision: documents.revision });
		if (!row) return { ok: false, reason: 'conflict', currentRevision };
		await tx.delete(documentPublications).where(eq(documentPublications.documentId, documentId));
		return { ok: true, revision: row.revision };
	});
}

/** Restores an owned soft-deleted working copy, but not any old publication snapshot. */
export async function restoreDocument(
	db: Database,
	userId: string,
	documentId: string,
	expectedRevision?: number
): Promise<DocumentRevisionResult> {
	const currentRevision = await currentOwnedRevision(db, userId, documentId, true);
	if (currentRevision === undefined) return { ok: false, reason: 'notFound' };
	if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
		return { ok: false, reason: 'conflict', currentRevision };
	}

	const [row] = await db
		.update(documents)
		.set({
			deletedAt: null,
			updatedAt: new Date(),
			revision: sql`${documents.revision} + 1`
		})
		.where(
			and(
				eq(documents.id, documentId),
				eq(documents.userId, userId),
				eq(documents.revision, currentRevision),
				isNotNull(documents.deletedAt)
			)
		)
		.returning({ revision: documents.revision });
	return row
		? { ok: true, revision: row.revision }
		: { ok: false, reason: 'conflict', currentRevision };
}

function validatePassage(passage: DocumentPassageInput): void {
	if (
		passageFromDbEndpoints(passage) === null ||
		(passage.position !== undefined &&
			(!Number.isInteger(passage.position) || passage.position < 0))
	) {
		throw new InvalidDocumentInputError(
			'passage',
			'passage coordinates, keys or order are invalid'
		);
	}
}

async function invalidPublicBible(
	db: Pick<Database, 'select'>,
	resourceIds: string[]
): Promise<string | undefined> {
	if (resourceIds.length === 0) return undefined;
	const rows = await db
		.select({ id: resources.id })
		.from(resources)
		.where(
			and(
				inArray(resources.id, resourceIds),
				eq(resources.kind, 'bible'),
				eq(resources.isPublic, true),
				eq(resources.status, 'ready')
			)
		);
	const valid = new Set(rows.map((row) => row.id));
	return resourceIds.find((id) => !valid.has(id));
}

/** Historical comments keep their exact translation even when that Bible is currently hidden/draft. */
async function invalidExistingBible(
	db: Pick<Database, 'select'>,
	resourceIds: string[]
): Promise<string | undefined> {
	if (resourceIds.length === 0) return undefined;
	const rows = await db
		.select({ id: resources.id })
		.from(resources)
		.where(and(inArray(resources.id, resourceIds), eq(resources.kind, 'bible')));
	const valid = new Set(rows.map((row) => row.id));
	return resourceIds.find((id) => !valid.has(id));
}

/**
 * Replaces all anchors in one transaction and increments the working-copy revision. Non-null
 * resources must be public, ready Bible resources; `null` deliberately means translation-neutral.
 */
export async function replaceDocumentPassages(
	db: Database,
	userId: string,
	documentId: string,
	passages: DocumentPassageInput[],
	expectedRevision?: number
): Promise<DocumentRevisionResult> {
	if (!isDocumentPassageCountAllowed(passages.length)) {
		throw new InvalidDocumentInputError('passage', 'document has too many passage anchors');
	}
	for (const passage of passages) validatePassage(passage);
	const resourceIds = [
		...new Set(passages.flatMap((passage) => (passage.resourceId ? [passage.resourceId] : [])))
	];

	return db.transaction(async (tx) => {
		const currentRevision = await currentOwnedRevision(tx, userId, documentId, false, true);
		if (currentRevision === undefined) return { ok: false, reason: 'notFound' };
		if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
			return { ok: false, reason: 'conflict', currentRevision };
		}

		const invalidResource = await invalidPublicBible(tx, resourceIds);
		if (invalidResource) {
			return { ok: false, reason: 'invalidResource', resourceId: invalidResource };
		}

		await tx.delete(documentPassages).where(eq(documentPassages.documentId, documentId));
		if (passages.length > 0) {
			await tx.insert(documentPassages).values(
				passages.map((passage, index) => ({
					documentId,
					resourceId: passage.resourceId ?? null,
					startBookId: passage.startBookId,
					startChapter: passage.startChapter,
					startVerse: passage.startVerse,
					endBookId: passage.endBookId,
					endChapter: passage.endChapter,
					endVerse: passage.endVerse,
					startKey: passage.startKey,
					endKey: passage.endKey,
					position: passage.position ?? index
				}))
			);
		}

		const [updated] = await tx
			.update(documents)
			.set({ updatedAt: new Date(), revision: sql`${documents.revision} + 1` })
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.userId, userId),
					eq(documents.revision, currentRevision),
					isNull(documents.deletedAt)
				)
			)
			.returning({ revision: documents.revision });
		if (!updated) throw new Error('document changed while replacing its passages');
		return { ok: true, revision: updated.revision };
	});
}

/** Passage anchors are private too, so ownership is resolved in the same query. */
export async function listDocumentPassages(
	db: Database,
	userId: string,
	documentId: string
): Promise<DocumentPassage[]> {
	return db
		.select({
			id: documentPassages.id,
			documentId: documentPassages.documentId,
			resourceId: documentPassages.resourceId,
			startBookId: documentPassages.startBookId,
			startChapter: documentPassages.startChapter,
			startVerse: documentPassages.startVerse,
			endBookId: documentPassages.endBookId,
			endChapter: documentPassages.endChapter,
			endVerse: documentPassages.endVerse,
			startKey: documentPassages.startKey,
			endKey: documentPassages.endKey,
			position: documentPassages.position,
			createdAt: documentPassages.createdAt
		})
		.from(documentPassages)
		.innerJoin(
			documents,
			and(
				eq(documents.id, documentPassages.documentId),
				eq(documents.userId, userId),
				isNull(documents.deletedAt)
			)
		)
		.where(eq(documentPassages.documentId, documentId))
		.orderBy(documentPassages.position, documentPassages.id);
}

export type PassageOverlapQuery = {
	startKey: number;
	endKey: number;
	/** Omitted: any anchor; null: canonical only; id: canonical anchors plus this translation. */
	resourceId?: string | null;
	kind?: DocumentKind;
	deleted?: 'exclude' | 'only' | 'include';
};

/** Finds owned working copies with at least one inclusive overlapping passage. */
export async function findDocumentsOverlappingPassage(
	db: Database,
	userId: string,
	query: PassageOverlapQuery
): Promise<Document[]> {
	if (query.startKey > query.endKey) {
		throw new InvalidDocumentInputError('passage', 'overlap query starts after it ends');
	}
	const conditions = [
		eq(documents.userId, userId),
		lte(documentPassages.startKey, query.endKey),
		gte(documentPassages.endKey, query.startKey)
	];
	if (query.deleted === 'only') conditions.push(isNotNull(documents.deletedAt));
	else if (query.deleted !== 'include') conditions.push(isNull(documents.deletedAt));
	if (query.kind) conditions.push(eq(documents.kind, query.kind));
	if (query.resourceId === null) conditions.push(isNull(documentPassages.resourceId));
	else if (query.resourceId !== undefined) {
		conditions.push(
			or(isNull(documentPassages.resourceId), eq(documentPassages.resourceId, query.resourceId))!
		);
	}

	return db
		.selectDistinct({
			id: documents.id,
			userId: documents.userId,
			kind: documents.kind,
			title: documents.title,
			bodyMarkdown: documents.bodyMarkdown,
			bodyHtml: documents.bodyHtml,
			plainText: documents.plainText,
			visibility: documents.visibility,
			revision: documents.revision,
			source: documents.source,
			sourceFilename: documents.sourceFilename,
			legacyVerseCommentId: documents.legacyVerseCommentId,
			sermonStatus: documents.sermonStatus,
			sermonDate: documents.sermonDate,
			sermonSeries: documents.sermonSeries,
			deletedAt: documents.deletedAt,
			createdAt: documents.createdAt,
			updatedAt: documents.updatedAt
		})
		.from(documents)
		.innerJoin(documentPassages, eq(documentPassages.documentId, documents.id))
		.where(and(...conditions))
		.orderBy(desc(documents.updatedAt), desc(documents.id));
}

/**
 * Moves translation-specific anchors before a Bible resource is deleted. Publication JSON is a
 * historical snapshot and intentionally does not change; affected working-copy revisions do.
 */
export async function transferDocumentPassagesToBible(
	db: Database,
	sourceResourceId: string,
	targetResourceId: string
): Promise<number> {
	if (sourceResourceId === targetResourceId) throw new Error('replacement Bible must be different');
	return db.transaction(async (tx) => {
		const [source, target] = await Promise.all([
			tx
				.select({ id: resources.id, kind: resources.kind })
				.from(resources)
				.where(eq(resources.id, sourceResourceId))
				.limit(1),
			tx
				.select({
					id: resources.id,
					kind: resources.kind,
					isPublic: resources.isPublic,
					status: resources.status
				})
				.from(resources)
				.where(eq(resources.id, targetResourceId))
				.limit(1)
		]);
		if (source[0]?.kind !== 'bible') throw new Error('source Bible not found');
		if (target[0]?.kind !== 'bible' || !target[0].isPublic || target[0].status !== 'ready') {
			throw new Error('replacement must be a public, ready Bible');
		}

		const sourcePassages = await tx
			.select({ documentId: documentPassages.documentId })
			.from(documentPassages)
			.where(eq(documentPassages.resourceId, sourceResourceId));
		const documentIds = [...new Set(sourcePassages.map((row) => row.documentId))];
		if (documentIds.length > 0) {
			// Publication takes the same parent locks before reading its snapshot children. Lock every
			// affected parent first so it sees either all old anchors or the complete transfer.
			await tx
				.select({ id: documents.id })
				.from(documents)
				.where(inArray(documents.id, documentIds))
				.orderBy(documents.id)
				.for('update');
			await tx.execute(sql`
				update document_passages as destination
				set position = least(destination.position, source_ranges.position)
				from (
					select document_id, start_key, end_key, min(position) as position
					from document_passages
					where resource_id = ${sourceResourceId}
					group by document_id, start_key, end_key
				) as source_ranges
				where destination.resource_id = ${targetResourceId}
					and destination.document_id = source_ranges.document_id
					and destination.start_key = source_ranges.start_key
					and destination.end_key = source_ranges.end_key
			`);
			await tx.execute(sql`
				delete from document_passages as source
				where source.resource_id = ${sourceResourceId}
					and exists (
						select 1 from document_passages as destination
						where destination.resource_id = ${targetResourceId}
							and destination.document_id = source.document_id
							and destination.start_key = source.start_key
							and destination.end_key = source.end_key
					)
			`);
			await tx
				.update(documentPassages)
				.set({ resourceId: targetResourceId })
				.where(eq(documentPassages.resourceId, sourceResourceId));
			await tx
				.update(documents)
				.set({ updatedAt: new Date(), revision: sql`${documents.revision} + 1` })
				.where(inArray(documents.id, documentIds));
		}
		return sourcePassages.length;
	});
}

export type PendingLegacyVerseComment = {
	id: string;
	userId: string;
	resourceId: string;
	bookId: number;
	chapter: number;
	verse: number;
	commentHtml: string;
	createdAt: Date;
	updatedAt: Date;
};

/** Bounded batch for a resumable backfill; already-provenanced comments are excluded. */
export async function listPendingLegacyVerseComments(
	db: Database,
	limit = 500
): Promise<PendingLegacyVerseComment[]> {
	return db
		.select({
			id: verseComments.id,
			userId: verseComments.userId,
			resourceId: verseComments.resourceId,
			bookId: verseComments.bookId,
			chapter: verseComments.chapter,
			verse: verseComments.verse,
			commentHtml: verseComments.commentHtml,
			createdAt: verseComments.createdAt,
			updatedAt: verseComments.updatedAt
		})
		.from(verseComments)
		.leftJoin(documents, eq(documents.legacyVerseCommentId, verseComments.id))
		.where(isNull(documents.id))
		.orderBy(verseComments.createdAt, verseComments.id)
		.limit(Math.max(1, Math.min(5_000, Math.trunc(limit))));
}

export type CreateLegacyDocumentInput = PendingLegacyVerseComment &
	PreparedDocumentBody & {
		title: string;
	};

export type CreateLegacyDocumentResult =
	| { ok: true; document: Document; created: boolean }
	| { ok: false; reason: 'invalidResource'; resourceId: string };

/**
 * Atomically creates one private document and translation-specific anchor for a legacy comment.
 * The unique provenance key plus `on conflict do nothing` makes any retry return the same document.
 */
export async function createDocumentFromLegacyVerseComment(
	db: Database,
	input: CreateLegacyDocumentInput
): Promise<CreateLegacyDocumentResult> {
	validateBody(input);
	const endpoints = passageToDbEndpoints({
		start: { book: input.bookId, chapter: input.chapter, verse: input.verse },
		end: { book: input.bookId, chapter: input.chapter, verse: input.verse }
	});
	if (!endpoints) {
		throw new InvalidDocumentInputError('passage', 'legacy comment has an invalid verse reference');
	}
	return db.transaction(async (tx) => {
		// Migration 0025 preserves every existing verse comment, including comments whose historical
		// Bible was hidden after writing. The resumable backfill follows that same fidelity policy;
		// only a genuinely missing/non-Bible resource is an error. New anchors remain public+ready-only.
		const invalidResource = await invalidExistingBible(tx, [input.resourceId]);
		if (invalidResource) {
			return { ok: false, reason: 'invalidResource', resourceId: invalidResource };
		}

		const [created] = await tx
			.insert(documents)
			.values({
				userId: input.userId,
				kind: 'note',
				title: cleanTitle(input.title),
				bodyMarkdown: input.bodyMarkdown,
				bodyHtml: input.bodyHtml,
				plainText: input.plainText,
				visibility: 'private',
				source: 'legacy-verse-comment',
				legacyVerseCommentId: input.id,
				createdAt: input.createdAt,
				updatedAt: input.updatedAt
			})
			.onConflictDoNothing({ target: documents.legacyVerseCommentId })
			.returning();

		if (created) {
			await tx.insert(documentPassages).values({
				documentId: created.id,
				resourceId: input.resourceId,
				...endpoints,
				position: 0,
				createdAt: input.createdAt
			});
			return { ok: true, document: created, created: true };
		}

		const [existing] = await tx
			.select()
			.from(documents)
			.where(and(eq(documents.legacyVerseCommentId, input.id), eq(documents.userId, input.userId)))
			.limit(1);
		if (!existing) throw new Error('legacy provenance belongs to another user');
		return { ok: true, document: existing, created: false };
	});
}

/** Read-only provenance lookup for backfill verification and recovery tooling. */
export async function getDocumentByLegacyVerseCommentId(
	db: Database,
	userId: string,
	legacyVerseCommentId: string
): Promise<Document | undefined> {
	const [document] = await db
		.select()
		.from(documents)
		.where(
			and(eq(documents.userId, userId), eq(documents.legacyVerseCommentId, legacyVerseCommentId))
		)
		.limit(1);
	return document;
}
