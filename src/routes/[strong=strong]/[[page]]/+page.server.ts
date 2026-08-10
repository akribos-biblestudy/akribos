import { error, redirect } from '@sveltejs/kit';
import { isValidBookId } from '$lib/bible/books';
import { normalizeStrongId, otherLanguageId } from '$lib/bible/strong';
import { getDb } from '$lib/server/db';
import { listBibles } from '$lib/server/repositories/resources';
import {
	loadStrongEntry,
	loadStrongBookCounts,
	loadStrongGlosses,
	loadStrongOccurrences,
	loadStrongStatistics,
	pickStatisticsResource
} from '$lib/server/repositories/strong';

/**
 * Full-page list of every verse containing a Strong's number: `/G26` and `/G26/2`.
 *
 * The same URLs the previous site used, including the page suffix, so old links and search results
 * keep working. Unlike the sidebar this is server-rendered, because it is a page people link to and
 * search engines index.
 */
export async function load({ params, setHeaders, url }) {
	const strong = normalizeStrongId(params.strong);
	if (!strong) error(404, 'Unbekannte Strong-Nummer');

	// Normalise padded or lower-case spellings to one canonical URL.
	if (strong !== params.strong) {
		redirect(301, `${params.page ? `/${strong}/${params.page}` : `/${strong}`}${url.search}`);
	}

	const page = params.page ? Number.parseInt(params.page, 10) : 1;
	if (!Number.isInteger(page) || page < 1) error(404, 'Ungültige Seite');
	const requestedBook = Number.parseInt(url.searchParams.get('book') ?? '', 10);
	const book = isValidBookId(requestedBook) ? requestedBook : undefined;
	const gloss = (url.searchParams.get('gloss') ?? '').trim().slice(0, 200) || undefined;

	const db = getDb();
	const bibles = await listBibles(db);
	const columns = bibles.map((bible) => bible.id);
	const statisticsResource = await pickStatisticsResource(db, columns, strong);

	if (!statisticsResource) {
		error(503, 'Es ist noch keine Übersetzung mit Strong-Nummern importiert.');
	}

	const [entry, statistics, bookCounts, glosses, occurrences] = await Promise.all([
		loadStrongEntry(db, strong),
		loadStrongStatistics(db, strong, statisticsResource),
		loadStrongBookCounts(db, strong, statisticsResource),
		loadStrongGlosses(db, strong, statisticsResource, 20),
		loadStrongOccurrences(db, strong, statisticsResource, { page, pageSize: 30, book, gloss })
	]);

	if (occurrences.total === 0 && !entry) {
		error(404, {
			message: 'Diese Strong-Nummer existiert nicht.',
			// Offered as a suggestion, the way the old error page did.
			alternative: otherLanguageId(strong)
		});
	}

	if (page > occurrences.pageCount) redirect(302, `/${strong}${url.search}`);

	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=3600' });

	const resource = bibles.find((bible) => bible.id === statisticsResource);

	return {
		strong,
		book: book ?? null,
		gloss: gloss ?? null,
		entry: entry ?? null,
		statistics,
		bookCounts,
		glosses,
		occurrences,
		title: strong,
		resource: resource ? { id: resource.id, abbrev: resource.tabTitle } : null,
		// The translation the verse-hover popover fetches text from. This page has a shared, cookie-free
		// cache (`s-maxage`), so it deliberately reuses the same resource already picked for the
		// occurrence statistics above rather than the reader's own `columns` cookie, which would vary
		// per visitor and make that shared cache serve one visitor's choice to everyone else.
		primaryBibleId: statisticsResource
	};
}
