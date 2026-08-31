/**
 * Verse highlights: which verse (or section of a verse) carries which colour from a reader's palette.
 *
 * A whole-verse highlight (`resourceId` null) applies in every translation and a verse holds at most
 * one — picking a different colour replaces it rather than stacking, matching a physical highlighter.
 * A partial highlight is scoped to one translation's own word range instead, because a selection made
 * in one column's rendering has no general meaning in another; a verse may carry several of these
 * (different sections, possibly different colours) side by side.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { countVerseWords, type VerseSegment } from '../../bible/segments.ts';
import { highlightStyles, verseHighlights, verses } from '../db/schema.ts';

export type ChapterHighlight = {
	verse: number;
	/** Last verse of the section; equal to `verse` unless a translation-specific one spans several. */
	endVerse: number;
	styleId: string;
	color: string;
	name: string | null;
	/** Null for a whole-verse highlight; the translation a partial one belongs to otherwise. */
	resourceId: string | null;
	/** First covered word of `verse`, last covered word of `endVerse`; null with `resourceId`. */
	startWord: number | null;
	endWord: number | null;
};

/**
 * A translation-specific span, as selected in the reader: `start` is a word index in the section's
 * first verse (the one the reference names) and `end` one in `endVerse`. `endVerse` is left out for a
 * section that stays inside a single verse.
 */
export type WordRange = { resourceId: string; start: number; end: number; endVerse?: number };

/** The verse a section starts at, plus the verse it ends at for a whole-verse section. */
export type SectionReference = {
	book: number;
	chapter: number;
	verse: number;
	/** Last verse a whole-verse section covers; defaults to `verse`. */
	verseEnd?: number;
};

export type HighlightedVerse = {
	id: string;
	book: number;
	chapter: number;
	verse: number;
	endVerse: number;
	segments: VerseSegment[] | null;
	updatedAt: Date;
	/** Null for a whole-verse highlight; the translation a partial one belongs to otherwise. */
	resourceId: string | null;
	startWord: number | null;
	endWord: number | null;
};

/**
 * All verses carrying one palette colour, with text from the requested Bible where available.
 *
 * A partial highlight only ever means something in its own translation, so its text is loaded from
 * `resourceId` on the highlight itself rather than the requested one; a whole-verse highlight falls
 * back to `defaultResourceId` as before.
 */
export async function listHighlightedVerses(
	db: Database,
	userId: string,
	styleId: string,
	defaultResourceId: string | null
): Promise<{
	style: { id: string; color: string; name: string | null };
	verses: HighlightedVerse[];
} | null> {
	const [style] = await db
		.select({ id: highlightStyles.id, color: highlightStyles.color, name: highlightStyles.name })
		.from(highlightStyles)
		.where(and(eq(highlightStyles.id, styleId), eq(highlightStyles.userId, userId)))
		.limit(1);
	if (!style) return null;

	const highlighted = await db
		.select({
			id: verseHighlights.id,
			book: verseHighlights.bookId,
			chapter: verseHighlights.chapter,
			verse: verseHighlights.verse,
			endVerse: verseHighlights.endVerse,
			segments: verses.segments,
			updatedAt: verseHighlights.updatedAt,
			resourceId: verseHighlights.resourceId,
			startWord: verseHighlights.startWord,
			endWord: verseHighlights.endWord
		})
		.from(verseHighlights)
		.leftJoin(
			verses,
			and(
				// A partial highlight only exists relative to its own translation; a whole-verse one
				// falls back to whichever bible the caller asked for.
				eq(verses.resourceId, sql`coalesce(${verseHighlights.resourceId}, ${defaultResourceId})`),
				eq(verses.bookId, verseHighlights.bookId),
				eq(verses.chapter, verseHighlights.chapter),
				eq(verses.verse, verseHighlights.verse)
			)
		)
		.where(and(eq(verseHighlights.userId, userId), eq(verseHighlights.styleId, styleId)))
		.orderBy(asc(verseHighlights.bookId), asc(verseHighlights.chapter), asc(verseHighlights.verse));

	return { style, verses: highlighted };
}

export async function loadChapterHighlights(
	db: Database,
	userId: string,
	book: number,
	chapter: number
): Promise<ChapterHighlight[]> {
	return db
		.select({
			verse: verseHighlights.verse,
			endVerse: verseHighlights.endVerse,
			styleId: verseHighlights.styleId,
			color: highlightStyles.color,
			name: highlightStyles.name,
			resourceId: verseHighlights.resourceId,
			startWord: verseHighlights.startWord,
			endWord: verseHighlights.endWord
		})
		.from(verseHighlights)
		.innerJoin(highlightStyles, eq(highlightStyles.id, verseHighlights.styleId))
		.where(
			and(
				eq(verseHighlights.userId, userId),
				eq(verseHighlights.bookId, book),
				eq(verseHighlights.chapter, chapter)
			)
		);
}

type ResolvedRange = { resourceId: string; endVerse: number; start: number; end: number };

/** How many words the reader's rendering of one verse has, or 0 when there is no such verse. */
async function wordCountAt(
	db: Database,
	resourceId: string,
	book: number,
	chapter: number,
	verse: number
): Promise<number> {
	const [row] = await db
		.select({ segments: verses.segments })
		.from(verses)
		.where(
			and(
				eq(verses.resourceId, resourceId),
				eq(verses.bookId, book),
				eq(verses.chapter, chapter),
				eq(verses.verse, verse)
			)
		)
		.limit(1);
	return row ? countVerseWords(row.segments) : 0;
}

