import { describe, expect, it } from 'vitest';
import { BOOKS } from './books.ts';
import { bookTitle } from './book-titles.ts';

describe('resource-language book titles', () => {
	it('names every German and English book without changing reference aliases', () => {
		for (const book of BOOKS) {
			expect(bookTitle(book.id, 'de').language).toBe('de');
			expect(bookTitle(book.id, 'en').language).toBe('en');
		}
		expect(bookTitle(9, 'de-CH').text).toBe('1. Samuel');
		expect(bookTitle(10, 'ENG').text).toBe('2 Samuel');
		expect(bookTitle(66, 'en_US').text).toBe('Revelation');
	});

	it('uses Greek NT and Hebrew OT titles with the correct writing direction', () => {
		for (const book of BOOKS) {
			const language = book.testament === 'nt' ? 'grc' : 'hbo';
			expect(bookTitle(book.id, language).language).toBe(language === 'hbo' ? 'he' : 'grc');
		}
		expect(bookTitle(43, 'GRC')).toEqual({
			text: 'Κατὰ Ἰωάννην',
			language: 'grc',
			direction: 'ltr'
		});
		expect(bookTitle(9, 'heb')).toEqual({ text: 'שמואל א', language: 'he', direction: 'rtl' });
	});

	it('uses neutral canonical identifiers for languages or testaments without a title table', () => {
		expect(bookTitle(9, 'unknown')).toEqual({ text: '1Sam', language: 'und', direction: 'ltr' });
		expect(bookTitle(1, 'grc').text).toBe('Gen');
		expect(bookTitle(40, 'hbo').text).toBe('Matt');
	});
});
