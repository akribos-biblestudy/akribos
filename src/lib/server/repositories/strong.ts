/**
 * Everything a Strong word study shows for a Strong's number.
 *
 * The old implementation loaded every verse containing the number, scanned each one with string
 * searches and counted the renderings in Python — on every study open. Here the dictionary entry is
 * one indexed read and the statistics come from the materialised views, so the whole panel is four
 * cheap queries regardless of how common the word is.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { bookIdsForTestament } from '../../bible/books.ts';
import { normalizeStrongId, strongLanguage, type StrongId } from '../../bible/strong.ts';
import type { VerseSegment } from '../../bible/segments.ts';
import type { Database } from '../db/client.ts';
import { lexiconEntries, resources, verses, verseWords } from '../db/schema.ts';

export type StrongEntry = {
	strong: StrongId;
	lemma: string;
	transliteration: string | null;
	pronunciation: string | null;
	definitionHtml: string | null;
	derivationHtml: string | null;
	kjvDefinitionHtml: string | null;
	seeAlso: string[];
	language: 'grc' | 'hbo';
	/** Rights notice of the lexicon this entry came from, e.g. a translated dictionary's copyright. */
	licenseHtml: string | null;
	/** The lexicon's own "how to read this" preface, e.g. Kautz' "Hinweise zur Benützung des Lexikons". */
	usageNotesHtml: string | null;
};

export type StrongGloss = {
	display: string;
	occurrences: number;
};

export type StrongOccurrence = {
	book: number;
	chapter: number;
	verse: number;
	segments: VerseSegment[];
	/** Morphology of the word in this verse, where the source has it. */
	morph: string | null;
	lemma: string | null;
};

export type StrongStatistics = {
	occurrences: number;
	verseCount: number;
};

export type StrongBookCount = {
	book: number;
	count: number;
};

/** The dictionary entry, from whichever lexicon covers the number. */
export async function loadStrongEntry(
	db: Database,
	strong: StrongId
): Promise<StrongEntry | undefined> {
	const [row] = await db
		.select({
			strong: lexiconEntries.strong,
			lemma: lexiconEntries.lemma,
			transliteration: lexiconEntries.transliteration,
			pronunciation: lexiconEntries.pronunciation,
			definitionHtml: lexiconEntries.definitionHtml,
			derivationHtml: lexiconEntries.derivationHtml,
			kjvDefinitionHtml: lexiconEntries.kjvDefinitionHtml,
			seeAlso: lexiconEntries.seeAlso,
			language: lexiconEntries.language,
			licenseHtml: resources.licenseHtml,
			usageNotesHtml: resources.usageNotesHtml
		})
		.from(lexiconEntries)
		.innerJoin(resources, eq(resources.id, lexiconEntries.resourceId))
		.where(and(eq(lexiconEntries.strong, strong), eq(resources.isPublic, true)))
		.orderBy(asc(resources.sortOrder))
		.limit(1);

	return row;
}

/**
 * Resolves a lexicon tab's input inside one concrete dictionary. Strong numbers are exact; ordinary
 * words match the lemma or transliteration, preferring an exact spelling before the first prefix.
 * Keeping the resource id mandatory is what makes several dictionaries independently searchable.
 */
export async function findLexiconEntry(
	db: Database,
	resourceId: string,
	rawLookup: string
): Promise<StrongEntry | undefined> {
	const lookup = rawLookup.trim().slice(0, 200);
	if (!lookup) return undefined;
	const strong = normalizeStrongId(lookup);
	const wordMatch = sql`(
		starts_with(unaccent(lower(${lexiconEntries.lemma})), unaccent(lower(${lookup})))
		or starts_with(unaccent(lower(coalesce(${lexiconEntries.transliteration}, ''))), unaccent(lower(${lookup})))
	)`;
	const exactWord = sql`(
		unaccent(lower(${lexiconEntries.lemma})) = unaccent(lower(${lookup}))
		or unaccent(lower(coalesce(${lexiconEntries.transliteration}, ''))) = unaccent(lower(${lookup}))
	)`;

	const [row] = await db
		.select({
			strong: lexiconEntries.strong,
			lemma: lexiconEntries.lemma,
			transliteration: lexiconEntries.transliteration,
			pronunciation: lexiconEntries.pronunciation,
			definitionHtml: lexiconEntries.definitionHtml,
			derivationHtml: lexiconEntries.derivationHtml,
			kjvDefinitionHtml: lexiconEntries.kjvDefinitionHtml,
			seeAlso: lexiconEntries.seeAlso,
			language: lexiconEntries.language,
			licenseHtml: resources.licenseHtml,
			usageNotesHtml: resources.usageNotesHtml
		})
		.from(lexiconEntries)
		.innerJoin(resources, eq(resources.id, lexiconEntries.resourceId))
		.where(
			and(
				eq(lexiconEntries.resourceId, resourceId),
				eq(resources.isPublic, true),
				eq(resources.status, 'ready'),
				strong ? eq(lexiconEntries.strong, strong) : wordMatch
			)
		)
		.orderBy(
			strong ? asc(lexiconEntries.strong) : sql`case when ${exactWord} then 0 else 1 end`,
			asc(lexiconEntries.strong)
		)
		.limit(1);

	return row;
}

