/**
 * Reactive state for the reader's own text selection. See `selection.ts` for why the reader no
 * longer uses `window.getSelection()` at all.
 */

import type { SelectionRange } from '../bible/segments.ts';
import {
	normalizeSpan,
	spanRangeForVerse,
	spansMultipleWords,
	type SelectionKind,
	type SelectionSpan,
	type WordPoint
} from './selection.ts';

/** Where a pointer landed, resolved from the reader's own `data-` attributes. */
export type WordTarget = {
	/** `${book}:${chapter}`, so a selection cannot run off the chapter it started in. */
	chapterKey: string;
	resourceId: string;
	verse: number;
	word: number;
};

/**
 * Resolves the element under a pointer to the word it renders.
 *
 * Returns null for anything that is not verse text — the gutter, a heading, a footnote marker, the
 * whitespace between two words — which is what lets the caller tell "the reader is selecting" from
 * "the reader is scrolling or tapping something else".
 */
export function wordTargetFromElement(element: Element | null): WordTarget | null {
	const wordEl = element?.closest<HTMLElement>('[data-w]');
	if (!wordEl) return null;

	const verseEl = wordEl.closest<HTMLElement>('.flow-verse[data-verse-key]');
	const columnEl = wordEl.closest<HTMLElement>('.flow-column[data-resource-id]');
	if (!verseEl || !columnEl) return null;

	const [book, chapter, verse] = (verseEl.dataset.verseKey ?? '').split(':').map(Number);
	const word = Number(wordEl.dataset.w);
	const resourceId = columnEl.dataset.resourceId ?? '';
	if (![book, chapter, verse, word].every(Number.isInteger) || !resourceId) return null;

	return { chapterKey: `${book}:${chapter}`, resourceId, verse: verse!, word };
}

/**
 * The passage the reader is currently marking out.
 *
 * A selection never leaves the chapter it started in, and a word selection never leaves the column it
 * started in: a word index only means something within one translation's own rendering, and the two
 * columns of a parallel view are independently scrolled anyway. A verse selection carries no column,
 * because whole verses mean the same thing in every translation.
 */
export class ReaderSelection {
	kind = $state<SelectionKind | null>(null);
	chapterKey = $state('');
	/** Empty for a verse selection, which applies to every translation. */
	resourceId = $state('');
	anchor = $state<WordPoint>({ verse: 0, word: 0 });
	head = $state<WordPoint>({ verse: 0, word: 0 });
	/** True while a pointer is still dragging the far end around. */
	dragging = $state(false);

	get active(): boolean {
		return this.kind !== null;
	}

	get span(): SelectionSpan {
		return normalizeSpan(this.anchor, this.head);
	}

	/** A single tapped word is a selection the reader can still extend, but not one worth storing. */
	get meaningful(): boolean {
		return this.kind === 'verse' || (this.active && spansMultipleWords(this.span));
	}

	begin(kind: SelectionKind, chapterKey: string, resourceId: string, point: WordPoint): void {
		this.kind = kind;
		this.chapterKey = chapterKey;
		this.resourceId = kind === 'verse' ? '' : resourceId;
		this.anchor = point;
		this.head = point;
	}

	/** Moves the far end. Ignored for a point in another chapter or, for word selections, another
	 *  column — the reader keeps the last valid end instead of the selection jumping or collapsing. */
	extendTo(target: WordTarget): void {
		if (!this.active) return;
		if (target.chapterKey !== this.chapterKey) return;
		if (this.kind === 'word' && target.resourceId !== this.resourceId) return;
		this.head = { verse: target.verse, word: target.word };
	}

	/** Extends by whichever end is nearer, so a tap adjusts a finished selection instead of
	 *  restarting it — the tap-to-adjust that replaces drag handles on a touch or e-ink screen. */
	adjustTo(target: WordTarget): void {
		if (!this.active) return;
		if (target.chapterKey !== this.chapterKey) return;
		if (this.kind === 'word' && target.resourceId !== this.resourceId) return;

		const point = { verse: target.verse, word: target.word };
		const { from, to } = this.span;
		const distanceToStart =
			Math.abs(point.verse - from.verse) * 1000 + Math.abs(point.word - from.word);
		const distanceToEnd = Math.abs(point.verse - to.verse) * 1000 + Math.abs(point.word - to.word);
		this.anchor = distanceToStart < distanceToEnd ? to : from;
		this.head = point;
	}

	beginVerse(chapterKey: string, verse: number): void {
		this.begin('verse', chapterKey, '', { verse, word: 0 });
	}

	clear(): void {
		this.kind = null;
		this.chapterKey = '';
		this.resourceId = '';
		this.dragging = false;
	}

	/**
	 * The range this verse contributes, for `VerseText` to paint. A verse selection paints in every
	 * column, covering each verse whole; a word selection paints only in the column it was made in.
	 */
	rangeFor(
		chapterKey: string,
		resourceId: string,
		verse: number,
		wordCount: number
	): SelectionRange | null {
		if (!this.active || chapterKey !== this.chapterKey) return null;
		if (this.kind === 'word') {
			if (resourceId !== this.resourceId) return null;
			return spanRangeForVerse(this.span, verse, wordCount);
		}

		const { from, to } = this.span;
		if (verse < from.verse || verse > to.verse || wordCount <= 0) return null;
		return { start: 0, end: wordCount - 1 };
	}
}
