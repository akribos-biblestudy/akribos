import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DOCUMENT_TITLE,
	DOCUMENT_KINDS,
	DOCUMENT_SOURCES,
	DOCUMENT_VISIBILITIES,
	GERMAN_SERMON_STARTER_TEMPLATE,
	isDocumentKind,
	isDocumentSource,
	isDocumentVisibility,
	isDocumentPassageCountAllowed,
	isObsidianImportSizeAllowed,
	isSermonWorkflowState,
	isValidDocumentMarkdown,
	isValidDocumentTitle,
	isValidTagPath,
	isValidTagSegment,
	MAX_DOCUMENT_MARKDOWN_BYTES,
	MAX_DOCUMENT_PASSAGES,
	MAX_DOCUMENT_TITLE_LENGTH,
	MAX_OBSIDIAN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES,
	MAX_TAG_DEPTH,
	MAX_TAG_SEGMENT_LENGTH,
	normalizeDocumentMarkdown,
	normalizeDocumentTitle,
	normalizeSermonWorkflowState,
	normalizeTagPath,
	normalizeTagSegment,
	SERMON_WORKFLOW_STATES,
	utf8ByteLength
} from './documents.ts';

describe('document vocabulary', () => {
	it('keeps the persisted enum values explicit and type-guarded', () => {
		expect(DOCUMENT_KINDS).toEqual(['note', 'article', 'sermon']);
		expect(DOCUMENT_VISIBILITIES).toEqual(['private', 'unlisted', 'public']);
		expect(SERMON_WORKFLOW_STATES).toEqual(['idea', 'research', 'outline', 'ready', 'delivered']);
		expect(DOCUMENT_SOURCES).toEqual(['native', 'obsidian', 'legacy-verse-comment']);

		expect(isDocumentKind('sermon')).toBe(true);
		expect(isDocumentKind('blog')).toBe(false);
		expect(isDocumentVisibility('unlisted')).toBe(true);
		expect(isDocumentVisibility('draft')).toBe(false);
		expect(isSermonWorkflowState('research')).toBe(true);
		expect(isSermonWorkflowState('published')).toBe(false);
		expect(isDocumentSource('legacy-verse-comment')).toBe(true);
		expect(isDocumentSource('email')).toBe(false);
	});

	it('normalizes an unknown sermon state to a safe draft state', () => {
		expect(normalizeSermonWorkflowState('ready')).toBe('ready');
		expect(normalizeSermonWorkflowState('unknown')).toBe('idea');
		expect(normalizeSermonWorkflowState(null, 'research')).toBe('research');
	});
});

describe('titles and tags', () => {
	it('normalizes whitespace, control characters and composed Unicode in titles', () => {
		expect(normalizeDocumentTitle('  Eine\n  Predigt\tüber Cafe\u0301  ')).toBe(
			'Eine Predigt über Café'
		);
		expect(DEFAULT_DOCUMENT_TITLE).toBe('Unbenanntes Dokument');
	});

	it('validates titles by Unicode characters, not UTF-16 code units', () => {
		expect(isValidDocumentTitle('Gedanken zu Johannes 3')).toBe(true);
		expect(isValidDocumentTitle('   ')).toBe(false);
		expect(isValidDocumentTitle('x'.repeat(MAX_DOCUMENT_TITLE_LENGTH))).toBe(true);
		expect(isValidDocumentTitle('x'.repeat(MAX_DOCUMENT_TITLE_LENGTH + 1))).toBe(false);
		expect(isValidDocumentTitle('😀'.repeat(MAX_DOCUMENT_TITLE_LENGTH))).toBe(true);
	});

	it('normalizes Obsidian-style nested tags into safe segments', () => {
		expect(normalizeTagSegment('  #Glaube  ')).toBe('Glaube');
		expect(normalizeTagPath('#Predigt/ Evangelien / Johannes ')).toEqual([
			'Predigt',
			'Evangelien',
			'Johannes'
		]);
		expect(isValidTagPath(normalizeTagPath('#Predigt/Evangelien/Johannes'))).toBe(true);
	});

	it('rejects empty, oversized, delimiter-containing and over-deep tag segments', () => {
		expect(isValidTagSegment('Glaube')).toBe(true);
		expect(isValidTagSegment('')).toBe(false);
		expect(isValidTagSegment('a/b')).toBe(false);
		expect(isValidTagSegment('Gebet, Lob')).toBe(false);
		expect(isValidTagSegment('Predigt\\Entwurf')).toBe(false);
		expect(isValidTagSegment('x'.repeat(MAX_TAG_SEGMENT_LENGTH + 1))).toBe(false);
		expect(isValidTagPath(['a', ''])).toBe(false);
		expect(isValidTagPath(Array.from({ length: MAX_TAG_DEPTH + 1 }, () => 'Ebene'))).toBe(false);
	});
});

