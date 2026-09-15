import { describe, expect, it } from 'vitest';
import { chapterWindow } from './chapter-window';

describe('chapter window', () => {
	it('keeps the visible chapter and neighbours while bounding long reading sessions', () => {
		expect(chapterWindow(30, 0, 0)).toEqual({ start: 0, end: 5 });
		expect(chapterWindow(30, 15, 15)).toEqual({ start: 13, end: 18 });
		expect(chapterWindow(30, 29, 29)).toEqual({ start: 25, end: 30 });
	});
	it('keeps every visible short chapter plus overscan even when the viewport needs more than five', () => {
		expect(chapterWindow(30, 10, 17)).toEqual({ start: 9, end: 19 });
		expect(chapterWindow(2, 0, 1)).toEqual({ start: 0, end: 2 });
	});
});
