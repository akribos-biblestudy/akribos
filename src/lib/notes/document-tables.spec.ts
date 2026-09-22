import { describe, expect, it } from 'vitest';
import {
	documentHtmlToMarkdown,
	documentMarkdownToHtml,
	hasDocumentMarkdownTables,
	previewObsidianMarkdown,
	documentBodyBibleReferenceIndex
} from './document-markdown';
import { parseDocumentFootnotes } from './document-footnotes';

const source =
	'| Älteste | Männer | Frauen |\n| :--- | :---: | ---: |\n| **Untadelig**[^a] | [1Tim 3,10](https://example.test) | |\n| A \\| B | `x\\|y` | Nüchtern[^b] |\n| | | Treu[^a] |\n\n[^a]: Erste **Quelle**.\n\n[^b]: Zweite Quelle.\n';

describe('portable document tables', () => {
	it('preserves cells, alignment, rich inline content, pipes and two footnotes across repeated round trips', () => {
		let markdown = source;
		for (let pass = 0; pass < 3; pass++) {
			const { html, plainText } = documentMarkdownToHtml(markdown);
			expect(html).toContain('<th align="center">Männer</th>');
			expect(html).toContain('<td align="right"></td>');
			expect(html).toContain('<code>x|y</code>');
			expect(html).toContain('<strong>Untadelig</strong>');
			expect(plainText).toContain('Älteste Männer Frauen Untadelig');
			markdown = documentHtmlToMarkdown(html);
			expect(markdown).toContain('| :--- | :---: | ---: |');
			expect(markdown).toContain('A \\| B');
			expect(markdown.match(/\[\^a\]/g)).toHaveLength(3);
			expect(parseDocumentFootnotes(markdown).footnotes).toHaveLength(2);
		}
	});

	it('retains imported tables when Bible-link canonicalisation reserialises their block', () => {
		const preview = previewObsidianMarkdown('Gemeinde.md', source);
		expect(preview.markdown).toContain('[1Tim 3,10](/1Tim3,10)');
		expect(preview.markdown).toContain('| Älteste | Männer | Frauen |');
		expect(preview.html).toContain('<table>');
		expect(documentMarkdownToHtml(preview.markdown).html).toBe(preview.html);
	});

	it('keeps an entirely empty new table and hard breaks without inventing a text separator', () => {
		const html =
			'<table><tbody><tr><th><p></p></th><th><p></p></th></tr><tr><td><p></p></td><td><p></p></td></tr></tbody></table>';
		const markdown = documentHtmlToMarkdown(html);
		expect(markdown).toBe('|  |  |\n| --- | --- |\n|  |  |\n');
		expect(documentMarkdownToHtml(markdown).html).toContain('<td></td><td></td>');
		const breaks = documentHtmlToMarkdown(
			'<table><tr><th>A</th></tr><tr><td>Zeile 1<br>Zeile 2</td></tr></table>'
		);
		expect(breaks).toContain('Zeile 1<br>Zeile 2');
		expect(documentMarkdownToHtml(breaks).html).toContain('Zeile 1<br>Zeile 2');
	});

	it('accepts only safe structure/alignment while removing scripts, arbitrary attributes and unsafe links', () => {
		const markdown = documentHtmlToMarkdown(
			'<table onclick="evil()"><tr><th align="center" style="color:red">Kopf</th></tr><tr><td align="javascript:evil" data-secret="x"><a href="javascript:evil()">Text</a><script>PRIVATE_JS</script></td></tr></table>'
		);
		const { html } = documentMarkdownToHtml(markdown);
		expect(html).toContain('<th align="center">Kopf</th>');
		expect(html).not.toMatch(/onclick|style=|data-secret|javascript:|PRIVATE_JS/);
		expect(html).toContain('Text');
	});

	it('finds only source tables, including footnote/quote tables, without guessing from old flat prose', () => {
		expect(hasDocumentMarkdownTables(source)).toBe(true);
		expect(
			hasDocumentMarkdownTables('Text[^a]\n\n[^a]: | A | B |\n    | --- | --- |\n    | C | D |')
		).toBe(true);
		expect(hasDocumentMarkdownTables('> | A | B |\n> | --- | --- |\n> | C | D |')).toBe(true);
		expect(hasDocumentMarkdownTables('Älteste · Männer · Frauen\nUntadelig · · Treu')).toBe(false);
		expect(hasDocumentMarkdownTables('```\n| A | B |\n| --- | --- |\n| C | D |\n```')).toBe(false);
	});

	it('never assembles a Bible reference across neighboring cells', () => {
		const { html } = documentMarkdownToHtml('| A | B |\n| --- | --- |\n| Joh | 3,16 |');
		expect(documentBodyBibleReferenceIndex(html).ranges).toHaveLength(0);
	});

	it('retains real backslashes before pipes, backticks and Markdown punctuation in code cells', () => {
		for (const text of ['x\\|y', 'x\\\\|y', 'x\\\\\\|y', '`x\\|y`', '**x\\|y**[^fake]']) {
			let html = `<table><tr><th>H</th></tr><tr><td><code>${text}</code></td></tr></table>`;
			for (let round = 0; round < 3; round++) {
				const markdown = documentHtmlToMarkdown(html);
				html = documentMarkdownToHtml(markdown).html;
				expect(html).toContain(`<code>${text}</code>`);
				expect(parseDocumentFootnotes(markdown).footnotes).toHaveLength(0);
			}
		}
		for (const text of ['x\\|y', 'x\\\\|y', 'x|y']) {
			const markdown = documentHtmlToMarkdown(
				`<table><tr><th>H</th></tr><tr><td>${text}</td></tr></table>`
			);
			expect(documentMarkdownToHtml(markdown).html).toContain(`<td>${text}</td>`);
		}
	});

	it('preserves leading, trailing, repeated and otherwise empty cell hard breaks', () => {
		for (const content of ['A<br>', '<br>A', '<br>', '<br><br>', '<br>A<br><br>']) {
			let html = `<table><tr><th>H</th></tr><tr><td><p>${content}</p></td></tr></table>`;
			for (let round = 0; round < 3; round++) {
				html = documentMarkdownToHtml(documentHtmlToMarkdown(html)).html;
				expect(html).toContain(`<td>${content}</td>`);
			}
		}
	});

	it('treats the strict inline code fallback as literal text without opening raw HTML attributes', () => {
		const safe = documentMarkdownToHtml(
			'| H |\n| --- |\n| <code>&#60;script&#62;alert&#40;1&#41;&#60;/script&#62;</code> |'
		);
		expect(safe.html).toContain('<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>');
		expect(safe.html).not.toContain('<script>');
		const unsafe = documentMarkdownToHtml('| H |\n| --- |\n| <code onclick="alert(1)">x</code> |');
		expect(unsafe.html).not.toContain('onclick');
		expect(unsafe.html).not.toContain('<code');
	});
});
