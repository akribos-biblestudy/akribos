import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getPublishedArticleBySlug } from '$lib/server/repositories/document-publications';

/**
 * A visitor-facing publication snapshot. Direct links intentionally resolve both public and
 * unlisted snapshots; neither kind is ever hydrated from its mutable document working copy.
 */
export async function load({ locals, params, setHeaders }) {
	setHeaders({
		'cache-control': locals.user ? 'private, no-store' : 'public, max-age=0, s-maxage=300'
	});

	const publication = await getPublishedArticleBySlug(getDb(), params.slug);
	if (!publication) error(404, 'Dieser Artikel ist nicht veröffentlicht.');

	return {
		title: publication.title,
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