describe('Markdown and import bounds', () => {
	it('normalizes a BOM and line endings without trimming Markdown', () => {
		expect(normalizeDocumentMarkdown('\uFEFF# Titel\r\n\rText  \r\n')).toBe('# Titel\n\nText  \n');
	});

	it('uses UTF-8 bytes for the one-MiB Markdown limit', () => {
		expect(MAX_DOCUMENT_MARKDOWN_BYTES).toBe(1024 * 1024);
		expect(utf8ByteLength('ä')).toBe(2);
		expect(isValidDocumentMarkdown('x'.repeat(MAX_DOCUMENT_MARKDOWN_BYTES))).toBe(true);
		expect(isValidDocumentMarkdown('ä'.repeat(MAX_DOCUMENT_MARKDOWN_BYTES / 2 + 1))).toBe(false);
		expect(isValidDocumentMarkdown('Text\u0000')).toBe(false);
	});

	it('bounds an Obsidian import by positive byte size', () => {
		expect(MAX_OBSIDIAN_FRONTMATTER_BYTES).toBe(64 * 1024);
		expect(MAX_OBSIDIAN_IMPORT_BYTES).toBe(
			MAX_DOCUMENT_MARKDOWN_BYTES + MAX_OBSIDIAN_FRONTMATTER_BYTES + 16
		);
		expect(isObsidianImportSizeAllowed(1)).toBe(true);
		expect(isObsidianImportSizeAllowed(MAX_OBSIDIAN_IMPORT_BYTES)).toBe(true);
		expect(isObsidianImportSizeAllowed(0)).toBe(false);
		expect(isObsidianImportSizeAllowed(MAX_OBSIDIAN_IMPORT_BYTES + 1)).toBe(false);
		expect(isObsidianImportSizeAllowed(1.5)).toBe(false);
	});

	it('centrally bounds the number of passage anchors while allowing an empty collection', () => {
		expect(MAX_DOCUMENT_PASSAGES).toBe(100);
		expect(isDocumentPassageCountAllowed(0)).toBe(true);
		expect(isDocumentPassageCountAllowed(MAX_DOCUMENT_PASSAGES)).toBe(true);
		expect(isDocumentPassageCountAllowed(-1)).toBe(false);
		expect(isDocumentPassageCountAllowed(MAX_DOCUMENT_PASSAGES + 1)).toBe(false);
		expect(isDocumentPassageCountAllowed(1.5)).toBe(false);
	});
});

describe('German sermon starter template', () => {
	it('provides a useful structure without inventing document metadata', () => {
		expect(GERMAN_SERMON_STARTER_TEMPLATE).toContain('## Bibeltext');
		expect(GERMAN_SERMON_STARTER_TEMPLATE).toContain('## Kerngedanke');
		expect(GERMAN_SERMON_STARTER_TEMPLATE).toContain('## Ziel der Predigt');
		expect(GERMAN_SERMON_STARTER_TEMPLATE).toContain('## Gliederung');
		expect(GERMAN_SERMON_STARTER_TEMPLATE).toContain('## Anwendung');
		expect(isValidDocumentMarkdown(GERMAN_SERMON_STARTER_TEMPLATE)).toBe(true);
	});
});
