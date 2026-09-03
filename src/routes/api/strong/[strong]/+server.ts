import { error, json } from '@sveltejs/kit';
import { normalizeStrongId, otherLanguageId } from '$lib/bible/strong';
import { parseMorphology } from '$lib/bible/morphology';
import { parseReference } from '$lib/bible/reference';
import { getDb } from '$lib/server/db';
import {
	loadOriginalWord,
	loadStrongBookCounts,
	loadStrongEntry,
	loadStrongGlosses,
	loadStrongOccurrences,
	loadStrongStatistics,
	pickStatisticsResource,
	findLexiconEntry
} from '$lib/server/repositories/strong';
import { listReaderResources } from '$lib/server/repositories/resources';

/**
 * Study data embedded in a lexicon tab for a Strong's number.
 *
 * Query parameters:
 *   ref        the verse the word was clicked in, so the original form and morphology can be shown
 *   resource   the exact translation whose tagged word opened the lexicon tab
 *   lexicon    the exact dictionary represented by the tab
 *   resources  legacy list of translations, used only when `resource` is absent
 *   page       page of the occurrence list
 *   book       optional canonical book filter for the occurrence list
 */
export async function GET({ params, url, setHeaders }) {
	const strong = normalizeStrongId(params.strong);
	if (!strong) error(404, 'Unbekannte Strong-Nummer');

	const db = getDb();
	const available = await listReaderResources(db);
	const requestedResourceId = url.searchParams.get('resource')?.trim() ?? '';
	const requestedResource = available.find(
		(resource) => resource.id === requestedResourceId && resource.kind === 'bible'
	);
	if (requestedResourceId && !requestedResource) error(400, 'Unbekannte Übersetzung');
	const resourceIds = (url.searchParams.get('resources') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	const statisticsResource =
		requestedResource?.id ?? (await pickStatisticsResource(db, resourceIds, strong));
	const reference = parseReference(url.searchParams.get('ref') ?? '');
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requestedBook = Number(url.searchParams.get('book') ?? '');
	const book =
		Number.isSafeInteger(requestedBook) && requestedBook >= 1 && requestedBook <= 66
			? requestedBook
			: undefined;
	const lexiconId = url.searchParams.get('lexicon')?.trim() ?? '';
	const lexicon = lexiconId
		? available.find((resource) => resource.id === lexiconId && resource.kind === 'lexicon')
		: undefined;
	if (lexiconId && !lexicon) error(400, 'Unbekanntes Lexikon');

	const [entry, statistics, bookCounts, glosses, occurrences, original] = await Promise.all([
		lexicon ? findLexiconEntry(db, lexicon.id, strong) : loadStrongEntry(db, strong),
		statisticsResource
			? loadStrongStatistics(db, strong, statisticsResource)
			: Promise.resolve({ occurrences: 0, verseCount: 0 }),
		statisticsResource ? loadStrongBookCounts(db, strong, statisticsResource) : Promise.resolve([]),
		statisticsResource ? loadStrongGlosses(db, strong, statisticsResource) : Promise.resolve([]),
		statisticsResource
			? loadStrongOccurrences(db, strong, statisticsResource, { page, book })
			: Promise.resolve({ occurrences: [], total: 0, page: 1, pageCount: 1 }),
		reference?.verse !== undefined
			? loadOriginalWord(db, {
					strong,
					book: reference.book,
					chapter: reference.chapter,
					verse: reference.verse
				})
			: Promise.resolve(undefined)
	]);

	// Dictionary content is immutable between imports, so it is worth caching.
	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=3600' });

	return json({
		strong,
		found: entry !== undefined,
		entry: entry ?? null,
		/** Offered when the number does not exist, as the old error page did. */
		alternative: entry ? null : otherLanguageId(strong),
		statistics,
		bookCounts,
		glosses,
		occurrences,
		original: original ?? null,
		morphology: parseMorphology(original?.morph ?? ''),
		statisticsResource: statisticsResource ?? null
	});
}