/** How often the number occurs in a translation, and in how many verses. */
export async function loadStrongStatistics(
	db: Database,
	strong: StrongId,
	resourceId: string
): Promise<StrongStatistics> {
	const rows = await db.execute<{ occurrences: number; verse_count: number }>(sql`
		select occurrences, verse_count
		from strong_stats
		where resource_id = ${resourceId} and strong = ${strong}
	`);

	const row = rows[0];
	return {
		occurrences: Number(row?.occurrences ?? 0),
		verseCount: Number(row?.verse_count ?? 0)
	};
}

/**
 * How often a Strong-tagged word occurs in each biblical book.
 *
 * Includes every book of the word's own testament, zero-filled where it does not occur — a Strong's
 * number is Hebrew or Greek by construction, so the chart's book axis is fixed regardless of which
 * books happen to have a hit, rather than growing and shrinking with the result set.
 */
export async function loadStrongBookCounts(
	db: Database,
	strong: StrongId,
	resourceId: string
): Promise<StrongBookCount[]> {
	const rows = await db.execute<{ book_id: number; count: number }>(sql`
		select book_id, count(*)::int as count
		from ${verseWords}
		where resource_id = ${resourceId} and strong = ${strong}
		group by book_id
		order by book_id
	`);

	const counts = new Map(rows.map((row) => [row.book_id, Number(row.count)]));
	const testament = strongLanguage(strong) === 'hebrew' ? 'ot' : 'nt';
	return bookIdsForTestament(testament).map((book) => ({ book, count: counts.get(book) ?? 0 }));
}

/**
 * How a translation renders the word, most frequent first — the "Übersetzt als" table.
 */
export async function loadStrongGlosses(
	db: Database,
	strong: StrongId,
	resourceId: string,
	limit = 12
): Promise<StrongGloss[]> {
	const rows = await db.execute<{ display: string; occurrences: number }>(sql`
		select display, occurrences
		from strong_glosses
		where resource_id = ${resourceId} and strong = ${strong}
		order by rank
		limit ${limit}
	`);

	return rows.map((row) => ({ display: row.display, occurrences: Number(row.occurrences) }));
}

export type OccurrencePage = {
	occurrences: StrongOccurrence[];
	total: number;
	page: number;
	pageCount: number;
};

/**
 * Verses containing the number, in canonical order, paginated.
 *
 * `distinct on` collapses a verse that contains the word several times into a single result, keeping
 * the first occurrence's morphology — otherwise a verse using a word three times would fill three
 * slots of the list.
 */
