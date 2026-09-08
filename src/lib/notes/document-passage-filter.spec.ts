import { describe, expect, it } from 'vitest';
import { passageToDbEndpoints, parsePassage } from '../bible/passage.ts';
import { documentBodyOverlapsPassage, documentMarkdownToHtml } from './document-markdown.ts';

function overlaps(html: string, reference: string): boolean {
	const query = passageToDbEndpoints(parsePassage(reference)!);
	return documentBodyOverlapsPassage(html, query!);
}

describe('document body passage filters', () => {
	it.each([
		'<p>2. Sam 9,2</p>',
		'<p>2. <strong>Sam</strong> 9,2</p>',
		'<p>2. <a href="/1Sam9,2">Sam 9,2</a></p>',
		'<p>2.&#160;Sam 9,2</p>'
	])('assigns numbered references to the right book in existing HTML: %s', (html) => {
		expect(overlaps(html, '2Sam 9,2')).toBe(true);
		expect(overlaps(html, '1Sam 9,2')).toBe(false);
	});

	it('matches old imported link labels and whole ranges independently of their URLs', () => {
		const html = '<p><a href="http://strongs.de/heb8,8">Hebräer <strong>8,8-10</strong></a></p>';
		expect(overlaps(html, 'Hebr 8,10')).toBe(true);
		expect(overlaps(html, 'Hebr 8,11')).toBe(false);
		expect(overlaps('<p><a href="/Joh3,16">Andere Seite</a></p>', 'Joh 3,16')).toBe(false);
	});
	it('matches text, formatted references, chapter references and cross-chapter ranges', () => {
		for (const markdown of ['Joh 3,16', '**Joh** 3,16', 'Joh 3', 'Joh 3,1-4,2']) {
			expect(overlaps(documentMarkdownToHtml(markdown).html, 'Joh 3,16')).toBe(true);
		}
		expect(overlaps('<p>1Mo 50,26-2Mo 1,2</p>', '2Mo 1,1')).toBe(true);
		expect(overlaps('<p>Joh 3,16; 4,2</p>', 'Joh 4,2')).toBe(true);
		expect(overlaps('<p>Joh&#32;3,16</p>', 'Joh 3,16')).toBe(true);
	});
	it('does not treat code or separate blocks as prose references', () => {
		for (const html of [
			'<pre><code>Joh 3,16</code></pre>',
			'<p><code>Joh 3,16</code></p>',
			'<p>Joh</p><p>3,16</p>',
			'<p>Joh<code>Beispiel</code> 3,16</p>'
		]) {
			expect(overlaps(html, 'Joh 3,16')).toBe(false);
		}
		expect(overlaps('<pre><code>Code</code></pre><p>Joh 3,16</p>', 'Joh 3,16')).toBe(true);
	});
});
