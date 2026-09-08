import { describe, expect, it } from 'vitest';
import { contextReferenceFromHref, parseContextReference } from './reference-context';

describe('reference context destinations', () => {
	it('preserves ranges and chapter references and expands document shorthand', () => {
		expect(parseContextReference('Joh 3,16-18')?.reference).toEqual({
			book: 43,
			chapter: 3,
			verse: 16,
			verseEnd: 18
		});
		expect(parseContextReference('Joh 3')?.reference).toEqual({ book: 43, chapter: 3 });
		expect(parseContextReference('Joh 3,16ff')?.reference).toEqual({
			book: 43,
			chapter: 3,
			verse: 16,
			verseEnd: 18
		});
		expect(parseContextReference('Joh 3,16a')?.reference).toEqual({
			book: 43,
			chapter: 3,
			verse: 16
		});
	});
	it('accepts contextual reader links but ignores external and non-reader links', () => {
		const origin = 'https://example.test';
		expect(contextReferenceFromHref('/Joh3,16?layout=single#verse', origin)?.reference).toEqual({
			book: 43,
			chapter: 3,
			verse: 16
		});
		for (const href of [
			'https://other.test/Joh3,16',
			'/notes/Joh3,16',
			'/search?q=Joh3,16',
			'/G25',
			'javascript:alert(1)',
			'/%zz'
		])
			expect(contextReferenceFromHref(href, origin)).toBeNull();
	});
});
