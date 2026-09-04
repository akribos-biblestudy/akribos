/**
 * Inclusive Bible passages, including ranges that cross chapter and book boundaries.
 *
 * Reader URLs deliberately keep using `VerseRef`, whose optional `verseEnd` always belongs to the
 * same chapter. Documents need a wider shape: a note may cover Genesis 1:31 through 2:3, without
 * changing the reader's established URL grammar. This module stays in the pure Bible domain and
 * performs no database I/O; actual per-resource verse availability remains a repository concern.
 */

import { findBookId, bookName, bookShortName } from './book-names.ts';
import { bookById } from './books.ts';
import { verseKey } from './reference.ts';

/** `verseKey()` reserves three decimal digits for a verse. Canonical verses are far below this. */
export const MAX_PASSAGE_VERSE = 999;

export type PassagePoint = {
	book: number;
	chapter: number;
	verse: number;
};

export type Passage = {
	start: PassagePoint;
	end: PassagePoint;
};

/** Flat values ready to insert into a document-passage row. */
export type PassageDbEndpoints = {
	startBookId: number;
	startChapter: number;
	startVerse: number;
	endBookId: number;
	endChapter: number;
	endVerse: number;
	startKey: number;
	endKey: number;
};

export type FormatPassageOptions = {
	/** `short` gives `Joh 3,16`; `full` gives `Johannes 3,16`. */
	style?: 'short' | 'full';
};

function isInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Validates the code-level canon only. It intentionally does not assert that an imported resource
 * contains the verse; translations and versifications differ, and checking that needs a repository.
 */
export function isValidPassagePoint(value: unknown): value is PassagePoint {
	if (!value || typeof value !== 'object') return false;
	const point = value as Partial<PassagePoint>;
	if (!isInteger(point.book) || !isInteger(point.chapter) || !isInteger(point.verse)) return false;

	const book = bookById(point.book);
	return (
		book !== undefined &&
		point.chapter >= 1 &&
		point.chapter <= book.chapters &&
		point.verse >= 1 &&
		point.verse <= MAX_PASSAGE_VERSE
	);
}

export function passagePointKey(point: PassagePoint): number {
	return verseKey(point.book, point.chapter, point.verse);
}

export function comparePassagePoints(left: PassagePoint, right: PassagePoint): number {
	return passagePointKey(left) - passagePointKey(right);
}

/**
 * Returns a validated passage in canonical order. Reversed user input is normalized rather than
 * discarded, which makes selecting a range in either direction produce the same stored endpoints.
 */
export function normalizePassage(passage: Passage): Passage | null;
export function normalizePassage(start: PassagePoint, end?: PassagePoint): Passage | null;
export function normalizePassage(
	passageOrStart: Passage | PassagePoint,
	endPoint?: PassagePoint
): Passage | null {
	const isPassage = 'start' in passageOrStart && 'end' in passageOrStart;
	const start = isPassage ? passageOrStart.start : passageOrStart;
	const end = isPassage ? passageOrStart.end : (endPoint ?? start);
	if (!isValidPassagePoint(start) || !isValidPassagePoint(end)) return null;

	const ordered =
		comparePassagePoints(start, end) <= 0 ? { start, end } : { start: end, end: start };
	return {
		start: { ...ordered.start },
		end: { ...ordered.end }
	};
}

function parseFullPoint(input: string): PassagePoint | null {
	const match = /^(.+?)\s*(\d{1,3})\s*[,:_]\s*(\d{1,3})$/u.exec(input.trim());
	if (!match) return null;

	const book = findBookId(match[1] ?? '');
	const point = {
		book: book ?? 0,
		chapter: Number(match[2]),
		verse: Number(match[3])
	};
	return isValidPassagePoint(point) ? point : null;
}

function parseRangeEnd(input: string, start: PassagePoint): PassagePoint | null {
	const trimmed = input.trim();
	if (/^\d{1,3}$/u.test(trimmed)) {
		const point = { ...start, verse: Number(trimmed) };
		return isValidPassagePoint(point) ? point : null;
	}

	const sameBook = /^(\d{1,3})\s*[,:_]\s*(\d{1,3})$/u.exec(trimmed);
	if (sameBook) {
		const point = { book: start.book, chapter: Number(sameBook[1]), verse: Number(sameBook[2]) };
		return isValidPassagePoint(point) ? point : null;
	}

	return parseFullPoint(trimmed);
}

