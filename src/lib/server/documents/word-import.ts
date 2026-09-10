import mammoth from 'mammoth';
import { zipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import {
	documentHtmlToMarkdown,
	documentMarkdownToHtml,
	previewObsidianMarkdown,
	type ObsidianDocumentPreview
} from '$lib/notes/document-markdown';
import { extractBoundedDocumentArchive } from '$lib/notes/obsidian-archive';

export class WordImportError extends Error {
	constructor() {
		super('invalid_word');
	}
}

/** DOCX is an untrusted ZIP/XML package; never let it resolve files or embedded style maps. */
export async function previewWordDocument(
	filename: string,
	bytes: Uint8Array
): Promise<ObsidianDocumentPreview> {
	// Reuse the path/control-character checks and filename-derived title of the Markdown importer.
	const base = previewObsidianMarkdown(filename.replace(/\.docx$/iu, '.md'), '');
	const entries = extractBoundedDocumentArchive(bytes, true);
	if (!entries['word/document.xml'] || !entries['[Content_Types].xml']) throw new WordImportError();
	try {
		for (const [name, contents] of Object.entries(entries)) {
			if (!/\.(?:xml|rels)$/iu.test(name)) continue;
			let depth = 0;
			const parser = new SaxesParser();
			parser.on('doctype', () => {
				throw new WordImportError();
			});
			parser.on('opentag', () => {
				if (++depth > 100) throw new WordImportError();
			});
			parser.on('closetag', () => {
				depth--;
			});
			parser.write(new TextDecoder('utf-8', { fatal: true }).decode(contents)).close();
		}
	} catch {
		throw new WordImportError();
	}
	let result;
	try {
		// Repack only the bounded, validated parts so the converter cannot interpret different entries.
		result = await mammoth.convertToHtml(
			{ buffer: Buffer.from(zipSync(entries, { level: 0 })) },
			{
				includeEmbeddedStyleMap: false,
				externalFileAccess: false,
				styleMap: ['u => u', 'strike => del', 'p.Title => h1:fresh'],
				convertImage: mammoth.images.imgElement(async () => ({ src: '' }))
			}
		);
	} catch {
		throw new WordImportError();
	}
	if (result.messages.some((message) => message.type === 'error')) throw new WordImportError();
	const markdown = documentHtmlToMarkdown(result.value);
	return {
		...base,
		markdown,
		...documentMarkdownToHtml(markdown),
		sourceFilename: filename.normalize('NFC').trim(),
		warnings: ['Word layout, images, attachments and comments are not imported.']
	};
}

export function decodeWordSource(source: string): Uint8Array {
	if (!source || source.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(source))
		throw new WordImportError();
	return Buffer.from(source, 'base64');
}
