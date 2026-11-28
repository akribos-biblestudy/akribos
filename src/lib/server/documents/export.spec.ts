import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { OwnedDocumentExport } from './export';
import { createDocxExport, createPdfExport } from './export';
import { createPdfModel } from './pdf-model';
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
	it('fits images to table cells and rejects reference-image expansion before export', async () => {
		const source =
			'data:image/png;base64,' +
			(await readFile('e2e/fixtures/document-image.png')).toString('base64');
		const data = {
			...fixture,
			document: {
				...fixture.document,
				bodyMarkdown: `| A | B |\n| --- | --- |\n| ![A](${source}) | ![B](${source}) |\n`
			}
		};
		const docx = await createDocxExport(data);
		const xml = strFromU8(unzipSync(docx.buffer)['word/document.xml']!);
		const widths = [...xml.matchAll(/<wp:extent cx="(\d+)"/g)].map((match) => Number(match[1]));
		expect(widths).toHaveLength(2);
		for (const width of widths) expect(width).toBeLessThanOrEqual(269 * 9525);
		const smallSource =
			'data:image/png;base64,' +
			(await readFile('e2e/fixtures/document-image-small.png')).toString('base64');
		const huge = {
			...fixture,
			document: {
				...fixture.document,
				bodyMarkdown: '![A][same] '.repeat(250) + `\n\n[same]: ${smallSource}\n`
			}
		};
		await expect(createDocxExport(huge)).rejects.toThrow(/Bilder sind zusammen zu groß/);
		await expect(createPdfExport(huge)).rejects.toThrow(/Bilder sind zusammen zu groß/);
	});
	it('sets the chosen image alignment and width in Word and PDF', async () => {
		const source =
			'data:image/png;base64,' +
			(await readFile('e2e/fixtures/document-image.png')).toString('base64');
		const markdown = `Vorher ![A](${source} "akribos:image:right:50") nachher.\n`;
		const data = { ...fixture, document: { ...fixture.document, bodyMarkdown: markdown } };
		const docx = await createDocxExport(data);
		const xml = strFromU8(unzipSync(docx.buffer)['word/document.xml']!);
		const paragraphs = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/gu)].map((match) => match[1]!);
		const picture = paragraphs.findIndex((paragraph) => paragraph.includes('<w:drawing>'));
		expect(paragraphs[picture - 1]).toContain('Vorher');
		expect(paragraphs[picture]).toContain('<w:jc w:val="right"/>');
		expect(paragraphs[picture]).toContain(`<wp:extent cx="${285 * 9525}"`);
		expect(paragraphs[picture + 1]).toContain('nachher');

		expect(createPdfModel('Titel', markdown, []).blocks).toMatchObject([
			{
				kind: 'paragraph',
				runs: [
					{ text: 'Vorher ' },
					{ image: { layout: { align: 'right', width: 50 } } },
					{ text: ' nachher.' }
				]
			}
		]);
		const pdf = await createPdfExport(data);
		const directory = await mkdtemp(join(tmpdir(), 'akribos-image-layout-'));
		try {
			const path = join(directory, 'image.pdf');
			await writeFile(path, pdf.buffer);
			const { stdout } = await promisify(execFile)('pdfimages', ['-list', path]);
			// 1200 pixels printed at 81 mm (50% of the 162 mm text width) yields about 376 dpi.
			expect(stdout).toMatch(/image\s+1200\s+600\s+.*\b37[0-9]\s+37[0-9]\s/u);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('embeds document images in Word and PDF', async () => {
		const source =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQSjMGAAFpALw5l2YJAAAAAElFTkSuQmCC';
		const data = {
			...fixture,
			document: { ...fixture.document, bodyMarkdown: `Vorher ![Bild](${source}) danach.` }
		};
		const docx = await createDocxExport(data);
		const zip = unzipSync(docx.buffer);
		expect(Object.keys(zip).some((path) => path.startsWith('word/media/'))).toBe(true);
		expect(strFromU8(zip['word/document.xml']!)).toContain('<w:drawing>');
		const pdf = await createPdfExport(data);
		const directory = await mkdtemp(join(tmpdir(), 'akribos-image-export-'));
		try {
			const path = join(directory, 'image.pdf');
			await writeFile(path, pdf.buffer);
			const { stdout } = await promisify(execFile)('pdfimages', ['-list', path]);
			expect(stdout).toMatch(/\d+\s+\d+\s+image\s+1\s+1/);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
	it('preserves encoded table code punctuation in actual DOCX and PDF output', async () => {
		const markdown =
			'| Code |\n| --- |\n' +
			'| <code>x&#92;&#124;y</code> |\n' +
			'| <code>x&#92;&#92;&#124;y</code> |\n' +
			'| <code>x&#92;&#92;&#92;&#124;y&#96;&#95;&#42;&#91;&#93;</code> |\n';
		const expected = ['x\\|y', 'x\\\\|y', 'x\\\\\\|y`_*[]'];
		const data = { ...fixture, document: { ...fixture.document, bodyMarkdown: markdown } };
		const docx = await createDocxExport(data);
		const xml = strFromU8(unzipSync(docx.buffer)['word/document.xml']!);
		const codeRuns = [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/gu)]
			.filter((match) => match[1]!.includes('w:ascii="Courier New"'))
			.map((match) => match[1]!.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/u)?.[1]);
		expect(codeRuns).toEqual(expected);
		expect(xml).not.toMatch(/&lt;code&gt;|&#92;|&#124;/u);

		const pdf = await createPdfExport(data);
		const directory = await mkdtemp(join(tmpdir(), 'akribos-table-code-export-'));
		try {
			const path = join(directory, 'code.pdf');
			await writeFile(path, pdf.buffer);
			const exec = promisify(execFile);
			const [text, fonts] = await Promise.all([
				exec('pdftotext', ['-layout', path, '-']),
				exec('pdffonts', [path])
			]);
			for (const value of expected) expect(text.stdout).toContain(value);
			expect(text.stdout).not.toMatch(/<\/?code>|&#\d+;/u);
			expect(fonts.stdout).toContain('DejaVuSansMono');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('exports real aligned Word table cells with empty cells, hard breaks, links and native footnotes', async () => {
		const markdown =
			'| Links | Mitte | Rechts |\n| :--- | :---: | ---: |\n| **Fett**<br>Zweite[^n] | | [Quelle][url] |\n| A \\| B | *kursiv* | Ende |\n\n[url]: https://example.test/table\n\n[^n]:\n\n    | Notizkopf | Zweiter Kopf |\n    | --- | --- |\n    | Tabellenfußnote | Inhalt |\n';
		const result = await createDocxExport({
			...fixture,
			document: { ...fixture.document, bodyMarkdown: markdown }
		});
		const zip = unzipSync(result.buffer);
		const xml = strFromU8(zip['word/document.xml']!);
		const tableXml = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/u)![0];
		expect(tableXml.match(/<w:tr>/gu)).toHaveLength(3);
		expect(tableXml.match(/<w:tc>/gu)).toHaveLength(9);
		expect(tableXml).toContain('<w:tblHeader');
		for (const alignment of ['left', 'center', 'right'])
			expect(tableXml).toContain(`<w:jc w:val="${alignment}"/>`);
		expect(tableXml).toContain('<w:b/>');
		expect(tableXml).toContain('<w:i/>');
		expect(tableXml).toContain('<w:br/>');
		expect(tableXml).toContain('<w:footnoteReference w:id="1"/>');
		expect(strFromU8(zip['word/_rels/document.xml.rels']!)).toContain('https://example.test/table');
		const notes = strFromU8(zip['word/footnotes.xml']!);
		expect(notes).toMatch(
			/<w:footnote w:id="1"><w:p>[\s\S]*?<w:footnoteRef\/>[\s\S]*?<\/w:p><w:tbl>/u
		);
		expect(notes).toContain('Tabellenfußnote');
		const imported = await previewWordDocument(result.filename, result.buffer);
		expect(imported.html.match(/<table>/gu)).toHaveLength(2);
		expect(imported.html).toContain('<strong>Fett</strong><br>Zweite');
		expect(imported.html).toContain('<em>kursiv</em>');
		expect(imported.html).toContain('<td></td>');
		expect(imported.html).toContain('A | B');
		expect(imported.html).toContain('href="https://example.test/table"');
		expect(parseDocumentFootnotes(imported.markdown).footnotes[0]!.markdown).toContain(
			'Tabellenfußnote'
		);
	});

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

	it('creates a real DOCX archive with a safe attachment name', async () => {
		const result = await createDocxExport(fixture);
		expect(result.filename).toBe('Geliebt & gesandt – für Ähren.docx');
		expect(result.contentDisposition).toContain(
			"filename*=UTF-8''Geliebt%20%26%20gesandt%20%E2%80%93%20f%C3%BCr%20%C3%84hren.docx"
		);
		expect(result.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
	});
});
