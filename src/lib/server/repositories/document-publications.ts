/** Explicit, admin-only publication snapshots for note working copies. */

import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import {
	documentPassages,
	documentPublications,
	documentTagLinks,
	documentTags,
	documents,
	users,
	type DocumentPublication,
	type PublishedPassageSnapshot
} from '../db/schema.ts';

export type PublishArticleInput = {
	slug: string;
	excerpt: string;
	visibility: 'public' | 'unlisted';
	expectedRevision?: number;
};

export type PublishArticleResult =
	| { ok: true; publication: DocumentPublication }
	| {
			ok: false;
			reason:
				| 'forbidden'
				| 'notFound'
				| 'notArticle'
				| 'private'
				| 'authorNameRequired'
				| 'invalidSlug'
				| 'slugConflict';
	  }
	| { ok: false; reason: 'conflict'; currentRevision: number };

export type UnpublishArticleResult =
	{ ok: true; unpublished: boolean } | { ok: false; reason: 'forbidden' | 'notFound' };

export type PublishedArticleSummary = Pick<
	DocumentPublication,
	| 'slug'
	| 'title'
	| 'excerpt'
	| 'authorName'
	| 'passages'
	| 'tags'
	| 'firstPublishedAt'
	| 'publishedAt'
>;

type PublicationListOptions = { limit?: number; offset?: number };

function publicationWindow(options: PublicationListOptions): { limit: number; offset: number } {
	return {
		limit: Math.max(1, Math.min(100, Math.trunc(options.limit ?? 50))),
		offset: Math.max(0, Math.trunc(options.offset ?? 0))
	};
}

