/**
 * Display names and lookup aliases per book.
 *
 * The German set is the runtime source of truth and is also what `pnpm db:seed` writes into the
 * `book_names` table for SQL-side joins. It merges every spelling the previous site accepted —
 * `data/bibleBooks_de.txt` (the Django seed) plus the `shortBooks` and `strBooks` arrays that lived
 * in the old autocomplete.js — so links people bookmarked years ago still resolve. English aliases are included as a convenience; the German name always wins on conflict.
 *
 * `name` is the full display name, `short` the abbreviation used when formatting references.
 */

import { BOOKS } from './books.ts';

export type BookNames = {
	readonly name: string;
	readonly short: string;
	/** Additional spellings accepted when parsing a reference. Never rendered. */
	readonly aliases: readonly string[];
};

export const GERMAN_BOOK_NAMES: Readonly<Record<number, BookNames>> = {
	1: { name: '1.Mose', short: '1Mo', aliases: ['1Mos', 'Genesis', 'Gen', 'Mo', 'Mos', 'Mose'] },
	2: { name: '2.Mose', short: '2Mo', aliases: ['2Mos', 'Exodus', 'Ex'] },
	3: { name: '3.Mose', short: '3Mo', aliases: ['3Mos', 'Levitikus', 'Leviticus', 'Lev'] },
	4: { name: '4.Mose', short: '4Mo', aliases: ['4Mos', 'Numeri', 'Numbers', 'Num'] },
	5: { name: '5.Mose', short: '5Mo', aliases: ['5Mos', 'Deuteronomium', 'Deuteronomy', 'Dtn'] },
	6: { name: 'Josua', short: 'Jos', aliases: ['Joshua'] },
	7: { name: 'Richter', short: 'Ri', aliases: ['Judges', 'Judg'] },
	8: { name: 'Rut', short: 'Ruth', aliases: [] },
	9: { name: '1.Samuel', short: '1Sam', aliases: ['Sam', 'Samuel'] },
	10: { name: '2.Samuel', short: '2Sam', aliases: [] },
	11: {
		name: '1.Könige',
		short: '1Kön',
		aliases: ['1Kö', 'Kö', 'Kön', 'Könige', '1Kings', '1Kgs']
	},
	12: { name: '2.Könige', short: '2Kön', aliases: ['2Kö', '2Kings', '2Kgs'] },
	13: {
		name: '1.Chronik',
		short: '1Chr',
		aliases: ['Chr', 'Chronik', '1Chronicles', 'Chronicles']
	},
	14: { name: '2.Chronik', short: '2Chr', aliases: ['2Chronicles'] },
	15: { name: 'Esra', short: 'Esra', aliases: ['Ezra'] },
	16: { name: 'Nehemia', short: 'Neh', aliases: ['Nehemiah'] },
	17: { name: 'Esther', short: 'Est', aliases: ['Ester', 'Esth'] },
	18: { name: 'Hiob', short: 'Hi', aliases: ['Ijob', 'Job'] },
	19: { name: 'Psalmen', short: 'Ps', aliases: ['Psalm', 'Psalms', 'Psalter'] },
	20: { name: 'Sprüche', short: 'Spr', aliases: ['Proverbs', 'Prov'] },
	21: { name: 'Prediger', short: 'Pred', aliases: ['Kohelet', 'Koh', 'Ecclesiastes', 'Eccl'] },
	22: {
		name: 'Hoheslied',
		short: 'Hld',
		aliases: ['Hohes Lied', 'Hohelied', 'Hoh', 'Song', 'Song of Solomon', 'Canticles']
	},
	23: { name: 'Jesaja', short: 'Jes', aliases: ['Isaiah', 'Isa'] },
	24: { name: 'Jeremia', short: 'Jer', aliases: ['Jeremiah'] },
	25: { name: 'Klagelieder', short: 'Klgl', aliases: ['Klag', 'Lamentations', 'Lam'] },
	26: { name: 'Hesekiel', short: 'Hes', aliases: ['Ezechiel', 'Ez', 'Ezekiel', 'Ezek'] },
	27: { name: 'Daniel', short: 'Dan', aliases: [] },
	28: { name: 'Hosea', short: 'Hos', aliases: [] },
	29: { name: 'Joel', short: 'Joel', aliases: [] },
	30: { name: 'Amos', short: 'Am', aliases: ['Amos'] },
	31: { name: 'Obadja', short: 'Obd', aliases: ['Obad', 'Obadiah'] },
	32: { name: 'Jona', short: 'Jona', aliases: ['Jonah'] },
	33: { name: 'Micha', short: 'Mi', aliases: ['Micah', 'Mic'] },
	34: { name: 'Nahum', short: 'Nah', aliases: [] },
	35: { name: 'Habakuk', short: 'Hab', aliases: ['Habakkuk'] },
	36: { name: 'Zefanja', short: 'Zef', aliases: ['Zephanja', 'Zephaniah', 'Zeph'] },
	37: { name: 'Haggai', short: 'Hag', aliases: [] },
	38: { name: 'Sacharja', short: 'Sach', aliases: ['Zechariah', 'Zech'] },
	39: { name: 'Maleachi', short: 'Mal', aliases: ['Malachi'] },
	40: { name: 'Matthäus', short: 'Mt', aliases: ['Matthaeus', 'Matthew', 'Matt'] },
	41: { name: 'Markus', short: 'Mk', aliases: ['Mark', 'Mr'] },
	42: { name: 'Lukas', short: 'Lk', aliases: ['Luke', 'Lu'] },
	43: { name: 'Johannes', short: 'Joh', aliases: ['John'] },
	44: { name: 'Apostelgeschichte', short: 'Apg', aliases: ['Acts', 'Ac'] },
	45: { name: 'Römer', short: 'Röm', aliases: ['Roemer', 'Romans', 'Rom', 'Ro'] },
	46: { name: '1.Korinther', short: '1Kor', aliases: ['Kor', 'Korinther', '1Corinthians', '1Cor'] },
	47: { name: '2.Korinther', short: '2Kor', aliases: ['2Corinthians', '2Cor'] },
	48: { name: 'Galater', short: 'Gal', aliases: ['Galatians'] },
	49: { name: 'Epheser', short: 'Eph', aliases: ['Ephesians'] },
	50: { name: 'Philipper', short: 'Phil', aliases: ['Philippians', 'Php'] },
	51: { name: 'Kolosser', short: 'Kol', aliases: ['Colossians', 'Col'] },
	52: {
		name: '1.Thessalonicher',
		short: '1Thess',
		aliases: ['Thess', 'Thessalonicher', '1Th', '1Thes', '1Thessalonians']
	},
	53: {
		name: '2.Thessalonicher',
		short: '2Thess',
		aliases: ['2Th', '2Thes', '2Thessalonians']
	},
	54: { name: '1.Timotheus', short: '1Tim', aliases: ['Timotheus', 'Tim', '1Timothy'] },
	55: { name: '2.Timotheus', short: '2Tim', aliases: ['2Timothy'] },
	56: { name: 'Titus', short: 'Tit', aliases: [] },
	57: { name: 'Philemon', short: 'Phlm', aliases: ['Phm'] },
	58: { name: 'Hebräer', short: 'Hebr', aliases: ['Hebraeer', 'Heb', 'Hebrews'] },
	59: { name: 'Jakobus', short: 'Jak', aliases: ['James', 'Jas'] },
	60: {
		name: '1.Petrus',
		short: '1Petr',
		aliases: ['1Pet', '1Pe', 'Pe', 'Pet', 'Petr', 'Petrus', '1Peter']
	},
	61: { name: '2.Petrus', short: '2Petr', aliases: ['2Pet', '2Pe', '2Peter'] },
	62: { name: '1.Johannes', short: '1Joh', aliases: ['1Jo', '1John'] },
	63: { name: '2.Johannes', short: '2Joh', aliases: ['2Jo', '2John'] },
	64: { name: '3.Johannes', short: '3Joh', aliases: ['3Jo', '3John'] },
	65: { name: 'Judas', short: 'Jud', aliases: ['Jude'] },
	66: {
		name: 'Offenbarung',
		short: 'Offb',
		aliases: ['Off', 'Apokalypse', 'Revelation', 'Revelation of John', 'Rev']
	}
};

