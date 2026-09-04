import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getPublishedArticleBySlug } from '$lib/server/repositories/document-publications';
import { listBibles } from '$lib/server/repositories/resources';

/**
 * A visitor-facing publication snapshot. Direct links intentionally resolve both public and
 * unlisted snapshots; neither kind is ever hydrated from its mutable document working copy.
 */
export async function load({ params, setHeaders }) {
	// The snapshot is public, but the shared root layout embeds cookie-based guest preferences.
	// Avoid caching the resulting HTML across visitors; feed and sitemap have no such layout data.
	setHeaders({ 'cache-control': 'private, no-store' });

	const db = getDb();
	const [publication, bibles] = await Promise.all([
		getPublishedArticleBySlug(db, params.slug),
		listBibles(db)
	]);
	if (!publication) error(404, 'Diese Notiz ist nicht veröffentlicht.');
	if (publication.visibility === 'unlisted') {
		setHeaders({ 'x-robots-tag': 'noindex, nofollow' });
	}

	return {
		title: publication.title,
		bibles,
		article: {
			slug: publication.slug,
			title: publication.title,
			excerpt: publication.excerpt,
			bodyHtml: publication.bodyHtml,
			authorName: publication.authorName,
			visibility: publication.visibility,
			passages: publication.passages,
			tags: publication.tags,
			firstPublishedAt: publication.firstPublishedAt,
			publishedAt: publication.publishedAt
		}
	};
}
