import { error, json } from '@sveltejs/kit';
import { isValidBookId } from '$lib/bible/books';
import { normalizeStrongId } from '$lib/bible/strong';
import type { ReaderTabSearchResponse } from '$lib/reader/tab-search';
import { getDb } from '$lib/server/db';
import { listReaderResources } from '$lib/server/repositories/resources';
import { search, searchCommentary } from '$lib/server/repositories/search';
import {
	loadStrongBookCounts,
	loadStrongGlosses,
	loadStrongOccurrences,
	loadStrongStatistics
} from '$lib/server/repositories/strong';

const PAGE_SIZE = 25;

/** Resource-scoped search payload for the result view embedded in one reader tab. */
export async function GET({ url, setHeaders }) {
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 300);
	const resourceId = (url.searchParams.get('resource') ?? '').trim();
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const requestedBook = Number.parseInt(url.searchParams.get('book') ?? '', 10);
	const book = isValidBookId(requestedBook) ? requestedBook : undefined;
	if (!query) error(400, 'Leere Suchanfrage');

	const db = getDb();
	const resource = (await listReaderResources(db)).find((candidate) => candidate.id === resourceId);
	if (!resource) error(404, 'Unbekannte Ressource');

	let response: ReaderTabSearchResponse;
	if (resource.kind === 'bible') {
		const strong = normalizeStrongId(query);
		if (strong) {
			const [result, bookCounts, glosses, statistics] = await Promise.all([
				loadStrongOccurrences(db, strong, resource.id, {
					page,
					pageSize: PAGE_SIZE,
					book
				}),
				loadStrongBookCounts(db, strong, resource.id),
				loadStrongGlosses(db, strong, resource.id, 20),
				loadStrongStatistics(db, strong, resource.id)
			]);
			response = {
				kind: 'strong',
				query,
				strong,
				total: result.total,
				page: result.page,
				pageCount: result.pageCount,
				book: book ?? null,
				bookCounts,
				glosses,
				statistics,
				hits: result.occurrences
			};
		} else {
			const result = await search(db, query, {
				resourceIds: [resource.id],
				page,
				pageSize: PAGE_SIZE,
				book
			});
			response = {
				kind: 'scripture',
				query,
				needles: result.query.highlight,
				total: result.total,
				page: result.page,
				pageCount: result.pageCount,
				book: book ?? null,
				bookCounts: result.bookCounts,
				suggestion: result.suggestion,
				hits: result.hits.flatMap((hit) => {
					const cell = hit.cells[0];
					return cell
						? [
								{
									book: hit.book,
									chapter: hit.chapter,
									verse: hit.verse,
									segments: cell.segments
								}
							]
						: [];
				})
			};
		}
	} else if (resource.kind === 'commentary') {
		const result = await searchCommentary(db, resource.id, query, {
			page,
			pageSize: PAGE_SIZE,
			book
		});
		response = {
			kind: 'commentary',
			query,
			needles: result.query.highlight,
			total: result.total,
			page: result.page,
			pageCount: result.pageCount,
			book: book ?? null,
			bookCounts: result.bookCounts,
			suggestion: result.suggestion,
			hits: result.hits
		};
	} else {
		response = { kind: 'unsupported', query, total: 0, page: 1, pageCount: 1, book: null };
	}

	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=600' });
	return json(response);
}
