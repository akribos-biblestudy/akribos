import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getPublishedDocumentBySlug } from '$lib/server/repositories/document-publications';
import { listBibles } from '$lib/server/repositories/resources';

/** Direct-link snapshot, independent of the mutable working copy. */
export async function load({ params, setHeaders }) {
	// The snapshot is public, but the shared root layout embeds cookie-based guest preferences.
	// Avoid caching the resulting HTML across visitors.
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' });

	const db = getDb();
	const [publication, bibles] = await Promise.all([
		getPublishedDocumentBySlug(db, params.slug),
		listBibles(db)
	]);
	if (!publication) error(404, 'Diese Notiz ist nicht veröffentlicht.');

	return {
		title: publication.title,
		bibles,
		publication: {
			slug: publication.slug,
			title: publication.title,
			excerpt: publication.excerpt,
			bodyHtml: publication.bodyHtml,
			authorName: publication.authorName,
			visibility: 'unlisted' as const,
			passages: publication.passages,
			tags: publication.tags,
			firstPublishedAt: publication.firstPublishedAt,
			publishedAt: publication.publishedAt
		}
	};
}
