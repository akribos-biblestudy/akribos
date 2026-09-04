/** Per-owner hierarchical tags for the unified document library. */

import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
	MAX_DOCUMENT_TAGS,
	isValidTagPath,
	normalizeTagPath as normalizeDomainTagPath,
	type DocumentKind
} from '../../notes/documents.ts';
import type { Database } from '../db/client.ts';
import {
	documentTagLinks,
	documentTags,
	documents,
	type Document,
	type DocumentTag
} from '../db/schema.ts';

export class InvalidTagPathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidTagPathError';
	}
}

export type NormalizedTagPath = {
	path: string;
	normalizedPath: string;
	segments: Array<{ name: string; normalizedName: string }>;
};

/**
 * Canonicalises a user-facing `Parent/Child` path while preserving its display spelling. Slash is a
 * structural delimiter and therefore cannot be part of a single tag name.
 */
export function normalizeTagPath(value: string): NormalizedTagPath {
	const names = normalizeDomainTagPath(value);
	if (!isValidTagPath(names) || names.some((name) => name === '.' || name === '..')) {
		throw new InvalidTagPathError('tag path is empty, malformed, too deep or too long');
	}
	const segments = names.map((name) => ({
		name,
		normalizedName: name.toLocaleLowerCase('de-DE')
	}));
	const path = segments.map((segment) => segment.name).join('/');
	const normalizedPath = segments.map((segment) => segment.normalizedName).join('/');
	return { path, normalizedPath, segments };
}

export type SyncDocumentTagsResult =
	| { ok: true; revision: number; tags: DocumentTag[] }
	| { ok: false; reason: 'notFound' }
	| { ok: false; reason: 'conflict'; currentRevision: number };

/**
 * Ensures every ancestor exists and returns the selected leaf. Existing display spelling wins, so a
 * later `theology/GRACE` input cannot silently rename the user's `Theology/Grace` hierarchy.
 */
async function ensureTagPath(
	db: Pick<Database, 'select' | 'insert'>,
	userId: string,
	requested: NormalizedTagPath
): Promise<DocumentTag> {
	let parent: DocumentTag | undefined;
	let normalizedPath = '';

	for (const segment of requested.segments) {
		normalizedPath = normalizedPath
			? `${normalizedPath}/${segment.normalizedName}`
			: segment.normalizedName;
		const path = parent ? `${parent.path}/${segment.name}` : segment.name;

		await db
			.insert(documentTags)
			.values({
				userId,
				name: segment.name,
				normalizedName: segment.normalizedName,
				path,
				normalizedPath,
				parentId: parent?.id ?? null
			})
			.onConflictDoNothing({
				target: [documentTags.userId, documentTags.normalizedPath]
			});

		const [tag] = await db
			.select()
			.from(documentTags)
			.where(and(eq(documentTags.userId, userId), eq(documentTags.normalizedPath, normalizedPath)))
			.limit(1);
		if (!tag) throw new Error('tag disappeared after being created');
		parent = tag;
	}

	return parent!;
}

/**
 * Replaces a document's explicit leaf tags. Ownership is checked for both sides of every link and
 * an optional revision makes the operation safe to compose with autosave.
 */
