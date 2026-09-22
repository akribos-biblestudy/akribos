import { unzipSync, strFromU8 } from 'fflate';
import PDFDocument from 'pdfkit';
import { describe, expect, it, vi } from 'vitest';
import type { OwnedDocumentExport } from './export';
import { createDocxExport, createPdfExport, pdfInlineRuns } from './export';
import { parseDocumentFootnotes } from '$lib/notes/document-footnotes';
import { previewWordDocument } from './word-import';

const fixture = {
	document: {
		id: '5eed0000-0000-4000-8000-000000000004',
		kind: 'sermon',
		title: 'Geliebt & gesandt – für Ähren',
		bodyMarkdown:
			'# Hoffnung\n\nGott **liebt** die Welt: χάρις שָׁלוֹם. [Weitere Notiz](/notes/5eed0000-0000-4000-8000-000000000005) und [Akribos](https://akribos.de/about).\n',
		sermonDate: new Date('2026-09-06T00:00:00.000Z'),
		sermonSeries: 'Johannes',
		sermonFormat: 'home-group'
	},
	tags: ['Ausarbeitung/Johannes'],
	passages: [{ reference: 'Joh 3,16-17' }],
	deliveries: [{ date: new Date('2026-09-13T00:00:00.000Z'), location: 'Gemeinde Nord' }]
} as OwnedDocumentExport;