/**
 * Folds a name into a lookup key: case, punctuation, whitespace and umlauts are all ignored, so
 * `1. Könige`, `1kon` and `1KÖNIGE` are the same key.
 *
 * A leading Roman numeral becomes its Arabic equivalent, because that is how CrossWire's SWORD
 * library names the numbered books — `II Thessalonians`, `III John` — and those keys have to meet
 * the German `2.Thessalonicher` and `3.Johannes` in the same index. The numeral only counts as one
 * when it is a separate word: `Ijob` starts with an `i` too and must stay Job.
 */
export function normalizeBookName(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replaceAll('ä', 'a')
		.replaceAll('ö', 'o')
		.replaceAll('ü', 'u')
		.replaceAll('ß', 'ss')
		.replace(/^(i{1,3})[\s.]+(?=\S)/, (_match, numeral: string) => String(numeral.length))
		.replace(/[^a-z0-9]/g, '');
}

/**
 * Alias index. Built once; earlier entries win, so a book's own name and short form take precedence
 * over another book's alias (relevant for bare forms like `Sam`, which historically meant 1.Samuel).
 */
const aliasIndex = new Map<string, number>();

for (const pass of ['name', 'short', 'aliases'] as const) {
	for (const book of BOOKS) {
		const names = GERMAN_BOOK_NAMES[book.id];
		if (!names) continue;
		const candidates =
			pass === 'aliases' ? names.aliases : pass === 'name' ? [names.name] : [names.short];
		for (const candidate of candidates) {
			const key = normalizeBookName(candidate);
			if (key && !aliasIndex.has(key)) aliasIndex.set(key, book.id);
		}
	}
}

/** Also accept the OSIS abbreviations, which is what OSIS/USFM sources use internally. */
for (const book of BOOKS) {
	const key = normalizeBookName(book.osisId);
	if (!aliasIndex.has(key)) aliasIndex.set(key, book.id);
}

/** Resolves any accepted spelling of a book name to its canonical book number. */
export function findBookId(input: string): number | undefined {
	return aliasIndex.get(normalizeBookName(input));
}

export function bookName(bookId: number): string {
	return GERMAN_BOOK_NAMES[bookId]?.name ?? `Buch ${bookId}`;
}

export function bookShortName(bookId: number): string {
	return GERMAN_BOOK_NAMES[bookId]?.short ?? `${bookId}`;
}

/** Every book with its display names, in canonical order. Used by pickers and the seed script. */
export function allBookNames(): { book: number; names: BookNames }[] {
	return BOOKS.flatMap((book) => {
		const names = GERMAN_BOOK_NAMES[book.id];
		return names ? [{ book: book.id, names }] : [];
	});
}