/**
 * Parses a verse or inclusive range. The range end may repeat the book, omit only the book, or omit
 * both book and chapter:
 *
 * - `Joh 3,16`
 * - `Joh 3,16-18`
 * - `1Mo 1,31-2,3`
 * - `1Mo 50,26-2Mo 1,2`
 */
export function parsePassage(input: string): Passage | null {
	const parts = input
		.trim()
		.replace(/\s+/gu, ' ')
		.split(/\s*[-–—]\s*/u);
	if (parts.length < 1 || parts.length > 2 || !parts[0]) return null;

	const start = parseFullPoint(parts[0]);
	if (!start) return null;
	if (parts.length === 1) return normalizePassage(start);

	const end = parts[1] ? parseRangeEnd(parts[1], start) : null;
	return end ? normalizePassage(start, end) : null;
}

function pointLabel(point: PassagePoint, style: 'short' | 'full'): string {
	const name = style === 'full' ? bookName(point.book) : bookShortName(point.book);
	return `${name} ${point.chapter},${point.verse}`;
}

/** Formats a normalized, compact German reference, omitting repeated book/chapter parts. */
export function formatPassage(passage: Passage, options: FormatPassageOptions = {}): string | null {
	const normalized = normalizePassage(passage);
	if (!normalized) return null;
	const { start, end } = normalized;
	const style = options.style ?? 'short';
	const startLabel = pointLabel(start, style);

	if (passagePointKey(start) === passagePointKey(end)) return startLabel;
	if (start.book === end.book && start.chapter === end.chapter) {
		return `${startLabel}-${end.verse}`;
	}
	if (start.book === end.book) {
		return `${startLabel}-${end.chapter},${end.verse}`;
	}
	return `${startLabel}-${pointLabel(end, style)}`;
}

/** Converts a passage into flat endpoint columns and redundant sortable keys for indexed overlap. */
export function passageToDbEndpoints(passage: Passage): PassageDbEndpoints | null {
	const normalized = normalizePassage(passage);
	if (!normalized) return null;
	return {
		startBookId: normalized.start.book,
		startChapter: normalized.start.chapter,
		startVerse: normalized.start.verse,
		endBookId: normalized.end.book,
		endChapter: normalized.end.chapter,
		endVerse: normalized.end.verse,
		startKey: passagePointKey(normalized.start),
		endKey: passagePointKey(normalized.end)
	};
}

/** Alias with a shorter name for non-database callers that still need flat endpoints. */
export const passageToEndpoints = passageToDbEndpoints;

/** Reconstructs and validates a passage read from flat database columns. */
export function passageFromDbEndpoints(endpoints: PassageDbEndpoints): Passage | null {
	const passage = normalizePassage(
		{
			book: endpoints.startBookId,
			chapter: endpoints.startChapter,
			verse: endpoints.startVerse
		},
		{
			book: endpoints.endBookId,
			chapter: endpoints.endChapter,
			verse: endpoints.endVerse
		}
	);
	if (!passage) return null;

	// Redundant keys are database integrity checks, not another source of truth.
	if (
		endpoints.startKey !== passagePointKey(passage.start) ||
		endpoints.endKey !== passagePointKey(passage.end)
	) {
		return null;
	}
	return passage;
}

export const passageFromEndpoints = passageFromDbEndpoints;

/** Inclusive overlap: touching at either endpoint counts as an intersection. */
export function passagesOverlap(left: Passage, right: Passage): boolean {
	const normalizedLeft = normalizePassage(left);
	const normalizedRight = normalizePassage(right);
	if (!normalizedLeft || !normalizedRight) return false;

	return (
		passagePointKey(normalizedLeft.start) <= passagePointKey(normalizedRight.end) &&
		passagePointKey(normalizedLeft.end) >= passagePointKey(normalizedRight.start)
	);
}

export function passageContainsPoint(passage: Passage, point: PassagePoint): boolean {
	const normalized = normalizePassage(passage);
	if (!normalized || !isValidPassagePoint(point)) return false;
	const key = passagePointKey(point);
	return key >= passagePointKey(normalized.start) && key <= passagePointKey(normalized.end);
}
