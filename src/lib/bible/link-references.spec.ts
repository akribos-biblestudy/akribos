import { describe, expect, it } from 'vitest';
import { linkBibleReferences } from './link-references';

describe('linkBibleReferences', () => {
	it.each([
		['Joh 3,16', '/Joh3,16'],
		['Johannes3:16', '/Joh3,16'],
		['1. Mose 1,1-3', '/1Mo1,1-3'],
		['1Mo 1_1', '/1Mo1,1'],
		['Hohes Lied 2,1–3', '/Hld2,1-3'],
		['Matthew 5:3', '/Mt5,3'],
		['Röm 8', '/Röm8']
	])('links the accepted reference spelling %s', (input, href) => {
		expect(linkBibleReferences(`Siehe ${input}.`)).toBe(
			`Siehe <a class="bible-reference" href="${href}">${input}</a>.`
		);
	});

	it('links references inside formatting without changing the markup', () => {
		expect(linkBibleReferences('<p><strong>Joh 3,16</strong> und Mt 5,3</p>')).toBe(
			'<p><strong><a class="bible-reference" href="/Joh3,16">Joh 3,16</a></strong> und <a class="bible-reference" href="/Mt5,3">Mt 5,3</a></p>'
		);
	});

	it('does not create nested links', () => {
		const html = '<a href="/Joh3,16">Joh 3,16</a> und Mt 5,3';
		expect(linkBibleReferences(html)).toBe(
			'<a href="/Joh3,16">Joh 3,16</a> und <a class="bible-reference" href="/Mt5,3">Mt 5,3</a>'
		);
	});

	it('does not link unknown books or chapters outside the canon', () => {
		expect(linkBibleReferences('Atlantis 3,16; Joh 99,1')).toBe('Atlantis 3,16; Joh 99,1');
	});
});
