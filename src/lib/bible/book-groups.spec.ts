import { describe, expect, it } from 'vitest';
import { BOOKS } from './books.ts';
import { bookGroup, BOOK_GROUPS } from './book-groups.ts';

describe('book families requested in issue 323', () => {
	it('preserves the CSV exceptions and separates the NT narrative and prophetic books', () => {
		expect(bookGroup(25)).toBe('poetry');
		expect(bookGroup(24)).toBe('major');
		expect(bookGroup(26)).toBe('major');
		expect(bookGroup(57)).toBe('pauline');
		expect(bookGroup(58)).toBe('general');
		expect(bookGroup(43)).toBe('gospels');
		expect(bookGroup(44)).toBe('acts');
		expect(bookGroup(65)).toBe('general');
		expect(bookGroup(66)).toBe('revelation');
	});
	it('categorizes the complete canon without changing its order', () => {
		const groups = BOOKS.map((book) => bookGroup(book.id));
		expect(groups.every((group) => group && BOOK_GROUPS[group])).toBe(true);
		expect(new Set(groups).size).toBe(10);
		expect([0, 67, 1.5, NaN].map(bookGroup)).toEqual([undefined, undefined, undefined, undefined]);
	});
});
