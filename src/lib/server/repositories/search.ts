/**
 * Full-text search over verses.
 *
 * Search runs across every selected translation at once and returns verse references, which the
 * reader then shows in parallel. That is deliberately different from the old site, which ran four
 * independent searches and displayed them side by side — so row three of column one had nothing to do
 * with row three of column two, and a word that only one translation used was invisible in the
 * others' columns.
 */

import { sql, type SQL } from 'drizzle-orm';
import { BOOKS } from '../../bible/books.ts';
import { parseSearchQuery, type ParsedQuery } from '../../bible/search-query.ts';
import type { VerseSegment } from '../../bible/segments.ts';
import type { Database } from '../db/client.ts';

const SEARCH_CONFIG = 'german_unaccent';

export type SearchHit = {
	book: number;
	chapter: number;
	verse: number;
	/** Which of the searched translations matched, so the UI can mark them. */
	matchedIn: string[];
	/** The verse in each requested translation, in the order they were requested. */
	cells: ({ verse: number; segments: VerseSegment[] } | null)[];
};

export type SearchResult = {
	query: ParsedQuery;
	hits: SearchHit[];
	total: number;
	page: number;
	pageCount: number;
	/** Matches per translation, for the summary line. */
	counts: { resourceId: string; count: number }[];
	/** Distinct matching verses per biblical book. */
	bookCounts: { book: number; count: number }[];
	/** Suggested spelling when the search found nothing. */
	suggestion: string | null;
};

export type CommentarySearchHit = {
	id: number;
	book: number;
	chapter: number;
	verseStart: number | null;
	verseEnd: number | null;
	title: string | null;
	bodyHtml: string;
};

export type CommentarySearchResult = {
	query: ParsedQuery;
	hits: CommentarySearchHit[];
	total: number;
	page: number;
	pageCount: number;
	bookCounts: { book: number; count: number }[];
	suggestion: string | null;
};

export type SearchOptions = {
	resourceIds: string[];
	book?: number;
	page?: number;
	pageSize?: number;
};

/**
 * Builds the search predicate.
 *
 * Bare words become prefix queries (`wort:*`) so word beginnings match, exclusions become a negated
 * query, and both are index-backed. Neither can carry tsquery syntax: the parser strips everything
 * but letters, digits, hyphens and apostrophes.
 *
 * Phrases need a second step. `phraseto_tsquery` discards stopwords, so `"am Anfang"` reduces to
 * `'anfang'` and matches all 144 verses containing that word rather than the 13 containing the
 * phrase. Quoting has to mean the literal sequence, so the tsquery narrows the candidates using the
 * index and a word-boundary regex over the plain text confirms them. `unaccent` is applied on both
 * sides to match the folding the index does.
 */
function buildPredicate(
	query: ParsedQuery,
	searchableText: SQL = sql`text`
): {
	include: SQL | null;
	exclude: SQL | null;
	phrases: SQL[];
} {
	const includes: SQL[] = [];
	const excludes: SQL[] = [];
	const phrases: SQL[] = [];

	for (const term of query.terms) {
		if (term.kind === 'exclude') {
			excludes.push(sql`plainto_tsquery(${SEARCH_CONFIG}, ${term.text})`);
			continue;
		}

		// A prefix term containing a space can only come from odd punctuation; treat it as a phrase.
		const isPhrase = term.kind === 'phrase' || term.text.includes(' ');

		if (isPhrase) {
			includes.push(sql`phraseto_tsquery(${SEARCH_CONFIG}, ${term.text})`);
			// The backslashes are doubled because this is a JavaScript template literal: PostgreSQL has
			// to receive \m and \M, its word-boundary markers.
			phrases.push(
				sql`unaccent(lower(${searchableText})) ~ ('\\m' || unaccent(lower(${term.text})) || '\\M')`
			);
		} else {
			includes.push(sql`to_tsquery(${SEARCH_CONFIG}, ${`${term.text}:*`})`);
		}
	}

	return {
		include: includes.length > 0 ? sql.join(includes, sql` && `) : null,
		exclude: excludes.length > 0 ? sql.join(excludes, sql` || `) : null,
		phrases
	};
}

/**
 * Full-text search within one commentary resource. Commentary imports store safe HTML rather than a
 * second flattened text column, so the allowed tags are stripped inside the query before building a
 * PostgreSQL search vector. This keeps tab-scoped searching available without duplicating imported
 * content or introducing another migration merely for the first iteration of commentary search.
 */