describe('portable rich document exports', () => {
	const footnoteMarkdown =
		'Text[^zweite], danach[^erste] und erneut[^zweite]. Code `[^erste]` und literal \\[^erste].\n\n' +
		'[^erste]: Erste Erklärung.\n\n' +
		'[^zweite]: **Zweite Erklärung** mit [Quelle](https://example.test/footnote).\n\n' +
		'    Ein weiterer Absatz mit Joh 3,16.\n\n' +
		'[^unbenutzt]: Unreferenzierter Inhalt bleibt erhalten.\n';

	it('exports native numbered Word footnotes with repeats, rich content and visible orphaned notes', async () => {
		const result = await createDocxExport({
			...fixture,
			document: { ...fixture.document, bodyMarkdown: footnoteMarkdown }
		});
		const zip = unzipSync(result.buffer);
		const body = strFromU8(zip['word/document.xml']!);
		const notes = strFromU8(zip['word/footnotes.xml']!);
		expect(
			[...body.matchAll(/<w:footnoteReference w:id="(\d+)"\/>/g)].map((match) => match[1])
		).toEqual(['1', '2', '1']);
		expect(notes).toContain('Zweite Erklärung');
		expect(notes).toContain('Erste Erklärung');
		expect(notes).toContain('Ein weiterer Absatz mit Joh 3,16.');
		expect(notes).toContain('<w:b/>');
		expect(notes).toContain('<w:footnoteRef/>');
		expect(strFromU8(zip['word/_rels/footnotes.xml.rels']!)).toContain(
			'https://example.test/footnote'
		);
		expect(body).toContain('Unreferenzierter Inhalt bleibt erhalten.');
		expect(body).toContain('Fußnoten ohne Verweis');
		expect(body).toContain('[^erste]');
		expect(body).not.toContain('Zweite Erklärung');
	});

	it('round-trips real DOCX footnotes through the Word importer with their formatting and text', async () => {
		const result = await createDocxExport({
			...fixture,
			document: { ...fixture.document, bodyMarkdown: footnoteMarkdown }
		});
		const imported = await previewWordDocument(result.filename, result.buffer);
		expect(imported.html.match(/<sup data-footnote-ref=/g)).toHaveLength(3);
		expect(imported.html).toContain('<strong>Zweite Erklärung</strong>');
		expect(imported.plainText).toContain('Erste Erklärung');
		expect(imported.plainText).toContain('Ein weiterer Absatz mit Joh 3,16.');
		expect(imported.plainText).toContain('Unreferenzierter Inhalt bleibt erhalten.');
		expect(imported.html).toContain('href="https://example.test/footnote"');
	});

	it('keeps a newly inserted empty footnote valid and editable in Word', async () => {
		const result = await createDocxExport({
			...fixture,
			document: { ...fixture.document, bodyMarkdown: 'Text[^leer].\n\n[^leer]:\n' }
		});
		const zip = unzipSync(result.buffer);
		const notes = strFromU8(zip['word/footnotes.xml']!);
		expect(notes).toMatch(
			/<w:footnote w:id="1"><w:p>[\s\S]*?<w:footnoteRef\/>[\s\S]*?<\/w:p><\/w:footnote>/
		);
		const imported = await previewWordDocument(result.filename, result.buffer);
		expect(imported.html.match(/<sup data-footnote-ref=/g)).toHaveLength(1);
		expect(parseDocumentFootnotes(imported.markdown).footnotes).toHaveLength(1);
	});

	it('links PDF markers to complete numbered endnotes while keeping code and escaped markers literal', async () => {
		const parsed = parseDocumentFootnotes(footnoteMarkdown);
		const runs = pdfInlineRuns('Text[^zweite] und `[^erste]` und \\[^erste]', parsed.footnotes);
		expect(runs).toEqual([
			{ text: 'Text' },
			{ text: '[1]', footnoteId: 'zweite' },
			{ text: ' und [^erste] und [^erste]' }
		]);
		const text = vi.spyOn(PDFDocument.prototype, 'text');
		try {
			const result = await createPdfExport(
				{
					...fixture,
					document: { ...fixture.document, bodyMarkdown: footnoteMarkdown }
				},
				{ compress: false }
			);
			const written = text.mock.calls.map(([value]) => value).join('');
			expect(written).toContain('Fußnoten');
			expect(written).toContain('Zweite Erklärung');
			expect(written).toContain('Erste Erklärung');
			expect(written).toContain('Unreferenzierter Inhalt bleibt erhalten.');
			expect(written).toContain('Ein weiterer Absatz mit Joh 3,16.');
			expect(result.buffer.toString('latin1')).toContain('akribos-footnote-zweite');
			expect(result.buffer.toString('latin1')).toContain('/URI (https://example.test/footnote)');
		} finally {
			text.mockRestore();
		}
	});

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
		expect(pdfInlineRuns('Ausarbeitung am 03.05.2026. Siehe Joh 3,16 und `Mt 5,3`.')).toEqual([
			{ text: 'Ausarbeitung am 03.05.2026. Siehe ' },
			{ text: 'Joh 3,16', bibleReference: true },
			{ text: ' und Mt 5,3.' }
		]);
	});

	it('preserves literal symbols, code and links in DOCX while retaining actual formatting', async () => {
		const markdown =
			'## **Überschrift**\n\n2 * 3 = 6, a_b und ~Wert; `x_y*z` und https://example.test/a_b?q=c_d. Fish &amp; Chips.\n\n[Interne Notiz](/notes/example)\n\n~~~text\n# Keine Überschrift\na_b *= 2\n  [literal](https://example.test/code)\n~~~';
		const result = await createDocxExport(
			{ ...fixture, document: { ...fixture.document, bodyMarkdown: markdown } },
			{ baseUrl: 'https://reader.example.test' }
		);
		const zip = unzipSync(result.buffer);
		const xml = strFromU8(zip['word/document.xml']!);
		const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/gu)]
			.map((match) => match[1]!.replace(/&amp;/gu, '&'))
			.join('');
		expect(text).toContain('2 * 3 = 6, a_b und ~Wert; x_y*z');
		expect(text).toContain('https://example.test/a_b?q=c_d');
		expect(text).toContain('Fish & Chips.');
		expect(text).toContain('# Keine Überschrifta_b *= 2  [literal](https://example.test/code)');
		expect(xml).toContain('<w:b/>');
		expect(xml).toContain('<w:br/>');
		const relations = strFromU8(zip['word/_rels/document.xml.rels']!);
		expect(relations).toContain('https://reader.example.test/notes/example');
		expect(relations).toContain('https://example.test/a_b?q=c_d');
		expect(relations).not.toContain('https://example.test/code');
	});

	it('sends fenced and indented code literally to PDFKit without creating links or Bible highlights', async () => {
		const code =
			'# Keine Überschrift\nx_y *= 2\n  [literal](https://example.test/code) Joh 3,16 &amp;';
		const text = vi.spyOn(PDFDocument.prototype, 'text');
		try {
			const result = await createPdfExport(
				{
					...fixture,
					document: {
						...fixture.document,
						bodyMarkdown: `~~~text\n${code}\n~~~\n\n    a_b * c\n    # eingerückt`
					}
				},
				{ compress: false }
			);
			const written = text.mock.calls.map(([value]) => value).join('');
			expect(written).toContain(code);
			expect(written).toContain('a_b * c\n# eingerückt');
			expect(result.buffer.toString('latin1')).not.toContain('/URI (https://example.test/code)');
		} finally {
			text.mockRestore();
		}
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
