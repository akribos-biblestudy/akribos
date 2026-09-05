import { describe, expect, it } from 'vitest';
import type { OwnedDocumentExport } from './export';
import { createDocxExport, createPdfExport, pdfInlineRuns } from './export';

const fixture = {
	document: {
		id: '5eed0000-0000-4000-8000-000000000004',
		kind: 'sermon',
		title: 'Geliebt & gesandt – für Ähren',
		bodyMarkdown:
			'# Hoffnung\n\nGott **liebt** die Welt: χάρις שָׁלוֹם. [Weitere Notiz](/notes/5eed0000-0000-4000-8000-000000000005) und [Akribos](https://akribos.de/about).\n',
		sermonDate: new Date('2026-09-06T00:00:00.000Z'),
		sermonSeries: 'Johannes'
	},
	tags: ['Predigt/Johannes'],
	passages: [{ reference: 'Joh 3,16-17' }],
	deliveries: [{ date: new Date('2026-09-13T00:00:00.000Z'), location: 'Gemeinde Nord' }]
} as OwnedDocumentExport;

describe('portable rich document exports', () => {
	it('retains safe Markdown links as ordered PDF text runs', () => {
		expect(
			pdfInlineRuns('Vor [der Notiz](/notes/5eed0000-0000-4000-8000-000000000005) danach')
		).toEqual([
			{ text: 'Vor ' },
			{
				text: 'der Notiz',
				href: '/notes/5eed0000-0000-4000-8000-000000000005'
			},
			{ text: ' danach' }
		]);
	});

	it('marks inline Bible references as green PDF runs without changing code spans', () => {
		expect(pdfInlineRuns('Predigt am 03.05.2026. Siehe Joh 3,16 und `Mt 5,3`.')).toEqual([
			{ text: 'Predigt am 03.05.2026. Siehe ' },
			{ text: 'Joh 3,16', bibleReference: true },
			{ text: ' und Mt 5,3.' }
		]);
	});

	it('creates a real DOCX archive with a safe attachment name', async () => {
		const result = await createDocxExport(fixture);
		expect(result.filename).toBe('Geliebt & gesandt – für Ähren.docx');
		expect(result.contentDisposition).toContain(
			"filename*=UTF-8''Geliebt%20%26%20gesandt%20%E2%80%93%20f%C3%BCr%20%C3%84hren.docx"
		);
		expect(result.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
	});

	it('creates a real PDF with document metadata and body content', async () => {
		const result = await createPdfExport(fixture, {
			baseUrl: 'https://example.test',
			compress: false
		});
		expect(result.filename).toBe('Geliebt & gesandt – für Ähren.pdf');
		expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
		expect(result.buffer.byteLength).toBeGreaterThan(1_000);
		const pdfObjects = result.buffer.toString('latin1');
		expect(pdfObjects).toContain('NotoSans-Regular');
		expect(pdfObjects).toContain('NotoSansHebrew-Regular');
		expect(pdfObjects).toContain(
			'/URI (https://example.test/notes/5eed0000-0000-4000-8000-000000000005)'
		);
		expect(pdfObjects).toContain('/URI (https://akribos.de/about)');
		expect(pdfObjects.match(/\/URI \(https:\/\/example\.test\/notes\//gu)).toHaveLength(1);
		expect(pdfObjects.match(/\/URI \(https:\/\/akribos\.de\/about\)/gu)).toHaveLength(1);
		expect(pdfObjects).toContain('0.1843137254901961 0.49019607843137253 0.19607843137254902 scn');
		expect(pdfObjects).toContain('<414b5249424f53>'); // AKRIBOS in the page header
		expect(pdfObjects).toContain('<53656974652031202f2031>'); // Seite 1 / 1 in the footer
	});

	it('repeats the PDF header and numbered footer on every page', async () => {
		const result = await createPdfExport(
			{
				...fixture,
				document: {
					...fixture.document,
					bodyMarkdown: 'Ein ausreichend langer Absatz für mehrere Seiten.\n\n'.repeat(180)
				}
			},
			{ compress: false }
		);
		const pdfObjects = result.buffer.toString('latin1');
		const pageCount = Number(/\/Type \/Pages\s*\/Count (\d+)/u.exec(pdfObjects)?.[1] ?? 0);
		expect(pageCount).toBeGreaterThan(1);
		expect(pdfObjects.match(/<414b5249424f53>/gu)).toHaveLength(pageCount);
		expect(pdfObjects.match(/<536569746520/gu)).toHaveLength(pageCount);
	});
});
