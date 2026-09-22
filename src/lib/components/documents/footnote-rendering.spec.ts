import { describe, expect, it } from 'vitest';
import { linkDocumentFootnotes } from './footnote-rendering';

const html =
	'<p>Erster<sup data-footnote-ref="a">9</sup>, wieder<sup data-footnote-ref="a">9</sup> und zweiter<sup data-footnote-ref="b">8</sup>.</p><ol data-footnotes="true"><li data-footnote-id="b"><p>Zweite Fußnote</p></li><li data-footnote-id="a"><p>Erste Fußnote</p><ul><li><p>Unterpunkt</p></li></ul></li></ol>';

describe('render-only document footnote links', () => {
	it('numbers repeated references by first use and adds one return link per occurrence', () => {
		const result = linkDocumentFootnotes(html, 'instance-1');
		expect(result.match(/role="doc-noteref"/g)).toHaveLength(3);
		expect(result.match(/role="doc-backlink"/g)).toHaveLength(3);
		expect(result.match(/aria-label="Fußnote 1"/g)).toHaveLength(2);
		expect(result).toContain('data-footnote-id="b" id="footnote-instance-1-b" value="2"');
		expect(result).toContain('aria-label="Zurück zu Fußnote 1, Verweis 2"');
		expect(result).toContain('<li><p>Unterpunkt</p></li></ul><a class="footnote-backlink"');
	});

	it('creates disjoint destinations for the same document in different rendered instances', () => {
		const first = linkDocumentFootnotes(html, 'first');
		const second = linkDocumentFootnotes(html, 'second');
		const firstIds = new Set([...first.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
		const secondIds = [...second.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
		expect(secondIds.every((id) => !firstIds.has(id))).toBe(true);
		expect(html).not.toContain('href=');
		expect(linkDocumentFootnotes('<p>Normale Notiz</p>', 'first')).toBe('<p>Normale Notiz</p>');
	});

	it('escapes an instance name and never creates a link to a missing definition', () => {
		const result = linkDocumentFootnotes(
			html + '<sup data-footnote-ref="missing">3</sup>',
			'"<bad>'
		);
		expect(result).toContain('footnote-&quot;&lt;bad&gt;-a');
		expect(result).toContain('href="#footnote-%22%3Cbad%3E-a"');
		expect(result).toContain('<sup data-footnote-ref="missing">3</sup>');
		expect(result).not.toContain('<bad>');
	});
});
