import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { feedbackXlsx } from './xlsx';

describe('feedbackXlsx', () => {
	it('exports user text as escaped literal strings, never as executable formulas', () => {
		const files = unzipSync(
			feedbackXlsx([
				['Stelle', 'Beschreibung'],
				['G25', '=HYPERLINK("https://example.com") <Fehler> & Text']
			])
		);
		const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
		expect(sheet).toContain('t="inlineStr"');
		expect(sheet).toContain(
			'=HYPERLINK(&quot;https://example.com&quot;) &lt;Fehler&gt; &amp; Text'
		);
		expect(sheet).not.toContain('<f>');
		expect(files['xl/workbook.xml']).toBeDefined();
	});
	it('keeps valid Unicode while removing all characters that XML 1.0 forbids', () => {
		const files = unzipSync(feedbackXlsx([['Gültig 😀\nZeile\tText\u0001\uFFFE\uFFFF']]));
		const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
		expect(() => new SaxesParser({ xmlns: true }).write(sheet).close()).not.toThrow();
		expect(sheet).toContain('Gültig 😀\nZeile\tText');
		expect(sheet).not.toContain('\u0001');
		expect(sheet).not.toContain('\uFFFE');
		expect(sheet).not.toContain('\uFFFF');
	});
});
