import { describe, expect, it } from 'vitest';
import { BOOKS, bookById, bookByOsisId, FIRST_NT_BOOK, strongLanguageForBook } from './books.ts';
import { allBookNames, findBookId, GERMAN_BOOK_NAMES, normalizeBookName } from './book-names.ts';

describe('canonical books', () => {
	it('covers the 66-book canon in order', () => {
		expect(BOOKS).toHaveLength(66);
		expect(BOOKS.map((book) => book.id)).toEqual(
			Array.from({ length: 66 }, (_unused, index) => index + 1)
		);
	});

	it('adds up to 1189 chapters, as the bundled German translations do', () => {
		expect(BOOKS.reduce((sum, book) => sum + book.chapters, 0)).toBe(1189);
	});

	it('uses the German chapter division for Joel and Malachi', () => {
		// Elberfelder 1905, Schlachter 1951 and Luther 1912 all divide these the Hebrew way; English
		// bibles have Joel 3 and Malachi 4. Getting this wrong would make Joel 4 unreachable.
		expect(bookById(29)?.chapters).toBe(4);
		expect(bookById(39)?.chapters).toBe(3);
	});

	it('splits the testaments at Matthew', () => {
		expect(BOOKS.filter((book) => book.testament === 'ot')).toHaveLength(39);
		expect(BOOKS.filter((book) => book.testament === 'nt')).toHaveLength(27);
		expect(BOOKS[FIRST_NT_BOOK - 1]?.osisId).toBe('Matt');
	});

	it('uses unique OSIS identifiers', () => {
		expect(new Set(BOOKS.map((book) => book.osisId)).size).toBe(66);
	});

	it('resolves OSIS identifiers case-insensitively', () => {
		expect(bookByOsisId('1Cor')?.id).toBe(46);
		expect(bookByOsisId('1cor')?.id).toBe(46);
	});

	it('picks the Strong dictionary from the testament', () => {
		expect(strongLanguageForBook(1)).toBe('hebrew');
		expect(strongLanguageForBook(39)).toBe('hebrew');
		expect(strongLanguageForBook(40)).toBe('greek');
		expect(strongLanguageForBook(66)).toBe('greek');
	});
});

describe('book names', () => {
	it('names every book', () => {
		expect(allBookNames()).toHaveLength(66);
	});

	it('never maps one spelling to two different books', () => {
		const seen = new Map<string, number>();
		const conflicts: string[] = [];

		for (const { book, names } of allBookNames()) {
			for (const spelling of [names.name, names.short, ...names.aliases]) {
				const key = normalizeBookName(spelling);
				const existing = seen.get(key);
				if (existing !== undefined && existing !== book) {
					conflicts.push(`"${spelling}" → ${existing} and ${book}`);
				}
				seen.set(key, book);
			}
		}

		expect(conflicts).toEqual([]);
	});

	it('resolves every declared spelling back to its own book', () => {
		for (const { book, names } of allBookNames()) {
			for (const spelling of [names.name, names.short, ...names.aliases]) {
				expect(findBookId(spelling), spelling).toBe(book);
			}
		}
	});

	it('ignores case, punctuation, spacing and umlauts', () => {
		expect(findBookId('1. Könige')).toBe(11);
		expect(findBookId('1koenige')).toBeUndefined(); // "oe" transliteration is not an alias
		expect(findBookId('1KÖNIGE')).toBe(11);
		expect(findBookId('  Hohes   Lied ')).toBe(22);
		expect(findBookId('roemer')).toBe(45);
	});

	it('keeps the historical bare forms that defaulted to the first book of a pair', () => {
		// The Django seed data mapped these to 1.Samuel, 1.Könige and so on; links relied on it.
		expect(findBookId('Sam')).toBe(9);
		expect(findBookId('Kön')).toBe(11);
		expect(findBookId('Chr')).toBe(13);
		expect(findBookId('Kor')).toBe(46);
		expect(findBookId('Petrus')).toBe(60);
	});

	it("reads SWORD's Roman numerals as the book number", () => {
		expect(findBookId('I Samuel')).toBe(9);
		expect(findBookId('II Samuel')).toBe(10);
		expect(findBookId('II Thessalonians')).toBe(53);
		expect(findBookId('III John')).toBe(64);
		expect(findBookId('I. Timothy')).toBe(54);
	});

	it('leaves a leading i that is part of the name alone', () => {
		expect(findBookId('Ijob')).toBe(18);
		expect(findBookId('Isaiah')).toBe(23);
	});

	it('rejects unknown names', () => {
		expect(findBookId('Henoch')).toBeUndefined();
		expect(findBookId('')).toBeUndefined();
	});

	it('uses the short name for the article-free reference format', () => {
		expect(GERMAN_BOOK_NAMES[43]?.short).toBe('Joh');
		expect(GERMAN_BOOK_NAMES[1]?.short).toBe('1Mo');
	});
});
