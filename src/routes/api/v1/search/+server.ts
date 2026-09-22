import { resourceViewerId } from '$lib/server/api/identity';
import { json } from '@sveltejs/kit';
import { isValidBookId } from '$lib/bible/books';
import { getDb } from '$lib/server/db';
import { listBibles } from '$lib/server/repositories/resources';
import { search } from '$lib/server/repositories/search';
import { apiError } from '$lib/server/api/errors';

/**
 * Full-text search across bible translations.
 *
 * Query parameters:
 *   q       the search term — a word, several words, or a "quoted phrase" (required)
 *   bibles  translation ids, comma separated; defaults to every available translation
 *   book    restrict to one canonical book id
 *   page    page of results (default 1)
 */
export async function GET({ url, setHeaders, locals }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const query = (url.searchParams.get('q') ?? '').trim();
	if (!query) return apiError(400, 'missing_query', 'The "q" query parameter is required.');

	const db = getDb();
	const requestedBibles = (url.searchParams.get('bibles') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	const bibles = await listBibles(db, resourceViewerId(locals), 'api');
	const resourceIds =
		requestedBibles.length > 0
			? bibles.filter((bible) => requestedBibles.includes(bible.id)).map((bible) => bible.id)
			: bibles.map((bible) => bible.id);

	const requestedBook = Number.parseInt(url.searchParams.get('book') ?? '', 10);
	const book = isValidBookId(requestedBook) ? requestedBook : undefined;
	const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1;

	const results = await search(db, query, { resourceIds, page, book });

	return json(results);
}
