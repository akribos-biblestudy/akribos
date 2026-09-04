import { getDb } from '$lib/server/db';
import { listPublishedArticleSummaries } from '$lib/server/repositories/document-publications';

const PAGE_SIZE = 24;

/** Public note library. Mutable document working copies are never queried from this route. */
export async function load({ setHeaders, url }) {
	// The root layout carries cookie-based guest reader preferences, so even anonymous HTML must not
	// enter a shared cache. Cookie-free feed and sitemap endpoints remain publicly cacheable.
	setHeaders({ 'cache-control': 'private, no-store' });

	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const publications = await listPublishedArticleSummaries(getDb(), {
		limit: PAGE_SIZE + 1,
		offset: (page - 1) * PAGE_SIZE
	});
	const hasNext = publications.length > PAGE_SIZE;

	return {
		title: 'Veröffentlichte Notizen',
		page,
		hasNext,
		articles: publications.slice(0, PAGE_SIZE).map((publication) => ({
			slug: publication.slug,
			title: publication.title,
			excerpt: publication.excerpt,
			authorName: publication.authorName,
			passages: publication.passages,
			tags: publication.tags,
			firstPublishedAt: publication.firstPublishedAt,
			publishedAt: publication.publishedAt
		}))
	};
}
