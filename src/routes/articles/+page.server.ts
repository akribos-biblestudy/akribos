import { getDb } from '$lib/server/db';
import { listPublishedArticles } from '$lib/server/repositories/document-publications';

const PAGE_SIZE = 100;

/** Public article library. Mutable document working copies are never queried from this route. */
export async function load({ locals, setHeaders }) {
	setHeaders({
		'cache-control': locals.user ? 'private, no-store' : 'public, max-age=0, s-maxage=300'
	});

	const db = getDb();
	const publications = [];
	let offset = 0;

	// The repository deliberately caps a single read at 100. Walk all pages so an older public
	// article does not disappear merely because the site has published its hundred-and-first one.
	while (true) {
		const page = await listPublishedArticles(db, { limit: PAGE_SIZE, offset });
		publications.push(...page);
		if (page.length < PAGE_SIZE) break;
		offset += page.length;
	}

	return {
		title: 'Artikel',
		articles: publications.map((publication) => ({
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
