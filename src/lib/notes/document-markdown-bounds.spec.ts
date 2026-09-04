import { describe, expect, it } from 'vitest';
import {
	exportDocumentMarkdown,
	MAX_DOCUMENT_MARKDOWN_BYTES,
	MAX_OBSIDIAN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES,
	previewObsidianMarkdown
} from './document-markdown.ts';
import {
	MAX_DOCUMENT_MARKDOWN_BYTES as DOMAIN_MARKDOWN_BYTES,
	MAX_OBSIDIAN_FRONTMATTER_BYTES as DOMAIN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES as DOMAIN_IMPORT_BYTES,
	utf8ByteLength
} from './documents.ts';

describe('document body and portable-file size boundaries', () => {
	it('uses the shared domain constants for Markdown, frontmatter and complete import files', () => {
		expect(MAX_DOCUMENT_MARKDOWN_BYTES).toBe(DOMAIN_MARKDOWN_BYTES);
		expect(MAX_OBSIDIAN_FRONTMATTER_BYTES).toBe(DOMAIN_FRONTMATTER_BYTES);
		expect(MAX_OBSIDIAN_IMPORT_BYTES).toBe(DOMAIN_IMPORT_BYTES);
		expect(MAX_OBSIDIAN_IMPORT_BYTES).toBeGreaterThan(MAX_DOCUMENT_MARKDOWN_BYTES);
	});

	it('exports and reimports a full one-MiB working copy with generated YAML frontmatter', () => {
		const body = `${'x'.repeat(MAX_DOCUMENT_MARKDOWN_BYTES - 1)}\n`;
		expect(utf8ByteLength(body)).toBe(MAX_DOCUMENT_MARKDOWN_BYTES);

		const exported = exportDocumentMarkdown({
			title: 'Grenzfall',
			kind: 'note',
			markdown: body,
			createdAt: '2026-09-01T10:20:30.000Z',
			updatedAt: '2026-09-04T12:00:00.000Z'
		});

		expect(utf8ByteLength(exported)).toBeGreaterThan(MAX_DOCUMENT_MARKDOWN_BYTES);
		expect(utf8ByteLength(exported)).toBeLessThanOrEqual(MAX_OBSIDIAN_IMPORT_BYTES);
		expect(previewObsidianMarkdown('grenzfall.md', exported).markdown).toBe(body);
	});

	it('still rejects a body over one MiB and a complete file beyond its bounded headroom', () => {
		expect(() =>
			previewObsidianMarkdown(
				'body-too-large.md',
				`---\ntitle: Groß\n---\n\n${'x'.repeat(MAX_DOCUMENT_MARKDOWN_BYTES)}\n`
			)
		).toThrowError(expect.objectContaining({ code: 'file_too_large' }));

		expect(() =>
			previewObsidianMarkdown('file-too-large.md', new Uint8Array(MAX_OBSIDIAN_IMPORT_BYTES + 1))
		).toThrowError(expect.objectContaining({ code: 'file_too_large' }));
	});
});
