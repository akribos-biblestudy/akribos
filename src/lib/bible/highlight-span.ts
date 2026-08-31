/**
 * Spreading a stored highlight over the verses it covers.
 *
 * A highlight is stored as two endpoints — `verse`/`startWord` through `endVerse`/`endWord` — so a
 * section running from one verse into the next has to be split back into one painted range per verse
 * before it can be rendered. `spanRangeForVerse` is that split, measured against each verse's own
 * length.
 *
 * There is currently no way to create such a section in the reader: highlighting is done from a verse
 * number's menu and covers whole verses. The stored shape still supports word ranges and multi-verse
 * sections (see `verseHighlights` in `src/lib/server/db/schema.ts`), and highlights written while the
 * selection UI existed are still displayed, which is what this is for.
 */

import type { HighlightRange } from './segments.ts';

/** A word inside one chapter, addressed exactly as a stored highlight addresses it. */
export type WordPoint = { verse: number; word: number };

/** A stored highlight's two endpoints, in reading order. */
export type HighlightSpan = { from: WordPoint; to: WordPoint };

/**
 * The word range one verse contributes to `span`, or null when the verse lies outside it.
 *
 * `wordCount` is that verse's own length, which is what makes a multi-verse span work: the first
 * verse runs from the stored word to its end, the verses in between are covered whole, and the last
 * one stops at the stored word. Indices are clamped, so a span stored against text that has since
 * been re-imported can never address a word the verse does not have.
 */
export function spanRangeForVerse(
	span: HighlightSpan,
	verse: number,
	wordCount: number
): Omit<HighlightRange, 'color'> | null {
	if (wordCount <= 0) return null;
	if (verse < span.from.verse || verse > span.to.verse) return null;

	const last = wordCount - 1;
	const start = verse === span.from.verse ? Math.min(Math.max(span.from.word, 0), last) : 0;
	const end = verse === span.to.verse ? Math.min(Math.max(span.to.word, 0), last) : last;
	return start <= end ? { start, end } : null;
}