export async function loadStrongOccurrences(
	db: Database,
	strong: StrongId,
	resourceId: string,
	options: { page?: number; pageSize?: number; book?: number; gloss?: string } = {}
): Promise<OccurrencePage> {
	const pageSize = options.pageSize ?? 25;
	const page = Math.max(1, options.page ?? 1);
	const offset = (page - 1) * pageSize;
	const bookCondition = options.book ? sql`and book_id = ${options.book}` : sql``;
	const glossCondition = options.gloss?.trim()
		? sql`and lower(btrim(word)) = lower(btrim(${options.gloss}))`
		: sql``;

	const [{ count } = { count: 0 }] = await db.execute<{ count: number }>(sql`
		select count(distinct ${verseWords.verseId})::int as count
		from ${verseWords}
		where ${verseWords.resourceId} = ${resourceId} and ${verseWords.strong} = ${strong}
		${bookCondition}
		${glossCondition}
	`);

	const rows = await db.execute<{
		book_id: number;
		chapter: number;
		verse: number;
		segments: VerseSegment[];
		morph: string | null;
		lemma: string | null;
	}>(sql`
		select v.book_id, v.chapter, v.verse, v.segments, w.morph, w.lemma
		from (
			select distinct on (verse_id) verse_id, morph, lemma
			from ${verseWords}
			where resource_id = ${resourceId} and strong = ${strong}
			${bookCondition}
			${glossCondition}
			order by verse_id, position
		) w
		join ${verses} v on v.id = w.verse_id
		order by v.book_id, v.chapter, v.verse
		limit ${pageSize} offset ${offset}
	`);

	return {
		occurrences: rows.map((row) => ({
			book: row.book_id,
			chapter: row.chapter,
			verse: row.verse,
			segments: row.segments,
			morph: row.morph,
			lemma: row.lemma
		})),
		total: Number(count),
		page,
		pageCount: Math.max(1, Math.ceil(Number(count) / pageSize))
	};
}

/**
 * The word as it appears in the original-language text of a verse, with its morphology.
 *
 * This is what turns "Gott" in a German column into "θεός, noun nominative singular masculine" in the
 * word study: the German word carries the Strong's number, and the Greek resource carries the form.
 */
export async function loadOriginalWord(
	db: Database,
	options: { strong: StrongId; book: number; chapter: number; verse: number }
): Promise<
	{ word: string; morph: string | null; lemma: string | null; resourceId: string } | undefined
> {
	const language = strongLanguage(options.strong) === 'greek' ? 'grc' : 'hbo';

	const [row] = await db
		.select({
			word: verseWords.word,
			morph: verseWords.morph,
			lemma: verseWords.lemma,
			resourceId: verseWords.resourceId
		})
		.from(verseWords)
		.innerJoin(verses, eq(verses.id, verseWords.verseId))
		.innerJoin(resources, eq(resources.id, verseWords.resourceId))
		.where(
			and(
				eq(verseWords.strong, options.strong),
				eq(verses.bookId, options.book),
				eq(verses.chapter, options.chapter),
				eq(verses.verse, options.verse),
				eq(resources.language, language),
				eq(resources.isPublic, true)
			)
		)
		// Several original-language resources may cover the verse. Prefer an actual morphology code,
		// then the administrator's resource order, so every lexicon gets the same deterministic merge.
		.orderBy(
			sql`case when nullif(btrim(${verseWords.morph}), '') is null then 1 else 0 end`,
			desc(resources.hasMorphology),
			asc(resources.sortOrder),
			asc(verseWords.position)
		)
		.limit(1);

	return row;
}

/**
 * Which of the reader's translations to base the statistics on: the first selected one that actually
 * carries Strong's numbers for the number's own testament, since a translation without them — or one
 * that only covers the other testament, like a Greek NT interlinear — has nothing to count.
 */
export async function pickStatisticsResource(
	db: Database,
	resourceIds: string[],
	strong: StrongId
): Promise<string | undefined> {
	if (resourceIds.length === 0) return undefined;

	const canon = strongLanguage(strong) === 'hebrew' ? 'ot' : 'nt';

	const rows = await db
		.select({ id: resources.id, canon: resources.canon })
		.from(resources)
		.where(and(inArray(resources.id, resourceIds), eq(resources.hasStrongs, true)))
		.orderBy(asc(resources.sortOrder));

	const preferred = resourceIds.find((id) =>
		rows.some((row) => row.id === id && (row.canon === canon || row.canon === 'both'))
	);
	if (preferred) return preferred;

	// None of the reader's columns has Strong's numbers covering this testament; fall back to any
	// translation that does.
	const [fallback] = await db
		.select({ id: resources.id })
		.from(resources)
		.where(
			and(
				eq(resources.hasStrongs, true),
				eq(resources.kind, 'bible'),
				eq(resources.isPublic, true),
				inArray(resources.canon, [canon, 'both'])
			)
		)
		.orderBy(desc(resources.wordCount))
		.limit(1);

	return fallback?.id;
}
