import { describe, expect, it } from 'vitest';
import { spanRangeForVerse } from './highlight-span.ts';

describe('spanRangeForVerse', () => {
	const span = { from: { verse: 29, word: 4 }, to: { verse: 31, word: 2 } };

	it('runs from the stored word to the end of the first verse', () => {
		expect(spanRangeForVerse(span, 29, 10)).toEqual({ start: 4, end: 9 });
	});

	it('covers a verse in the middle whole', () => {
		expect(spanRangeForVerse(span, 30, 6)).toEqual({ start: 0, end: 5 });
	});

	it('stops at the stored word of the last verse', () => {
		expect(spanRangeForVerse(span, 31, 8)).toEqual({ start: 0, end: 2 });
	});

	it('leaves verses outside the span alone', () => {
		expect(spanRangeForVerse(span, 28, 10)).toBeNull();
		expect(spanRangeForVerse(span, 32, 10)).toBeNull();
	});

	it('clamps to the verse the reader actually has, not the one the span was stored against', () => {
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
