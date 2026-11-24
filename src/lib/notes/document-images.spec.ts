import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	documentHtmlToMarkdown,
	documentMarkdownToHtml,
	previewObsidianMarkdown
} from './document-markdown';
import { MAX_DOCUMENT_IMAGE_BYTES, parseDocumentImage } from './document-images';

const png =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQSjMGAAFpALw5l2YJAAAAAElFTkSuQmCC';

describe('embedded document images', () => {
	it('preserves a bounded raster through Markdown, HTML and import', () => {
		expect(parseDocumentImage(png)).toMatchObject({ type: 'png', width: 1, height: 1 });
		const markdown = `Vorher ![Bild](${png}) danach.\n`;
		const { html, plainText } = documentMarkdownToHtml(markdown);
		expect(html).toContain(`<img src="${png}" alt="Bild">`);
		expect(plainText).not.toContain('base64');
		expect(documentHtmlToMarkdown(html)).toBe(markdown);
		expect(previewObsidianMarkdown('bild.md', '# Titel\n\n' + markdown).html).toContain(png);
	});

	it('rejects remote, active, malformed and oversized sources and strips unsafe attributes', () => {
		for (const source of [
			'https://example.test/tracker.png',
			'/private/image.png',
			'javascript:alert(1)',
			'data:image/svg+xml;base64,PHN2Zz4=',
			'data:image/png;base64,Zm9v',
			png.slice(0, -16),
			'data:image/png;base64,' + 'A'.repeat(Math.ceil(MAX_DOCUMENT_IMAGE_BYTES / 3) * 4 + 4)
		]) {
			expect(parseDocumentImage(source)).toBeNull();
			expect(documentMarkdownToHtml(`![Bild](${source})`).html).not.toContain('<img');
		}
		const roundTrip = documentHtmlToMarkdown(
			`<p><img src="${png}" alt="&quot; onerror=&quot;bad" onerror="bad()" style="position:fixed"></p>`
		);
		const { html } = documentMarkdownToHtml(roundTrip);
		expect(html).not.toContain(' onerror="');
		expect(html).not.toContain('style=');
		expect(html).toContain('alt="&quot; onerror=&quot;bad"');
	});

	it('bounds expanded reference images across body and footnotes', () => {
		const image =
			'data:image/png;base64,' +
			readFileSync('e2e/fixtures/document-image-small.png').toString('base64');
		const repeated = '![Bild][shared] '.repeat(250) + `\n\n[shared]: ${image}\n`;
		expect(() => documentMarkdownToHtml(repeated)).toThrow(/Bilder sind zusammen zu groß/);
		expect(() => previewObsidianMarkdown('bilder.md', repeated)).toThrow(
			/Bilder sind zusammen zu groß/
		);
		const half = '![Bild][shared] '.repeat(125) + `\n\n[shared]: ${image}\n`;
		const footnote = half
			.split('\n')
			.map((line) => `    ${line}`)
			.join('\n');
		expect(() => documentMarkdownToHtml(`${half}\n\n[^bild]:\n${footnote}`)).toThrow(
			/Bilder sind zusammen zu groß/
		);
	});

	it('bounds total decoded pixels for highly compressed images', () => {
		const image =
			'data:image/png;base64,' + readFileSync('e2e/fixtures/document-image.png').toString('base64');
		expect(() =>
			documentMarkdownToHtml('![Bild][shared] '.repeat(34) + `\n\n[shared]: ${image}\n`)
		).toThrow(/zu viele Pixel/);
	});
});
