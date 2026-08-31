import { describe, expect, it } from 'vitest';
import {
	comparePoints,
	normalizeSpan,
	spanRangeForVerse,
	spansMultipleWords
} from './selection.ts';

describe('normalizeSpan', () => {
	it('keeps a forward drag as it is', () => {
		expect(normalizeSpan({ verse: 29, word: 2 }, { verse: 31, word: 4 })).toEqual({
			from: { verse: 29, word: 2 },
			to: { verse: 31, word: 4 }
		});
	});

	it('turns a backward drag around, so dragging upwards is not a special case', () => {
		expect(normalizeSpan({ verse: 31, word: 4 }, { verse: 29, word: 2 })).toEqual({
			from: { verse: 29, word: 2 },
			to: { verse: 31, word: 4 }
		});
	});

	it('orders by word within one verse', () => {
		expect(normalizeSpan({ verse: 3, word: 7 }, { verse: 3, word: 1 })).toEqual({
			from: { verse: 3, word: 1 },
			to: { verse: 3, word: 7 }
		});
	});
});

describe('comparePoints', () => {
	it('sorts by verse first and word second', () => {
		expect(comparePoints({ verse: 1, word: 9 }, { verse: 2, word: 0 })).toBeLessThan(0);
		expect(comparePoints({ verse: 2, word: 3 }, { verse: 2, word: 1 })).toBeGreaterThan(0);
		expect(comparePoints({ verse: 2, word: 3 }, { verse: 2, word: 3 })).toBe(0);
	});
});

describe('spanRangeForVerse', () => {
	const span = { from: { verse: 29, word: 4 }, to: { verse: 31, word: 2 } };

	it('runs from the selected word to the end of the first verse', () => {
		expect(spanRangeForVerse(span, 29, 10)).toEqual({ start: 4, end: 9 });
	});

	it('covers a verse in the middle whole', () => {
		expect(spanRangeForVerse(span, 30, 6)).toEqual({ start: 0, end: 5 });
	});

	it('stops at the selected word of the last verse', () => {
		expect(spanRangeForVerse(span, 31, 8)).toEqual({ start: 0, end: 2 });
	});

	it('leaves verses outside the span alone', () => {
		expect(spanRangeForVerse(span, 28, 10)).toBeNull();
		expect(spanRangeForVerse(span, 32, 10)).toBeNull();
	});

	it('clamps to the verse the reader actually has, not the one the span was built against', () => {
		expect(spanRangeForVerse(span, 31, 2)).toEqual({ start: 0, end: 1 });
		expect(spanRangeForVerse({ from: { verse: 5, word: 40 }, to: { verse: 5, word: 41 } }, 5, 3)) //
			.toEqual({ start: 2, end: 2 });
	});

	it('has nothing to paint in a verse with no words', () => {
		expect(spanRangeForVerse(span, 30, 0)).toBeNull();
	});

	it('covers a single verse from word to word', () => {
		const single = { from: { verse: 7, word: 1 }, to: { verse: 7, word: 3 } };
		expect(spanRangeForVerse(single, 7, 9)).toEqual({ start: 1, end: 3 });
	});
});

describe('spansMultipleWords', () => {
	it('is false for a single tapped word, which is not yet worth storing', () => {
		expect(spansMultipleWords({ from: { verse: 3, word: 2 }, to: { verse: 3, word: 2 } })).toBe(
			false
		);
	});

	it('is true as soon as a second word or a second verse is involved', () => {
		expect(spansMultipleWords({ from: { verse: 3, word: 2 }, to: { verse: 3, word: 3 } })).toBe(
			true
		);
		expect(spansMultipleWords({ from: { verse: 3, word: 2 }, to: { verse: 4, word: 2 } })).toBe(
			true
		);
	});
});