/** Slugs are already prepared by the caller; this check only keeps them one safe URL segment. */
export function isPublicationSlug(value: string): boolean {
	return value.length > 0 && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function postgresErrorCode(error: unknown): string | undefined {
	return typeof error === 'object' && error !== null && 'code' in error
		? String((error as { code?: unknown }).code)
		: undefined;
}

/**
 * Copies the complete visitor-facing state from an owned article into its current snapshot. The
 * requested public/unlisted visibility is applied to the working copy in the same locked transaction,
 * so validation failures cannot leave visibility and snapshot out of sync. The actor's role and
 * ownership are read from the database rather than trusted from request data.
 */
export async function publishArticle(
	db: Database,
	actorUserId: string,
	documentId: string,
	input: PublishArticleInput
): Promise<PublishArticleResult> {
	const slug = input.slug.trim();
	if (!isPublicationSlug(slug)) return { ok: false, reason: 'invalidSlug' };
	if (input.visibility !== 'public' && input.visibility !== 'unlisted') {
		return { ok: false, reason: 'private' };
	}

	try {
		return await db.transaction(async (tx) => {
			const [actor] = await tx
				.select({ role: users.role, displayName: users.displayName })
				.from(users)
				.where(eq(users.id, actorUserId))
				.limit(1);
			if (actor?.role !== 'admin') return { ok: false, reason: 'forbidden' };

			const [document] = await tx
				.select()
				.from(documents)
				.where(
					and(
						eq(documents.id, documentId),
						eq(documents.userId, actorUserId),
						isNull(documents.deletedAt)
					)
				)
				.limit(1)
				.for('update');
			if (!document) return { ok: false, reason: 'notFound' };
			// `article` remains a supported legacy/API kind. In the product both it and an ordinary note
			// are publishable working copies; sermon-specific workflow documents remain private.
			if (document.kind === 'sermon') return { ok: false, reason: 'notArticle' };
			if (input.expectedRevision !== undefined && document.revision !== input.expectedRevision) {
				return { ok: false, reason: 'conflict', currentRevision: document.revision };
			}

			// A raw email address is intentionally never accepted as an author-name fallback.
			const authorName = actor.displayName?.trim();
			if (!authorName) return { ok: false, reason: 'authorNameRequired' };

			const [slugOwner] = await tx
				.select({ documentId: documentPublications.documentId })
				.from(documentPublications)
				.where(eq(documentPublications.slug, slug))
				.limit(1);
			if (slugOwner && slugOwner.documentId !== documentId) {
				return { ok: false, reason: 'slugConflict' };
			}

			const [passageRows, tagRows, existing] = await Promise.all([
				tx
					.select({
						resourceId: documentPassages.resourceId,
						startBookId: documentPassages.startBookId,
						startChapter: documentPassages.startChapter,
						startVerse: documentPassages.startVerse,
						endBookId: documentPassages.endBookId,
						endChapter: documentPassages.endChapter,
						endVerse: documentPassages.endVerse,
						startKey: documentPassages.startKey,
						endKey: documentPassages.endKey,
						position: documentPassages.position
					})
					.from(documentPassages)
					.where(eq(documentPassages.documentId, documentId))
					.orderBy(documentPassages.position, documentPassages.id),
				tx
					.select({ path: documentTags.path })
					.from(documentTagLinks)
					.innerJoin(
						documentTags,
						and(eq(documentTags.id, documentTagLinks.tagId), eq(documentTags.userId, actorUserId))
					)
					.where(eq(documentTagLinks.documentId, documentId))
					.orderBy(documentTags.normalizedPath),
				tx
					.select({ firstPublishedAt: documentPublications.firstPublishedAt })
					.from(documentPublications)
					.where(eq(documentPublications.documentId, documentId))
					.limit(1)
			]);

			const passages: PublishedPassageSnapshot[] = passageRows;
			const tags = tagRows.map((tag) => tag.path);
			const now = new Date();
			let publicationRevision = document.revision;
			if (document.visibility !== input.visibility) {
				const [updated] = await tx
					.update(documents)
					.set({
						visibility: input.visibility,
						revision: document.revision + 1,
						updatedAt: now
					})
					.where(
						and(
							eq(documents.id, documentId),
							eq(documents.userId, actorUserId),
							eq(documents.revision, document.revision),
							isNull(documents.deletedAt)
						)
					)
					.returning({ revision: documents.revision });
				if (!updated) {
					throw new Error('document changed while preparing its publication snapshot');
				}
				publicationRevision = updated.revision;
			}
			const values = {
				slug,
				title: document.title,
				excerpt: input.excerpt.trim(),
				bodyHtml: document.bodyHtml,
				bodyMarkdown: document.bodyMarkdown,
				authorName,
				visibility: input.visibility,
				passages,
				tags,
				publicationRevision,
				firstPublishedAt: existing[0]?.firstPublishedAt ?? now,
				publishedAt: now
			} as const;

			const [publication] = await tx
				.insert(documentPublications)
				.values({ documentId, ...values })
				.onConflictDoUpdate({
					target: documentPublications.documentId,
					set: values
				})
				.returning();
			return { ok: true, publication: publication! };
		});
	} catch (error) {
		// The preflight query gives a friendly result normally; this catches a concurrent slug claim.
		if (postgresErrorCode(error) === '23505') return { ok: false, reason: 'slugConflict' };
		throw error;
	}
}

/** Explicitly removes a snapshot without changing or deleting its private working copy. */
export async function unpublishArticle(
	db: Database,
	actorUserId: string,
	documentId: string
): Promise<UnpublishArticleResult> {
	return db.transaction(async (tx) => {
		const [actor] = await tx
			.select({ role: users.role })
			.from(users)
			.where(eq(users.id, actorUserId))
			.limit(1);
		if (actor?.role !== 'admin') return { ok: false, reason: 'forbidden' };

		const [document] = await tx
			.select({ id: documents.id })
			.from(documents)
			.where(and(eq(documents.id, documentId), eq(documents.userId, actorUserId)))
			.limit(1)
			.for('update');
		if (!document) return { ok: false, reason: 'notFound' };

		const deleted = await tx
			.delete(documentPublications)
			.where(eq(documentPublications.documentId, documentId))
			.returning({ documentId: documentPublications.documentId });
		return { ok: true, unpublished: deleted.length > 0 };
	});
}

/**
 * Returns the snapshot attached to an owned, active working copy. This is for the private editor;
 * unlike a public slug lookup, the document id never acts as authority on its own.
 */
export async function getOwnedDocumentPublication(
	db: Database,
	userId: string,
	documentId: string
): Promise<DocumentPublication | undefined> {
	const [owned] = await db
		.select({ id: documents.id })
		.from(documents)
		.where(
			and(eq(documents.id, documentId), eq(documents.userId, userId), isNull(documents.deletedAt))
		)
		.limit(1);
	if (!owned) return undefined;

	const [publication] = await db
		.select()
		.from(documentPublications)
		.where(eq(documentPublications.documentId, documentId))
		.limit(1);
	return publication;
}

/** Public article index/feed/sitemap source. Unlisted snapshots are intentionally excluded. */
export async function listPublishedArticles(
	db: Database,
	options: PublicationListOptions = {}
): Promise<DocumentPublication[]> {
	const { limit, offset } = publicationWindow(options);
	return db
		.select()
		.from(documentPublications)
		.where(eq(documentPublications.visibility, 'public'))
		.orderBy(desc(documentPublications.publishedAt), desc(documentPublications.documentId))
		.limit(limit)
		.offset(offset);
}

/** Lightweight public-index projection that deliberately omits both body representations. */
export async function listPublishedArticleSummaries(
	db: Database,
	options: PublicationListOptions = {}
): Promise<PublishedArticleSummary[]> {
	const { limit, offset } = publicationWindow(options);
	return db
		.select({
			slug: documentPublications.slug,
			title: documentPublications.title,
			excerpt: documentPublications.excerpt,
			authorName: documentPublications.authorName,
			passages: documentPublications.passages,
			tags: documentPublications.tags,
			firstPublishedAt: documentPublications.firstPublishedAt,
			publishedAt: documentPublications.publishedAt
		})
		.from(documentPublications)
		.where(eq(documentPublications.visibility, 'public'))
		.orderBy(desc(documentPublications.publishedAt), desc(documentPublications.documentId))
		.limit(limit)
		.offset(offset);
}

/** Smallest sitemap projection; unlisted snapshots remain intentionally undiscoverable. */
export async function listPublishedArticleSlugs(
	db: Database,
	options: PublicationListOptions = {}
): Promise<string[]> {
	const { limit, offset } = publicationWindow(options);
	const rows = await db
		.select({ slug: documentPublications.slug })
		.from(documentPublications)
		.where(eq(documentPublications.visibility, 'public'))
		.orderBy(desc(documentPublications.publishedAt), desc(documentPublications.documentId))
		.limit(limit)
		.offset(offset);
	return rows.map((row) => row.slug);
}

/** Direct detail lookup includes both public and unlisted snapshots, but never private working data. */
export async function getPublishedArticleBySlug(
	db: Database,
	slug: string
): Promise<DocumentPublication | undefined> {
	const [publication] = await db
		.select()
		.from(documentPublications)
		.where(eq(documentPublications.slug, slug))
		.limit(1);
	return publication;
}