export async function searchCommentary(
	db: Database,
	resourceId: string,
	rawQuery: string,
	options: Omit<SearchOptions, 'resourceIds'> = {}
): Promise<CommentarySearchResult> {
	const query = parseSearchQuery(rawQuery);
	const pageSize = options.pageSize ?? 25;
	const page = Math.max(1, options.page ?? 1);
	const empty: CommentarySearchResult = {
		query,
		hits: [],
		total: 0,
		page: 1,
		pageCount: 1,
		bookCounts: [],
		suggestion: null
	};
	if (query.empty) return empty;

	const searchableText = sql`concat_ws(' ', coalesce(title, ''), regexp_replace(body_html, '<[^>]*>', ' ', 'g'))`;
	const { include, exclude, phrases } = buildPredicate(query, searchableText);
	if (!include) return empty;

	const vector = sql`to_tsvector(${SEARCH_CONFIG}, ${searchableText})`;
	const conditions = [sql`${vector} @@ (${include})`, ...phrases];
	if (exclude) conditions.push(sql`not (${vector} @@ (${exclude}))`);
	const baseMatches = sql.join(conditions, sql` and `);
	const matches = options.book ? sql`${baseMatches} and book_id = ${options.book}` : baseMatches;

	const [countRow] = await db.execute<{ total: number }>(sql`
		select count(*)::int as total
		from commentary_entries
		where resource_id = ${resourceId} and ${matches}
	`);
	const total = Number(countRow?.total ?? 0);
	const bookCounts = await db.execute<{ book_id: number; count: number }>(sql`
		select book_id, count(*)::int as count
		from commentary_entries
		where resource_id = ${resourceId} and ${baseMatches}
		group by book_id
		order by book_id
	`);
	const countsByBook = new Map(bookCounts.map((row) => [row.book_id, Number(row.count)]));
	const allBookCounts = BOOKS.map((book) => ({
		book: book.id,
		count: countsByBook.get(book.id) ?? 0
	}));
	if (total === 0) {
		const hasUnfilteredMatches = bookCounts.some((row) => Number(row.count) > 0);
		return {
			...empty,
			bookCounts: allBookCounts,
			suggestion: hasUnfilteredMatches ? null : await suggest(db, query.highlight[0])
		};
	}

	const rows = await db.execute<{
		id: number;
		book_id: number;
		chapter: number;
		verse_start: number | null;
		verse_end: number | null;
		title: string | null;
		body_html: string;
	}>(sql`
		select id, book_id, chapter, verse_start, verse_end, title, body_html
		from commentary_entries
		where resource_id = ${resourceId} and ${matches}
		order by book_id, chapter, verse_start nulls first, id
		limit ${pageSize} offset ${(page - 1) * pageSize}
	`);
	return {
		query,
		hits: rows.map((row) => ({
			id: row.id,
			book: row.book_id,
			chapter: row.chapter,
			verseStart: row.verse_start,
			verseEnd: row.verse_end,
			title: row.title,
			bodyHtml: row.body_html
		})),
		total,
		page,
		pageCount: Math.max(1, Math.ceil(total / pageSize)),
		bookCounts: allBookCounts,
		suggestion: null
	};
}

