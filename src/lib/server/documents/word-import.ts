import mammoth from 'mammoth';
import { zipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import {
	documentHtmlToMarkdown,
	documentMarkdownToHtml,
	previewObsidianMarkdown,
	type ObsidianDocumentPreview
} from '../../notes/document-markdown.ts';
import { extractBoundedDocumentArchive } from '../../notes/obsidian-archive.ts';

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
	const converted = convertWordFootnotes(result.value);
	const markdown = documentHtmlToMarkdown(converted.html);
	return {
		...base,
		markdown,
		...documentMarkdownToHtml(markdown),
		sourceFilename: filename.normalize('NFC').trim(),
		warnings: [
			'Word layout, images, attachments and comments are not imported.',
			...converted.warnings
		]
	};
}

type WordHtmlElement = {
	name: string;
	attributes: Record<string, string>;
	children: Array<WordHtmlElement | string>;
};

/** Mammoth's paired anchors must be resolved before the document allow-list removes their IDs. */
function convertWordFootnotes(html: string): { html: string; warnings: string[] } {
	if (!/#(?:footnote|endnote)-\d+/.test(html)) return { html, warnings: [] };
	const root: WordHtmlElement = { name: 'root', attributes: {}, children: [] };
	const stack = [root];
	try {
		const parser = new SaxesParser();
		parser.on('opentag', (tag) => {
			const node: WordHtmlElement = { name: tag.name, attributes: tag.attributes, children: [] };
			stack.at(-1)!.children.push(node);
			stack.push(node);
		});
		parser.on('text', (text) => stack.at(-1)!.children.push(text));
		parser.on('closetag', () => {
			stack.pop();
		});
		parser
			.write(
				`<document>${html.replace(/<(br|hr|img|input)\b([^>]*?)(?<!\/)\s*>/gi, '<$1$2/>')}</document>`
			)
			.close();
	} catch {
		return {
			html,
			warnings: [
				'Die Word-Fußnoten konnten nicht eindeutig gelesen werden und bleiben als Text erhalten.'
			]
		};
	}
	const elements: WordHtmlElement[] = [];
	const visit = (node: WordHtmlElement) => {
		elements.push(node);
		for (const child of node.children) if (typeof child !== 'string') visit(child);
	};
	visit(root);
	const text = (node: WordHtmlElement): string =>
		node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');
	const escape = (value: string) =>
		value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;');
	const serialise = (node: WordHtmlElement | string): string => {
		if (typeof node === 'string') return escape(node);
		const attributes = Object.entries(node.attributes)
			.map(([name, value]) => ` ${name}="${escape(value)}"`)
			.join('');
		if (['br', 'hr', 'img', 'input'].includes(node.name)) return `<${node.name}${attributes}>`;
		return `<${node.name}${attributes}>${node.children.map(serialise).join('')}</${node.name}>`;
	};
	const refs = new Map<string, WordHtmlElement[]>();
	for (const node of elements) {
		if (node.name !== 'sup') continue;
		const anchors = node.children.filter(
			(child): child is WordHtmlElement => typeof child !== 'string'
		);
		const anchor = anchors.length === 1 ? anchors[0] : null;
		const id =
			anchor?.name === 'a'
				? /^#((?:footnote|endnote)-\d+)$/.exec(anchor.attributes.href ?? '')?.[1]
				: null;
		if (!id || !/^\[?\d+\]?$/.test(text(node).trim())) continue;
		refs.set(id, [...(refs.get(id) ?? []), node]);
	}
	const definitions = new Map<string, WordHtmlElement[]>();
	for (const node of elements) {
		const id = node.name === 'li' ? node.attributes.id : null;
		if (id && /^(?:footnote|endnote)-\d+$/.test(id))
			definitions.set(id, [...(definitions.get(id) ?? []), node]);
	}
	const removeBacklink = (node: WordHtmlElement, id: string): WordHtmlElement => ({
		...node,
		attributes: { ...node.attributes },
		children: node.children.flatMap<WordHtmlElement | string>((child) => {
			if (typeof child === 'string') return [child];
			if (
				child.name === 'a' &&
				child.attributes.href === `#${id.replace(/-(\d+)$/, '-ref-$1')}` &&
				text(child).trim() === '↑'
			)
				return [];
			const cleaned = removeBacklink(child, id);
			return cleaned.name === 'p' && !text(cleaned).trim() ? [] : [cleaned];
		})
	});
	const removed = new Set<WordHtmlElement>();
	const warnings: string[] = [];
	let number = 0;
	for (const [id, references] of refs) {
		const matches = definitions.get(id);
		if (!matches?.length) continue;
		const clean = matches.map((definition) => removeBacklink(definition, id));
		const bodies = clean.map((definition) => definition.children.map(serialise).join(''));
		if (new Set(bodies).size !== 1) {
			warnings.push(
				`Die Word-Fußnote „${id}“ enthält widersprüchliche Definitionen und bleibt als Text erhalten.`
			);
			continue;
		}
		number++;
		for (const reference of references) {
			reference.attributes = { 'data-footnote-ref': id };
			reference.children = [String(number)];
		}
		matches[0]!.attributes = { 'data-footnote-id': id };
		matches[0]!.children = clean[0]!.children;
		for (const duplicate of matches.slice(1)) removed.add(duplicate);
	}
	for (const node of elements) {
		node.children = node.children.filter(
			(child) => typeof child === 'string' || !removed.has(child)
		);
		if (
			node.name === 'ol' &&
			node.children.some(
				(child) => typeof child !== 'string' && child.attributes['data-footnote-id']
			)
		)
			node.attributes = { 'data-footnotes': 'true' };
	}
	const document = root.children[0] as WordHtmlElement;
	return { html: document.children.map(serialise).join(''), warnings };
}

export function decodeWordSource(source: string): Uint8Array {
	if (!source || source.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(source))
		throw new WordImportError();
	return Buffer.from(source, 'base64');
}
