import { describe, expect, it } from 'vitest';
import {
	findBibleReferences,
	linkBibleReferences,
	rewriteBibleReferenceLinks
} from './link-references';

describe('rewriteBibleReferenceLinks', () => {
	it('upgrades old formatted links using the entire label and is idempotent', () => {
		const html = '<p><a href="http://strongs.de/heb8,8"><strong>Hebräer</strong> 8,8-10</a></p>';
		const result = rewriteBibleReferenceLinks(html);
		expect(result).toContain('href="/Hebr8,8-10"');
		expect(result).toContain('data-verse-end="10"');
		expect(result).toContain('<strong>Hebräer</strong> 8,8-10</a>');
		expect(rewriteBibleReferenceLinks(result)).toBe(result);
	});
	it('preserves other links, prose labels and code', () => {
		const html =
			'<a href="https://example.com">Artikel zu Joh 3,16</a><code><a href="/old">Joh 3,16</a></code>';
		expect(rewriteBibleReferenceLinks(html)).toBe(html);
	});
});

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
		const linked = linkBibleReferences(`Siehe ${input}.`);
		expect(linked).toContain(`href="${href}"`);
		expect(linked).toContain(`data-reference="${href.slice(1)}"`);
		expect(linked).toContain(`>${input}</a>`);
	});

	it('links references inside formatting without changing the markup', () => {
		const linked = linkBibleReferences('<p><strong>Joh 3,16</strong> und Mt 5,3</p>');
		expect(linked).toMatch(
			/^<p><strong><a [^>]+>Joh 3,16<\/a><\/strong> und <a [^>]+>Mt 5,3<\/a><\/p>$/u
		);
		expect(linked.match(/class="bible-reference verse-ref"/gu)).toHaveLength(2);
	});

	it('does not create nested links and is idempotent', () => {
		const html = '<a href="/Joh3,16">Joh 3,16</a> und Mt 5,3';
		const linked = linkBibleReferences(html);
		expect(linked).toContain('<a href="/Joh3,16">Joh 3,16</a> und ');
		expect(linked).toContain('data-reference="Mt5,3"');
		expect(linkBibleReferences(linked)).toBe(linked);
	});

	it('leaves references in links, abbreviations and code examples untouched', () => {
		const html =
			'<a href="/Joh3,16">Joh 3,16</a><abbr>Mt 3,12</abbr><code>Röm 8,1</code><pre>1Mo 1,1</pre>';
		expect(linkBibleReferences(html)).toBe(html);
	});

	it('adds canonical hover data for a verse and keeps chapter-only links non-previewable', () => {
		expect(linkBibleReferences('Mt 3,12')).toBe(
			'<a class="bible-reference verse-ref" href="/Mt3,12" tabindex="0" data-sveltekit-preload-data="off" data-reference="Mt3,12" data-book="40" data-chapter="3" data-verse="12">Mt 3,12</a>'
		);
		expect(linkBibleReferences('Röm 8')).toBe(
			'<a class="bible-reference" href="/Röm8" tabindex="0" data-sveltekit-preload-data="off" data-reference="Röm8" data-book="45" data-chapter="8">Röm 8</a>'
		);
	});

	it('inherits the book for semicolon-separated continuation references only', () => {
		const linked = linkBibleReferences('Joh 3,16; 4,2 und 5,3');
		expect(linked).toContain('data-reference="Joh3,16"');
		expect(linked).toContain('data-reference="Joh4,2"');
		expect(linked).not.toContain('data-reference="Joh5,3"');
	});

	it('links a cross-chapter or cross-book range as one hover-previewable link', () => {
		const crossChapter = linkBibleReferences('Siehe 1Mo 1,31-2,3.');
		expect(crossChapter).toContain(
			'<a class="bible-reference verse-ref" href="/1Mo1,31" tabindex="0" data-sveltekit-preload-data="off" data-reference="1Mo1,31-2,3"'
		);
		expect(crossChapter).toContain('>1Mo 1,31-2,3</a>.');
		expect(crossChapter).toContain('data-end-chapter="2" data-end-verse="3"');

		const crossBook = linkBibleReferences('1Mo 50,26-2Mo 1,2');
		expect(crossBook).toContain('data-reference="1Mo50,26-2Mo 1,2"');
		expect(crossBook).toContain('>1Mo 50,26-2Mo 1,2</a>');
	});

	it('returns stable text-node offsets for editor decorations', () => {
		const text = 'Vor Mt 3,12 und Johannes3:16 danach';
		const matches = findBibleReferences(text);
		expect(
			matches.map(({ from, to, label, canonical }) => ({ from, to, label, canonical }))
		).toEqual([
			{ from: 4, to: 11, label: 'Mt 3,12', canonical: 'Mt3,12' },
			{ from: 16, to: 28, label: 'Johannes3:16', canonical: 'Joh3,16' }
		]);
	});

	it('can render a stable tooltip relationship without changing the canonical selector', () => {
		const linked = linkBibleReferences('Mt 3,12', { tooltipId: 'preview-1' });
		expect(linked).toContain('data-reference="Mt3,12"');
		expect(linked).toContain('aria-describedby="preview-1"');
	});

	it('does not link unknown books or chapters outside the canon', () => {
		expect(linkBibleReferences('Atlantis 3,16; Joh 99,1')).toBe('Atlantis 3,16; Joh 99,1');
	});

	it('does not mistake a dotted calendar date for Amos', () => {
		expect(linkBibleReferences('Ausarbeitung am 03.05.2026. Zu Am 3,5.')).toBe(
			'Ausarbeitung am 03.05.2026. Zu <a class="bible-reference verse-ref" href="/Am3,5" tabindex="0" data-sveltekit-preload-data="off" data-reference="Am3,5" data-book="30" data-chapter="3" data-verse="5">Am 3,5</a>.'
		);
	});
});