/**
 * Clamps a reader-supplied span to the word counts of the verses it actually starts and ends in, and
 * collapses a single-verse span to a whole-verse highlight (`null`) when it turns out to cover that
 * verse entirely — the same rule the reader applies client-side, re-checked here because a request is
 * never trusted at face value. A span across several verses is never collapsed: it stays specific to
 * the translation it was drawn in, since the verses in between are only "whole" in that rendering.
 *
 * `undefined` means the span does not resolve to real verses at all (unknown resource or reference, or
 * a verse with no words), which the caller treats as a no-op.
 */
async function resolvePartialRange(
	db: Database,
	reference: { book: number; chapter: number; verse: number },
	range: WordRange
): Promise<ResolvedRange | null | undefined> {
	const endVerse = Math.max(reference.verse, range.endVerse ?? reference.verse);

	const startCount = await wordCountAt(
		db,
		range.resourceId,
		reference.book,
		reference.chapter,
		reference.verse
	);
	if (startCount === 0) return undefined;

	const endCount =
		endVerse === reference.verse
			? startCount
			: await wordCountAt(db, range.resourceId, reference.book, reference.chapter, endVerse);
	if (endCount === 0) return undefined;

	const start = Math.min(Math.max(range.start, 0), startCount - 1);
	const end = Math.min(Math.max(range.end, 0), endCount - 1);

	if (endVerse === reference.verse) {
		const orderedEnd = Math.max(start, end);
		if (start === 0 && orderedEnd === startCount - 1) return null;
		return { resourceId: range.resourceId, endVerse, start, end: orderedEnd };
	}

	return { resourceId: range.resourceId, endVerse, start, end };
}

/** The verses a whole-verse section covers, which is stored as one row each. */
function versesOf(reference: SectionReference): number[] {
	const last = Math.max(reference.verse, reference.verseEnd ?? reference.verse);
	const out: number[] = [];
	for (let verse = reference.verse; verse <= last; verse += 1) out.push(verse);
	return out;
}

/** A no-op if `styleId` does not name one of this user's own styles. */
export async function setVerseHighlight(
	db: Database,
	userId: string,
	reference: SectionReference,
	styleId: string,
	range?: WordRange | null
): Promise<void> {
	const [style] = await db
		.select({ id: highlightStyles.id })
		.from(highlightStyles)
		.where(and(eq(highlightStyles.id, styleId), eq(highlightStyles.userId, userId)))
		.limit(1);
	if (!style) return;

	const resolved = range ? await resolvePartialRange(db, reference, range) : null;
	if (resolved === undefined) return;

	if (resolved) {
		await db
			.insert(verseHighlights)
			.values({
				userId,
				styleId,
				bookId: reference.book,
				chapter: reference.chapter,
				verse: reference.verse,
				endVerse: resolved.endVerse,
				resourceId: resolved.resourceId,
				startWord: resolved.start,
				endWord: resolved.end
			})
			.onConflictDoUpdate({
				target: [
					verseHighlights.userId,
					verseHighlights.resourceId,
					verseHighlights.bookId,
					verseHighlights.chapter,
					verseHighlights.verse,
					verseHighlights.endVerse,
					verseHighlights.startWord,
					verseHighlights.endWord
				],
				targetWhere: sql`${verseHighlights.resourceId} is not null`,
				set: { styleId, updatedAt: new Date() }
			});
		return;
	}

	// A whole-verse section is one row per verse, so that recolouring a single verse later replaces
	// what it got here instead of stacking a second colour on it.
	await db
		.insert(verseHighlights)
		.values(
			versesOf(reference).map((verse) => ({
				userId,
				styleId,
				bookId: reference.book,
				chapter: reference.chapter,
				verse,
				endVerse: verse
			}))
		)
		.onConflictDoUpdate({
			target: [
				verseHighlights.userId,
				verseHighlights.bookId,
				verseHighlights.chapter,
				verseHighlights.verse
			],
			targetWhere: sql`${verseHighlights.resourceId} is null`,
			set: { styleId, updatedAt: new Date() }
		});
}

export async function removeVerseHighlight(
	db: Database,
	userId: string,
	reference: SectionReference,
	range?: WordRange | null
): Promise<void> {
	if (range) {
		await db
			.delete(verseHighlights)
			.where(
				and(
					eq(verseHighlights.userId, userId),
					eq(verseHighlights.bookId, reference.book),
					eq(verseHighlights.chapter, reference.chapter),
					eq(verseHighlights.verse, reference.verse),
					eq(
						verseHighlights.endVerse,
						Math.max(reference.verse, range.endVerse ?? reference.verse)
					),
					eq(verseHighlights.resourceId, range.resourceId),
					eq(verseHighlights.startWord, range.start),
					eq(verseHighlights.endWord, range.end)
				)
			);
		return;
	}

	await db
		.delete(verseHighlights)
		.where(
			and(
				eq(verseHighlights.userId, userId),
				eq(verseHighlights.bookId, reference.book),
				eq(verseHighlights.chapter, reference.chapter),
				inArray(verseHighlights.verse, versesOf(reference)),
				sql`${verseHighlights.resourceId} is null`
			)
		);
}
