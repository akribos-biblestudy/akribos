import { describe, expect, it } from 'vitest';
import {
	formatPassage,
	isValidPassagePoint,
	normalizePassage,
	parsePassage,
	passageContainsPoint,
	passageFromDbEndpoints,
	passagesOverlap,
	passageToDbEndpoints
} from './passage.ts';

describe('parsePassage', () => {
	it.each([
		[
			'Joh 3,16',
			{ start: { book: 43, chapter: 3, verse: 16 }, end: { book: 43, chapter: 3, verse: 16 } }
		],
		[
			'Joh 3,16-18',
			{ start: { book: 43, chapter: 3, verse: 16 }, end: { book: 43, chapter: 3, verse: 18 } }
		],
		[
			'1Mo 1,31-2,3',
			{ start: { book: 1, chapter: 1, verse: 31 }, end: { book: 1, chapter: 2, verse: 3 } }
		],
		[
			'1. Mose 1,31–1Mo 2,3',
			{ start: { book: 1, chapter: 1, verse: 31 }, end: { book: 1, chapter: 2, verse: 3 } }
		],
		[
			'1Mo 50,26-2Mo 1,2',
			{ start: { book: 1, chapter: 50, verse: 26 }, end: { book: 2, chapter: 1, verse: 2 } }
		]
	] as const)('parses %s', (input, expected) => {
		expect(parsePassage(input)).toEqual(expected);
	});

	it.each([
		['Joh 7,12a', 12, 12],
		['Joh 7,12b', 12, 12],
		['Joh 7,12c', 12, 12],
		['Joh 7,12f', 12, 13],
		['Joh 7,12ff', 12, 14],
		['Joh 7,12FF', 12, 14],
		['Joh 7,12a-14c', 12, 14],
		['Joh 7,12-14f', 12, 15]
	] as const)('normalizes verse suffixes in %s', (input, startVerse, endVerse) => {
		expect(parsePassage(input)).toEqual({
			start: { book: 43, chapter: 7, verse: startVerse },
			end: { book: 43, chapter: 7, verse: endVerse }
		});
	});

	it('accepts verse parts at cross-chapter and cross-book range endpoints', () => {
		expect(parsePassage('Joh 7,12a-8,2b')).toEqual(parsePassage('Joh 7,12-8,2'));
		expect(parsePassage('1Mo 50,26c-2Mo 1,2b')).toEqual(parsePassage('1Mo 50,26-2Mo 1,2'));
	});

	it('normalizes a range entered backwards', () => {
		expect(parsePassage('Joh 4,2-Joh 3,16')).toEqual({
			start: { book: 43, chapter: 3, verse: 16 },
			end: { book: 43, chapter: 4, verse: 2 }
		});
	});

	it.each([
		'',
		'Joh 3',
		'Joh 0,1',
		'Joh 22,1',
		'Joh 3,0',
		'Joh 3,1000',
		'Unbekannt 1,1',
		'Joh 3,16-',
		'Joh 3,16-18-20',
		'Joh 7,12+47',
		'Joh 7,12.47',
		'Joh 7,12d',
		'Joh 7,12fff',
		'Joh 7,12abc',
		'Joh 7,999f',
		'Joh 7,998ff'
	])('rejects invalid input %j', (input) => {
		expect(parsePassage(input)).toBeNull();
	});
});

