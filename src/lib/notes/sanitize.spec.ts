import { describe, expect, it } from 'vitest';
import { noteToText, sanitizeNoteHtml } from './sanitize.ts';

describe('sanitizeNoteHtml', () => {
	it('keeps the formatting the editor produces', () => {
		expect(sanitizeNoteHtml('<p>Ein <strong>wichtiger</strong> Gedanke</p>')).toBe(
			'<p>Ein <strong>wichtiger</strong> Gedanke</p>'
		);
		expect(sanitizeNoteHtml('<ul><li>eins</li><li>zwei</li></ul>')).toBe(
			'<ul><li>eins</li><li>zwei</li></ul>'
		);
		expect(sanitizeNoteHtml('<div>erste Zeile</div><div>zweite Zeile</div>')).toBe(
			'<div>erste Zeile</div><div>zweite Zeile</div>'
		);
		expect(sanitizeNoteHtml('<h2><u>Überschrift</u></h2><p><s>veraltet</s></p>')).toBe(
			'<h2><u>Überschrift</u></h2><p><s>veraltet</s></p>'
		);
	});

	it('removes scripts', () => {
		// A note is rendered in someone else's browser when a list is shared.
		expect(sanitizeNoteHtml('<script>alert(1)</script>')).toBe(
			'&lt;script&gt;alert(1)&lt;/script&gt;'
		);
		expect(sanitizeNoteHtml('<img src=x onerror=alert(1)>')).toBe(
			'&lt;img src=x onerror=alert(1)&gt;'
		);
	});

	it('strips every attribute, including from allowed tags', () => {
		expect(sanitizeNoteHtml('<p onclick="alert(1)">Text</p>')).toBe(
			'&lt;p onclick="alert(1)"&gt;Text</p>'
		);
		expect(sanitizeNoteHtml('<p style="position:fixed">Text</p>')).toContain('&lt;p style');
	});

	it('drops tags that are not allowed', () => {
		expect(sanitizeNoteHtml('<a href="http://example.com">Link</a>')).toBe(
			'&lt;a href="http://example.com"&gt;Link&lt;/a&gt;'
		);
		expect(sanitizeNoteHtml('<iframe src="x"></iframe>')).toBe(
			'&lt;iframe src="x"&gt;&lt;/iframe&gt;'
		);
	});

	it('leaves text that merely looks like markup readable', () => {
		expect(sanitizeNoteHtml('5 < 7 & 8 > 6')).toBe('5 &lt; 7 &amp; 8 &gt; 6');
		expect(sanitizeNoteHtml('schon &amp; escaped')).toBe('schon &amp; escaped');
	});

	it('removes the empty paragraphs a contenteditable field leaves behind', () => {
		expect(sanitizeNoteHtml('<p>Text</p><p></p><p>  </p>')).toBe('<p>Text</p>');
	});

	it('handles empty input and caps the length', () => {
		expect(sanitizeNoteHtml('')).toBe('');
		expect(sanitizeNoteHtml('x'.repeat(30_000)).length).toBe(20_000);
	});
});

describe('noteToText', () => {
	it('reduces a note to plain text', () => {
		expect(noteToText('<p>Ein <strong>Gedanke</strong></p>')).toBe('Ein Gedanke');
		expect(noteToText('5 &lt; 7')).toBe('5 < 7');
		expect(noteToText(null)).toBe('');
	});
});
