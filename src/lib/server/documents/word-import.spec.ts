import { describe, expect, it } from 'vitest';
import { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { previewWordDocument, WordImportError } from './word-import';

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