export async function search(
	db: Database,
	rawQuery: string,
	options: SearchOptions
): Promise<SearchResult> {
	const query = parseSearchQuery(rawQuery);
	const pageSize = options.pageSize ?? 25;
	const page = Math.max(1, options.page ?? 1);
	const empty: SearchResult = {
		query,
		hits: [],
		total: 0,
		page: 1,
		pageCount: 1,
		counts: [],
		bookCounts: [],
		suggestion: null
	};

	if (query.empty || options.resourceIds.length === 0) return empty;

	const { include, exclude, phrases } = buildPredicate(query);
	if (!include) return empty;

	const resources = sql.join(
		options.resourceIds.map((id) => sql`${id}`),
		sql`, `
	);

	const conditions = [sql`search_vector @@ (${include})`, ...phrases];
	if (exclude) conditions.push(sql`not (search_vector @@ (${exclude}))`);
	const baseMatches = sql.join(conditions, sql` and `);
	const matches = options.book ? sql`${baseMatches} and book_id = ${options.book}` : baseMatches;

	// Distinct verse references, in canonical order — the order a reader expects when studying a word
	// through scripture, rather than by relevance.
	const [countRow] = await db.execute<{ total: number }>(sql`
		select count(*)::int as total from (
			select distinct book_id, chapter, verse
			from verses
			where resource_id in (${resources}) and ${matches}
		) matched
	`);
	const total = Number(countRow?.total ?? 0);

	const bookCounts = await db.execute<{ book_id: number; count: number }>(sql`
		select book_id, count(*)::int as count from (
			select distinct book_id, chapter, verse
			from verses
			where resource_id in (${resources}) and ${baseMatches}
		) matched
		group by book_id
		order by book_id
	`);
	const bookCountsByBook = new Map(bookCounts.map((row) => [row.book_id, Number(row.count)]));
	const allBookCounts = BOOKS.map((book) => ({
		book: book.id,
		count: bookCountsByBook.get(book.id) ?? 0
	}));
	if (total === 0) {
		const hasUnfilteredMatches = bookCounts.some((row) => Number(row.count) > 0);
		return {
			...empty,
			bookCounts: allBookCounts,
			suggestion: hasUnfilteredMatches ? null : await suggest(db, query.highlight[0])
		};
	}

	const counts = await db.execute<{ resource_id: string; count: number }>(sql`
		select resource_id, count(*)::int as count
		from verses
		where resource_id in (${resources}) and ${matches}
		group by resource_id
	`);

	const references = await db.execute<{
		book_id: number;
		chapter: number;
		verse: number;
		matched_in: string[];
	}>(sql`
		select book_id, chapter, verse, array_agg(resource_id order by resource_id) as matched_in
		from verses
		where resource_id in (${resources}) and ${matches}
		group by book_id, chapter, verse
		order by book_id, chapter, verse
		limit ${pageSize} offset ${(page - 1) * pageSize}
	`);

	const hits = await attachParallelText(db, references, options.resourceIds);

	return {
		query,
		hits,
		total,
		page,
		pageCount: Math.max(1, Math.ceil(total / pageSize)),
		counts: counts.map((row) => ({ resourceId: row.resource_id, count: Number(row.count) })),
		// Zero-filled for every book so the chart's axis never grows or shrinks with the result set.
		bookCounts: allBookCounts,
		suggestion: null
	};
}

/**
 * Loads the text of every result verse in every selected translation, so results read like the reader
 * does. One query for the whole page.
 */
async function attachParallelText(
	db: Database,
	references: { book_id: number; chapter: number; verse: number; matched_in: string[] }[],
	resourceIds: string[]
): Promise<SearchHit[]> {
	if (references.length === 0) return [];

	const keys = sql.join(
		references.map(
			(reference) => sql`(${reference.book_id}, ${reference.chapter}, ${reference.verse})`
		),
		sql`, `
	);
	const resources = sql.join(
		resourceIds.map((id) => sql`${id}`),
		sql`, `
	);

	const rows = await db.execute<{
		resource_id: string;
		book_id: number;
		chapter: number;
		verse: number;
		segments: VerseSegment[];
	}>(sql`
		select resource_id, book_id, chapter, verse, segments
		from verses
		where resource_id in (${resources})
		  and (book_id, chapter, verse) in (${keys})
	`);

	const byKey = new Map<string, Map<string, VerseSegment[]>>();
	for (const row of rows) {
		const key = `${row.book_id}:${row.chapter}:${row.verse}`;
		const forVerse = byKey.get(key) ?? new Map<string, VerseSegment[]>();
		forVerse.set(row.resource_id, row.segments);
		byKey.set(key, forVerse);
	}

	return references.map((reference) => {
		const forVerse = byKey.get(`${reference.book_id}:${reference.chapter}:${reference.verse}`);
		return {
			book: reference.book_id,
			chapter: reference.chapter,
			verse: reference.verse,
			matchedIn: reference.matched_in,
			cells: resourceIds.map((id) => {
				const segments = forVerse?.get(id);
				return segments ? { verse: reference.verse, segments } : null;
			})
		};
	});
}

/**
 * A spelling suggestion for a search that found nothing, from the trigram index over the vocabulary
 * that actually occurs in the imported text.
 */
async function suggest(db: Database, term: string | undefined): Promise<string | null> {
	if (!term || term.length < 3) return null;

	const rows = await db.execute<{ word: string }>(sql`
		select word
		from search_terms
		where word % ${term}
		order by similarity(word, ${term}) desc, ndoc desc
		limit 1
	`);

	const suggestion = rows[0]?.word;
	return suggestion && suggestion !== term.toLowerCase() ? suggestion : null;
}
