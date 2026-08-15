/**
 * Verse highlights: which verse (or section of a verse) carries which colour from a reader's palette.
 *
 * A whole-verse highlight (`resourceId` null) applies in every translation and a verse holds at most
 * one — picking a different colour replaces it rather than stacking, matching a physical highlighter.
 * A partial highlight is scoped to one translation's own word range instead, because a selection made
 * in one column's rendering has no general meaning in another; a verse may carry several of these
 * (different sections, possibly different colours) side by side.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { countVerseWords, type VerseSegment } from '../../bible/segments.ts';
import { highlightStyles, verseHighlights, verses } from '../db/schema.ts';

export type ChapterHighlight = {
	verse: number;
	styleId: string;
	color: string;
	name: string | null;
	/** Null for a whole-verse highlight; the translation a partial one belongs to otherwise. */
	resourceId: string | null;
	/** Inclusive word range within `resourceId`'s rendering; null together with `resourceId`. */
	startWord: number | null;
	endWord: number | null;
};

/** A translation-specific word range, as selected in the reader. */
export type WordRange = { resourceId: string; start: number; end: number };

export type HighlightedVerse = {
	id: string;
	book: number;
	chapter: number;
	verse: number;
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

/**
 * Clamps a reader-supplied word range to the verse's actual word count and collapses it to a
 * whole-verse highlight (`null`) when it turns out to cover the entire verse — the same rule the
 * reader applies client-side, re-checked here because a request is never trusted at face value.
 * `undefined` means the range does not resolve to a real verse at all (unknown resource/reference or a
 * verse with no words), which the caller treats as a no-op.
 */
async function resolvePartialRange(
	db: Database,
	reference: { book: number; chapter: number; verse: number },
	range: WordRange
): Promise<{ resourceId: string; start: number; end: number } | null | undefined> {
	const [row] = await db
		.select({ segments: verses.segments })
		.from(verses)
		.where(
			and(
				eq(verses.resourceId, range.resourceId),
				eq(verses.bookId, reference.book),
				eq(verses.chapter, reference.chapter),
				eq(verses.verse, reference.verse)
			)
		)
		.limit(1);
	if (!row) return undefined;

	const count = countVerseWords(row.segments);
	if (count === 0) return undefined;

	const start = Math.max(0, Math.min(range.start, count - 1));
	const end = Math.max(start, Math.min(range.end, count - 1));
	if (start === 0 && end === count - 1) return null;
	return { resourceId: range.resourceId, start, end };
}

/** A no-op if `styleId` does not name one of this user's own styles. */
export async function setVerseHighlight(
	db: Database,
	userId: string,
	reference: { book: number; chapter: number; verse: number },
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
					verseHighlights.startWord,
					verseHighlights.endWord
				],
				targetWhere: sql`${verseHighlights.resourceId} is not null`,
				set: { styleId, updatedAt: new Date() }
			});
		return;
	}

	await db
		.insert(verseHighlights)
		.values({
			userId,
			styleId,
			bookId: reference.book,
			chapter: reference.chapter,
			verse: reference.verse
		})
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
	reference: { book: number; chapter: number; verse: number },
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
				eq(verseHighlights.verse, reference.verse),
				sql`${verseHighlights.resourceId} is null`
			)
		);
}