describe('passage validation and normalization', () => {
	it('validates the code canon without requiring a translation', () => {
		expect(isValidPassagePoint({ book: 1, chapter: 50, verse: 26 })).toBe(true);
		expect(isValidPassagePoint({ book: 66, chapter: 22, verse: 21 })).toBe(true);
		expect(isValidPassagePoint({ book: 0, chapter: 1, verse: 1 })).toBe(false);
		expect(isValidPassagePoint({ book: 67, chapter: 1, verse: 1 })).toBe(false);
		expect(isValidPassagePoint({ book: 65, chapter: 2, verse: 1 })).toBe(false);
		expect(isValidPassagePoint({ book: 43, chapter: 3, verse: -1 })).toBe(false);
		expect(isValidPassagePoint({ book: 43, chapter: 3.5, verse: 16 })).toBe(false);
	});

	it('orders endpoints by their canonical verse keys', () => {
		expect(
			normalizePassage({ book: 44, chapter: 1, verse: 1 }, { book: 43, chapter: 21, verse: 25 })
		).toEqual({
			start: { book: 43, chapter: 21, verse: 25 },
			end: { book: 44, chapter: 1, verse: 1 }
		});
	});
});

describe('formatPassage', () => {
	it('uses the shortest unambiguous form for each range shape', () => {
		expect(formatPassage(parsePassage('Joh 3,16')!)).toBe('Joh 3,16');
		expect(formatPassage(parsePassage('Joh 3,16-18')!)).toBe('Joh 3,16-18');
		expect(formatPassage(parsePassage('1Mo 1,31-2,3')!)).toBe('1Mo 1,31-2,3');
		expect(formatPassage(parsePassage('1Mo 50,26-2Mo 1,2')!)).toBe('1Mo 50,26-2Mo 1,2');
	});

	it('can render full German book names', () => {
		expect(formatPassage(parsePassage('Joh 3,16-18')!, { style: 'full' })).toBe('Johannes 3,16-18');
		expect(formatPassage(parsePassage('1Mo 50,26-2Mo 1,2')!, { style: 'full' })).toBe(
			'1.Mose 50,26-2.Mose 1,2'
		);
	});
});

describe('database endpoints', () => {
	it('round-trips flattened endpoints with matching canonical keys', () => {
		const passage = parsePassage('1Mo 1,31-2,3')!;
		const endpoints = passageToDbEndpoints(passage);
		expect(endpoints).toEqual({
			startBookId: 1,
			startChapter: 1,
			startVerse: 31,
			endBookId: 1,
			endChapter: 2,
			endVerse: 3,
			startKey: 1_001_031,
			endKey: 1_002_003
		});
		expect(passageFromDbEndpoints(endpoints!)).toEqual(passage);
	});

	it('rejects stale or corrupted redundant keys', () => {
		const endpoints = passageToDbEndpoints(parsePassage('Joh 3,16')!)!;
		expect(passageFromDbEndpoints({ ...endpoints, endKey: endpoints.endKey + 1 })).toBeNull();
	});
});

describe('passage overlap', () => {
	const crossChapter = parsePassage('1Mo 1,31-2,3')!;

	it('is inclusive at both boundaries', () => {
		expect(passagesOverlap(crossChapter, parsePassage('1Mo 1,31')!)).toBe(true);
		expect(passagesOverlap(crossChapter, parsePassage('1Mo 2,3-5')!)).toBe(true);
	});

	it('works in both directions across chapters and books', () => {
		expect(passagesOverlap(crossChapter, parsePassage('1Mo 2,1')!)).toBe(true);
		expect(passagesOverlap(parsePassage('1Mo 2,1')!, crossChapter)).toBe(true);
		expect(passagesOverlap(parsePassage('1Mo 50,26-2Mo 1,2')!, parsePassage('2Mo 1,1')!)).toBe(
			true
		);
	});

	it('rejects adjacent but non-overlapping ranges', () => {
		expect(passagesOverlap(crossChapter, parsePassage('1Mo 1,30')!)).toBe(false);
		expect(passagesOverlap(crossChapter, parsePassage('1Mo 2,4')!)).toBe(false);
	});

	it('can test one point for containment', () => {
		expect(passageContainsPoint(crossChapter, { book: 1, chapter: 2, verse: 1 })).toBe(true);
		expect(passageContainsPoint(crossChapter, { book: 1, chapter: 2, verse: 4 })).toBe(false);
	});
});
