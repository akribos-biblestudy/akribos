import { describe, expect, it } from 'vitest';
import { allBookNames } from './book-names';
import {
	findBibleReferences,
	linkBibleReferences,
	rewriteBibleReferenceLinks
} from './link-references';

describe('rewriteBibleReferenceLinks', () => {
	it.each([
		['Joh 7,12f', '/Joh7,12-13'],
		['Joh 7,12ff', '/Joh7,12-14'],
		['Joh 7,12a', '/Joh7,12'],
		['Joh 7,12b', '/Joh7,12'],
		['Joh 7,12c', '/Joh7,12']
	])('normalizes an authored link labelled %s', (label, href) => {
		const result = rewriteBibleReferenceLinks(`<a href="/old">${label}</a>`);
		expect(result).toContain(`href="${href}"`);
		expect(result).toContain(`>${label}</a>`);
	});

	it('corrects an existing numbered reference link from its full visible label', () => {
		const html = '<p><a href="/1Sam9,2">2. Sam 9,2</a></p>';
		const result = rewriteBibleReferenceLinks(html);
		expect(result).toContain('href="/2Sam9,2"');
		expect(result).toContain('>2. Sam 9,2</a>');
		expect(rewriteBibleReferenceLinks(result)).toBe(result);
	});

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
	it.each(
		allBookNames().flatMap(({ book, names }) =>
			/^\d/.test(names.short)
				? ['', ' ', '.', '. ', '\u00a0', '.\u202f'].map((separator) => ({
						book,
						label: `${names.short[0]}${separator}${names.short.slice(1)} 1,2`,
						href: `/${names.short}1,2`
					}))
				: []
		)
	)('keeps the complete numbered abbreviation in $label', ({ book, label, href }) => {
		expect(findBibleReferences(`Siehe ${label}.`)).toEqual([
			expect.objectContaining({
				from: 6,
				to: 6 + label.length,
				label,
				href,
				reference: { book, chapter: 1, verse: 2 }
			})
		]);
		expect(linkBibleReferences(label)).toContain(`>${label}</a>`);
	});

	it('uses the second Samuel book for ranges and inherited references', () => {
		expect(findBibleReferences('2. Sam 9,2-4; 10,1').map(({ canonical }) => canonical)).toEqual([
			'2Sam9,2-4',
			'2Sam10,1'
		]);
		expect(findBibleReferences('1. Sam 31,13-2. Sam 1,2')).toEqual([
			expect.objectContaining({
				label: '1. Sam 31,13-2. Sam 1,2',
				passage: {
					start: { book: 9, chapter: 31, verse: 13 },
					end: { book: 10, chapter: 1, verse: 2 }
				}
			})
		]);
	});

	it.each([
		['II. Sam 9,2', '/2Sam9,2'],
		['III Joh 1,2', '/3Joh1,2']
	])('keeps Roman book numbers in %s', (label, href) => {
		expect(findBibleReferences(label)).toEqual([expect.objectContaining({ label, href })]);
	});

	it.each([
		['Joh 3,16', '/Joh3,16'],
		['Johannes3:16', '/Joh3,16'],
		['1. Mose 1,1-3', '/1Mo1,1-3'],
		['1Mo 1_1', '/1Mo1,1'],
		['Hohes Lied 2,1–3', '/Hld2,1-3'],
		['Matthew 5:3', '/Mt5,3'],
		['Joh 7,12f', '/Joh7,12-13'],
		['Joh 7,12ff', '/Joh7,12-14'],
		['Joh 7,12a', '/Joh7,12'],
		['Joh 7,12b', '/Joh7,12'],
		['Joh 7,12c', '/Joh7,12'],
		['Joh 7,12a-14b', '/Joh7,12-14'],
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

	it.each(['+', '.', ' + ', ' . '])(
		'links disjoint verses separated by %j individually',
		(separator) => {
			const text = `Siehe Joh 7,12${separator}47.`;
			const matches = findBibleReferences(text);
			expect(matches.map(({ label, canonical }) => ({ label, canonical }))).toEqual([
				{ label: 'Joh 7,12', canonical: 'Joh7,12' },
				{ label: '47', canonical: 'Joh7,47' }
			]);
			for (const match of matches) {
				expect(text.slice(match.from, match.to)).toBe(match.label);
			}
			const linked = linkBibleReferences(text);
			expect(linked).toContain(`>Joh 7,12</a>${separator}<a `);
			expect(linked).toContain('data-reference="Joh7,47"');
			expect(linked).toContain('>47</a>.');
			expect(linkBibleReferences(linked)).toBe(linked);
		}
	);

	it('combines verse lists, ranges, suffixes and subsequent chapters without overlapping matches', () => {
		const text = 'Joh 7,12a+14f.47ff; 8,2b+4-6; 9,1 und 10,2';
		expect(findBibleReferences(text).map(({ label, canonical }) => ({ label, canonical }))).toEqual(
			[
				{ label: 'Joh 7,12a', canonical: 'Joh7,12' },
				{ label: '14f', canonical: 'Joh7,14-15' },
				{ label: '47ff', canonical: 'Joh7,47-49' },
				{ label: '8,2b', canonical: 'Joh8,2' },
				{ label: '4-6', canonical: 'Joh8,4-6' },
				{ label: '9,1', canonical: 'Joh9,1' }
			]
		);
		expect(findBibleReferences('1Mo 50,26+27-2Mo 1,2+4').map(({ canonical }) => canonical)).toEqual(
			['1Mo50,26', '1Mo50,27-2Mo 1,2', '2Mo1,4']
		);
	});

	it.each(['Joh 7,12d', 'Joh 7,12fff', 'Joh 7,12abc', 'Joh 7,12foo', 'Joh 7,12f2'])(
		'does not turn an invalid verse suffix into a whole-chapter reference: %s',
		(text) => expect(findBibleReferences(text)).toEqual([])
	);

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
