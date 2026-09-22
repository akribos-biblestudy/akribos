import { describe, expect, it } from 'vitest';
import {
	Document,
	ExternalHyperlink,
	FootnoteReferenceRun,
	HeadingLevel,
	Packer,
	Paragraph,
	TextRun
} from 'docx';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { previewWordDocument, WordImportError } from './word-import';
import { parseDocumentFootnotes } from '../../notes/document-footnotes.ts';

async function footnoteFixture() {
	return Packer.toBuffer(
		new Document({
			footnotes: {
				1: {
					children: [
						new Paragraph({
							children: [
								new TextRun({ text: 'Fette Erklärung', bold: true }),
								new TextRun(' mit '),
								new ExternalHyperlink({
									link: 'https://example.com',
									children: [new TextRun('Quelle')]
								})
							]
						}),
						new Paragraph('Zweiter Absatz.')
					]
				},
				2: { children: [new Paragraph('Andere Erklärung.')] }
			},
			sections: [
				{
					children: [
						new Paragraph({
							children: [
								new TextRun('Text'),
								new FootnoteReferenceRun(1),
								new TextRun(' wieder'),
								new FootnoteReferenceRun(1),
								new TextRun(' andere'),
								new FootnoteReferenceRun(2)
							]
						})
					]
				}
			]
		})
	);
}

async function fixture() {
	return Packer.toBuffer(
		new Document({
			sections: [
				{
					children: [
						new Paragraph({ text: 'Eine Überschrift', heading: HeadingLevel.HEADING_1 }),
						new Paragraph({
							children: [
								new TextRun({ text: 'Gottes Liebe', bold: true }),
								new TextRun(' in Joh 3,16.')
							]
						}),
						new Paragraph({ text: 'Ein Listenpunkt', bullet: { level: 0 } }),
						new Paragraph({
							children: [
								new ExternalHyperlink({
									link: 'https://example.com',
									children: [new TextRun('Quelle')]
								})
							]
						})
					]
				}
			]
		})
	);
}

describe('Word document import', () => {
	it('imports native repeated Word footnotes as one stable definition with rich content', async () => {
		const preview = await previewWordDocument('Fußnoten.docx', await footnoteFixture());
		const parsed = parseDocumentFootnotes(preview.markdown);
		expect(parsed.footnotes).toHaveLength(2);
		expect(preview.html.match(/data-footnote-ref="footnote-1"/g)).toHaveLength(2);
		expect(preview.html.match(/<li data-footnote-id=/g)).toHaveLength(2);
		expect(preview.html).toContain('<strong>Fette Erklärung</strong>');
		expect(preview.html).toContain('<a href="https://example.com">Quelle</a>');
		expect(preview.html).toContain('Zweiter Absatz.');
		expect(preview.html).toContain('Andere Erklärung.');
		expect(preview.markdown).not.toMatch(/footnote-ref-|\[↑\]/);
	});

	it('sanitises links inside native footnote definitions after identifying their structure', async () => {
		const entries = unzipSync(await footnoteFixture());
		const path = 'word/_rels/footnotes.xml.rels';
		entries[path] = strToU8(
			new TextDecoder().decode(entries[path]).replace('https://example.com', 'javascript:alert(1)')
		);
		const preview = await previewWordDocument('Unsicher.docx', zipSync(entries));
		expect(parseDocumentFootnotes(preview.markdown).footnotes).toHaveLength(2);
		expect(preview.markdown).not.toContain('javascript:');
		expect(preview.html).not.toContain('javascript:');
		expect(preview.plainText).toContain('Quelle');
	});
	it('preserves headings, emphasis, lists, links and scripture text as private note content', async () => {
		const preview = await previewWordDocument('Meine-Notiz.docx', await fixture());
		expect(preview).toMatchObject({
			title: 'Meine Notiz',
			kind: 'note',
			sourceFilename: 'Meine-Notiz.docx',
			tags: [],
			passages: []
		});
		expect(preview.html).toContain('<h1>Eine Überschrift</h1>');
		expect(preview.html).toContain('<strong>Gottes Liebe</strong>');
		expect(preview.html).toContain('<ul>');
		expect(preview.html).toContain('href="https://example.com"');
		expect(preview.plainText).toContain('Joh 3,16.');
		expect(preview.warnings.length).toBeGreaterThan(0);
	});

	it('sanitises links supplied by Word', async () => {
		const entries = unzipSync(await fixture());
		const path = 'word/_rels/document.xml.rels';
		entries[path] = strToU8(
			new TextDecoder().decode(entries[path]).replace('https://example.com', 'javascript:alert(1)')
		);
		const preview = await previewWordDocument('Links.docx', zipSync(entries));
		expect(preview.html).not.toContain('javascript:');
		expect(preview.markdown).not.toContain('javascript:');
		expect(preview.plainText).toContain('Quelle');
	});

	it('rejects corrupt packages, unsafe filenames, traversal and excessive expanded data', async () => {
		await expect(previewWordDocument('Kaputt.docx', strToU8('not a ZIP'))).rejects.toThrow();
		await expect(previewWordDocument('../Notiz.docx', await fixture())).rejects.toThrow();
		await expect(
			previewWordDocument('Notiz.docx', zipSync({ '../word/document.xml': strToU8('bad') }))
		).rejects.toThrow();
		await expect(
			previewWordDocument(
				'Notiz.docx',
				zipSync({ 'word/document.xml': new Uint8Array(16 * 1024 * 1024 + 1) })
			)
		).rejects.toThrow();
	});

	it('rejects DTDs and deep XML before conversion', async () => {
		for (const xml of [
			'<!DOCTYPE test [<!ENTITY x "boom">]><test>&x;</test>',
			'<a>'.repeat(101) + '</a>'.repeat(101)
		]) {
			const entries = unzipSync(await fixture());
			entries['word/document.xml'] = strToU8(xml);
			await expect(previewWordDocument('Notiz.docx', zipSync(entries))).rejects.toBeInstanceOf(
				WordImportError
			);
		}
	});
});
