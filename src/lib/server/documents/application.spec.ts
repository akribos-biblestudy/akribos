import { describe, expect, it } from 'vitest';
import {
	documentEditorUrl,
	formatCalendarDate,
	isUuid,
	normalizeExcerpt,
	parseCalendarDate,
	parseRequiredRevision,
	prepareDocumentBody,
	safeReturnTo,
	slugifyArticle
} from './application';

describe('document application helpers', () => {
	it('derives safe HTML and plain text from normalized Markdown', () => {
		const prepared = prepareDocumentBody('## Titel\r\n\r\n<script>alert(1)</script>Text');
		expect(prepared.bodyMarkdown).toBe('## Titel\n\n<script>alert(1)</script>Text\n');
		expect(prepared.bodyHtml).toBe('<h2>Titel</h2>\nText\n');
		expect(prepared.bodyHtml).not.toContain('<script');
		expect(prepared.plainText).toBe('Titel Text');
	});

	it('keeps return targets on the current origin', () => {
		expect(safeReturnTo('/Johannes/3?tab=1#v16')).toBe('/Johannes/3?tab=1#v16');
		expect(safeReturnTo('//evil.example/path')).toBeNull();
		expect(safeReturnTo('/\\evil.example')).toBeNull();
		expect(documentEditorUrl('abc', '/Johannes/3')).toBe('/notes/abc?returnTo=%2FJohannes%2F3');
	});

	it('parses only real calendar dates and positive revisions', () => {
		const parsed = parseCalendarDate('2026-02-28');
		expect(parsed.ok && formatCalendarDate(parsed.value)).toBe('2026-02-28');
		expect(parseCalendarDate('2026-02-30')).toEqual({ ok: false });
		expect(parseRequiredRevision('2')).toBe(2);
		expect(parseRequiredRevision('0')).toBeNull();
		expect(isUuid('018f4dc0-3f44-7dd2-8f71-cd11e918d244')).toBe(true);
		expect(isUuid('not-an-id')).toBe(false);
	});

	it('creates portable German slugs and bounded excerpts', () => {
		expect(slugifyArticle('Über Gnade & Größe')).toBe('ueber-gnade-groesse');
		expect(normalizeExcerpt('  Ein\n\n kurzer   Text ')).toBe('Ein kurzer Text');
	});
});