export async function syncDocumentTags(
	db: Database,
	userId: string,
	documentId: string,
	paths: string[],
	expectedRevision?: number
): Promise<SyncDocumentTagsResult> {
	const requestedByPath = new Map<string, NormalizedTagPath>();
	for (const value of paths) {
		const normalized = normalizeTagPath(value);
		requestedByPath.set(normalized.normalizedPath, normalized);
	}
	if (requestedByPath.size > MAX_DOCUMENT_TAGS) {
		throw new InvalidTagPathError(`a document may have at most ${MAX_DOCUMENT_TAGS} tags`);
	}

	return db.transaction(async (tx) => {
		const [document] = await tx
			.select({ revision: documents.revision })
			.from(documents)
			.where(
				and(eq(documents.id, documentId), eq(documents.userId, userId), isNull(documents.deletedAt))
			)
			.limit(1)
			.for('update');
		if (!document) return { ok: false, reason: 'notFound' };
		if (expectedRevision !== undefined && document.revision !== expectedRevision) {
			return { ok: false, reason: 'conflict', currentRevision: document.revision };
		}

		const tags: DocumentTag[] = [];
		for (const requested of requestedByPath.values()) {
			tags.push(await ensureTagPath(tx, userId, requested));
		}

		await tx.delete(documentTagLinks).where(eq(documentTagLinks.documentId, documentId));
		if (tags.length > 0) {
			await tx.insert(documentTagLinks).values(tags.map((tag) => ({ documentId, tagId: tag.id })));
		}

		const [updated] = await tx
			.update(documents)
			.set({ updatedAt: new Date(), revision: sql`${documents.revision} + 1` })
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.userId, userId),
					eq(documents.revision, document.revision),
					isNull(documents.deletedAt)
				)
			)
			.returning({ revision: documents.revision });
		if (!updated) throw new Error('document changed while replacing its tags');
		return { ok: true, revision: updated.revision, tags };
	});
}

/** Lists the explicit tags on an owned, active document in path order. */
export async function listDocumentTags(
	db: Database,
	userId: string,
	documentId: string
): Promise<DocumentTag[]> {
	return db
		.select({
			id: documentTags.id,
			userId: documentTags.userId,
			name: documentTags.name,
			normalizedName: documentTags.normalizedName,
			path: documentTags.path,
			normalizedPath: documentTags.normalizedPath,
			parentId: documentTags.parentId,
			createdAt: documentTags.createdAt,
			updatedAt: documentTags.updatedAt
		})
		.from(documentTagLinks)
		.innerJoin(documentTags, eq(documentTags.id, documentTagLinks.tagId))
		.innerJoin(
			documents,
			and(
				eq(documents.id, documentTagLinks.documentId),
				eq(documents.userId, userId),
				eq(documentTags.userId, userId),
				isNull(documents.deletedAt)
			)
		)
		.where(eq(documentTagLinks.documentId, documentId))
		.orderBy(documentTags.normalizedPath);
}

/** All tags in one owner's hierarchy, including ancestors that are not linked directly. */
export async function listDocumentTagTree(db: Database, userId: string): Promise<DocumentTag[]> {
	return db
		.select()
		.from(documentTags)
		.where(eq(documentTags.userId, userId))
		.orderBy(documentTags.normalizedPath);
}

export type TagDocumentFilters = {
	kind?: DocumentKind;
	query?: string;
	deleted?: 'exclude' | 'only' | 'include';
};

/**
 * Filters by a tag or any of its descendants. The join repeats the user id on both the document and
 * tag sides, so even a malformed cross-owner link cannot disclose another account's metadata.
 */
export async function listDocumentsByTag(
	db: Database,
	userId: string,
	ancestorPath: string,
	filters: TagDocumentFilters = {}
): Promise<Document[]> {
	const normalized = normalizeTagPath(ancestorPath).normalizedPath;
	const conditions = [
		eq(documents.userId, userId),
		eq(documentTags.userId, userId),
		sql`(${documentTags.normalizedPath} = ${normalized}
			or left(${documentTags.normalizedPath}, char_length(${normalized}::text) + 1) = ${`${normalized}/`})`
	];
	if (filters.deleted === 'only') conditions.push(isNotNull(documents.deletedAt));
	else if (filters.deleted !== 'include') conditions.push(isNull(documents.deletedAt));
	if (filters.kind) conditions.push(eq(documents.kind, filters.kind));
	const query = filters.query?.trim();
	if (query) {
		const pattern = `%${query}%`;
		conditions.push(or(ilike(documents.title, pattern), ilike(documents.plainText, pattern))!);
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
		.innerJoin(documentTagLinks, eq(documentTagLinks.documentId, documents.id))
		.innerJoin(documentTags, eq(documentTags.id, documentTagLinks.tagId))
		.where(and(...conditions))
		.orderBy(desc(documents.updatedAt), desc(documents.id));
}
