import { describe, expect, it } from 'vitest';
import type { OwnedDocumentExport } from './export';
import { createDocxExport, createPdfExport } from './export';

const fixture = {
	document: {
		id: '5eed0000-0000-4000-8000-000000000004',
		kind: 'sermon',
		title: 'Geliebt & gesandt – für Ähren',
		bodyMarkdown: '# Hoffnung\n\nGott **liebt** die Welt: χάρις שָׁלוֹם.\n',
		sermonDate: new Date('2026-09-06T00:00:00.000Z'),
		sermonSeries: 'Johannes'
	},
	tags: ['Predigt/Johannes'],
	passages: [{ reference: 'Joh 3,16-17' }],
	deliveries: [{ date: new Date('2026-09-13T00:00:00.000Z'), location: 'Gemeinde Nord' }]
} as OwnedDocumentExport;

describe('portable rich document exports', () => {
	it('creates a real DOCX archive with a safe attachment name', async () => {
		const result = await createDocxExport(fixture);
		expect(result.filename).toBe('Geliebt & gesandt – für Ähren.docx');
		expect(result.contentDisposition).toContain(
			"filename*=UTF-8''Geliebt%20%26%20gesandt%20%E2%80%93%20f%C3%BCr%20%C3%84hren.docx"
		);
		expect(result.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
	});

	it('creates a real PDF with document metadata and body content', async () => {
		const result = await createPdfExport(fixture);
		expect(result.filename).toBe('Geliebt & gesandt – für Ähren.pdf');
		expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
		expect(result.buffer.byteLength).toBeGreaterThan(1_000);
		const pdfObjects = result.buffer.toString('latin1');
		expect(pdfObjects).toContain('NotoSans-Regular');
		expect(pdfObjects).toContain('NotoSansHebrew-Regular');
	});
});
