import { resourceViewerId } from '$lib/server/api/identity';
import { json } from '@sveltejs/kit';
import { normalizeStrongId, otherLanguageId } from '$lib/bible/strong';
import { parseMorphology } from '$lib/bible/morphology';
import { parseReference } from '$lib/bible/reference';
import { isValidBookId } from '$lib/bible/books';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api/errors';
import {
	loadOriginalWord,
	loadStrongBookCounts,
	loadStrongEntry,
	loadStrongGlosses,
	loadStrongOccurrences,
	loadStrongStatistics,
	pickStatisticsResource
} from '$lib/server/repositories/strong';

/**
 * A Strong's number's lexicon entry, rendering statistics and occurrences.
 *
 * Query parameters:
 *   ref        a verse reference, so the original form and morphology at that exact spot are included
 *   resources  translation ids, comma separated, to compute the rendering statistics from
 *   page       page of the occurrence list (default 1)
 */
export async function GET({ params, url, setHeaders, locals }) {
	const strong = normalizeStrongId(params.strong);
	if (!strong)
		return apiError(404, 'invalid_strong_id', `"${params.strong}" is not a Strong's id.`);

	const db = getDb();
	const resourceIds = (url.searchParams.get('resources') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	const statisticsResource = await pickStatisticsResource(
		db,
		resourceIds,
		strong,
		resourceViewerId(locals)
	);
	const reference = parseReference(url.searchParams.get('ref') ?? '');
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requestedBook = Number.parseInt(url.searchParams.get('book') ?? '', 10);
	const book = isValidBookId(requestedBook) ? requestedBook : undefined;
	const gloss = (url.searchParams.get('gloss') ?? '').trim().slice(0, 200) || undefined;

	const [entry, statistics, bookCounts, glosses, occurrences, original] = await Promise.all([
		loadStrongEntry(db, strong, resourceViewerId(locals)),
		statisticsResource
			? loadStrongStatistics(db, strong, statisticsResource)
			: Promise.resolve({ occurrences: 0, verseCount: 0 }),
		statisticsResource ? loadStrongBookCounts(db, strong, statisticsResource) : Promise.resolve([]),
		statisticsResource ? loadStrongGlosses(db, strong, statisticsResource) : Promise.resolve([]),
		statisticsResource
			? loadStrongOccurrences(db, strong, statisticsResource, { page, book, gloss })
			: Promise.resolve({ occurrences: [], total: 0, page: 1, pageCount: 1 }),
		reference?.verse !== undefined
			? loadOriginalWord(db, {
					strong,
					book: reference.book,
					chapter: reference.chapter,
					verse: reference.verse,
					userId: resourceViewerId(locals)
				})
			: Promise.resolve(undefined)
	]);

	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=3600' });

	return json({
		strong,
		found: entry !== undefined,
		entry: entry ?? null,
		alternative: entry ? null : otherLanguageId(strong),
		statistics,
		bookCounts,
		glosses,
		occurrences,
		original: original ?? null,
		morphology: parseMorphology(original?.morph ?? ''),
		statisticsResource: statisticsResource ?? null,
		filters: { book: book ?? null, gloss: gloss ?? null }
	});
}
