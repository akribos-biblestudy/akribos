/**
 * The reader's own text selection.
 *
 * Marking a passage used to ride on `window.getSelection()`: the menu was opened from whichever of
 * `mouseup`, `touchend` or `selectionchange` a given browser happened to deliver, and the selected
 * string was mapped back onto word indices with `indexOf` over the verse's flattened text. Every
 * device class delivered a different subset of those events, and a phrase occurring twice in a verse
 * mapped onto the wrong occurrence.
 *
 * This model instead addresses words directly. Every rendered word carries its index as `data-w`
 * (see `highlightSegment` in `src/lib/bible/segments.ts`, which already assigns exactly the indices a
 * stored highlight uses), so a pointer position maps onto an exact word with no string matching, and
 * the only browser input needed is `pointerdown`/`pointermove`/`pointerup` — which every mouse,
 * finger and stylus reports the same way.
 *
 * This module is the pure part: what a selection *is* and which range each verse contributes to it.
 * `selection.svelte.ts` holds the reactive state and the pointer gesture on top of it.
 */

import type { SelectionRange } from '../bible/segments.ts';

/** A word inside one chapter, addressed exactly as a stored highlight addresses it. */
export type WordPoint = { verse: number; word: number };

/**
 * `word` selects a run of words inside one translation's own rendering, and therefore only means
 * something in that column. `verse` selects whole verses, which — like the verse-number highlight
 * that has always existed — applies to every translation at once.
 */
export type SelectionKind = 'word' | 'verse';

/** A selection with its endpoints in reading order, whichever way the reader dragged. */
export type SelectionSpan = { from: WordPoint; to: WordPoint };

export function comparePoints(a: WordPoint, b: WordPoint): number {
	return a.verse - b.verse || a.word - b.word;
}

/** Puts the two endpoints of a drag into reading order; dragging upwards is not a special case. */
export function normalizeSpan(anchor: WordPoint, head: WordPoint): SelectionSpan {
	return comparePoints(anchor, head) <= 0 ? { from: anchor, to: head } : { from: head, to: anchor };
}

/**
 * The word range one verse contributes to `span`, or null when the verse lies outside it.
 *
 * `wordCount` is that verse's own length, which is what makes a multi-verse span work: the first
 * verse runs from the selected word to its end, the verses in between are covered whole, and the last
 * one stops at the selected word. Indices are clamped, so a span built against a stale render can
 * never address a word the verse does not have.
 */
export function spanRangeForVerse(
	span: SelectionSpan,
	verse: number,
	wordCount: number
): SelectionRange | null {
	if (wordCount <= 0) return null;
	if (verse < span.from.verse || verse > span.to.verse) return null;

	const last = wordCount - 1;
	const start = verse === span.from.verse ? Math.min(Math.max(span.from.word, 0), last) : 0;
	const end = verse === span.to.verse ? Math.min(Math.max(span.to.word, 0), last) : last;
	return start <= end ? { start, end } : null;
}

/** Whether a span covers more than a single word — a bare tap is not yet a selection worth acting on. */
export function spansMultipleWords(span: SelectionSpan): boolean {
	return span.from.verse !== span.to.verse || span.from.word !== span.to.word;
}
