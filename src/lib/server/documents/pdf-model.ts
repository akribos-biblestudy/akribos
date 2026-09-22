import { type Token, type Tokens } from 'marked';
import { findBibleReferences } from '$lib/bible/link-references';
import { decodeHtmlEntities, safeLinkHref } from '$lib/notes/document-markdown';
import {
	createDocumentFootnoteLexer,
	parseDocumentFootnotes,
	type DocumentFootnote,
	type DocumentFootnoteReferenceToken
} from '$lib/notes/document-footnotes';
import { MAX_DOCUMENT_MARKDOWN_BYTES } from '$lib/notes/documents';

export class PdfExportError extends Error {
	readonly status: 413 | 422 | 503 | 504;
	constructor(status: 413 | 422 | 503 | 504, message: string) {
		super(message);
		this.status = status;
		this.name = 'PdfExportError';
	}
}

type TextStyle = {
	bold?: boolean;
	italic?: boolean;
	strike?: boolean;
	code?: boolean;
	underline?: boolean;
	highlight?: boolean;
};
export type PdfInlineRun = TextStyle & {
	text: string;
	href?: string;
	bibleReference?: boolean;
	footnoteId?: string;
	footnoteNumber?: number;
	repeat?: boolean;
	language?: 'he';
};
export type PdfBlock =
	| { kind: 'paragraph' | 'heading'; runs: PdfInlineRun[]; level?: number }
	| { kind: 'quote'; blocks: PdfBlock[] }
	| {
			kind: 'list';
			ordered: boolean;
			start: number;
			items: { blocks: PdfBlock[]; checked?: boolean }[];
	  }
	| { kind: 'table'; headers: PdfInlineRun[][]; rows: PdfInlineRun[][][]; align: (string | null)[] }
	| { kind: 'code'; text: string }
	| { kind: 'rule' };
export type PdfDocumentModel = {
	title: string;
	metadata: PdfInlineRun[][];
	blocks: PdfBlock[];
	footnotes: { number: number; blocks: PdfBlock[] }[];
	orphans: { number: number; blocks: PdfBlock[] }[];
};

/** Links become annotations only. Typst never fetches their destinations. */
function absoluteLink(href: string | undefined, baseUrl: string): string | undefined {
	const safe = href && safeLinkHref(href);
	if (!safe) return undefined;
	try {
		return new URL(safe, baseUrl).href;
	} catch {
		return undefined;
	}
}

/** Preserve inline semantics as data, never interpolate document text into executable Typst. */
export function pdfInlineRuns(
	markdown: string,
	footnotes: readonly DocumentFootnote[] = [],
	baseUrl = 'https://akribos.de',
	referenced = new Set<string>(),
	tokens?: Token[]
): PdfInlineRun[] {
	const runs: PdfInlineRun[] = [];
	let underlineDepth = 0;
	let highlightDepth = 0;
	const checkRuns = () => {
		if (runs.length >= 50_000)
			throw new PdfExportError(413, 'Das Dokument ist für den PDF-Export zu komplex.');
	};
	const append = (text: string, style: TextStyle, href?: string, bibleReference = false) => {
		if (!text) return;
		// Direction is explicit for Hebrew runs, including niqqud/cantillation; Greek remains in
		// Akribos Text. Spaces within a Hebrew phrase belong to the same bidi run.
		for (const part of text.split(
			/([\u0590-\u05ff\ufb1d-\ufb4f]+(?:[ \t]+[\u0590-\u05ff\ufb1d-\ufb4f]+)*)/u
		)) {
			if (!part) continue;
			checkRuns();
			runs.push({
				text: part,
				...style,
				...(underlineDepth ? { underline: true } : {}),
				...(highlightDepth ? { highlight: true } : {}),
				...(href ? { href } : {}),
				...(bibleReference ? { bibleReference } : {}),
				...(/^[\u0590-\u05ff\ufb1d-\ufb4f]/u.test(part) ? { language: 'he' as const } : {})
			});
		}
	};
	const prose = (text: string, style: TextStyle, href?: string) => {
		if (href || style.code) return append(text, style, href);
		let offset = 0;
		for (const reference of findBibleReferences(text)) {
			append(text.slice(offset, reference.from), style);
			append(reference.label, style, absoluteLink(reference.href, baseUrl), true);
			offset = reference.to;
		}
		append(text.slice(offset), style);
	};
	const visit = (tokens: Token[], style: TextStyle = {}, href?: string, depth = 0) => {
		if (depth > 64 || runs.length > 50_000)
			throw new PdfExportError(413, 'Das Dokument ist für den PDF-Export zu komplex.');
		for (const token of tokens) {
			switch (token.type) {
				case 'documentFootnoteReference': {
					const note = token as DocumentFootnoteReferenceToken;
					checkRuns();
					runs.push({
						text: `[${note.number}]`,
						footnoteId: note.id,
						footnoteNumber: note.number,
						...(referenced.has(note.id) ? { repeat: true } : {})
					});
					referenced.add(note.id);
					break;
				}
				case 'strong':
				case 'em':
				case 'del':
					visit(
						(token as Tokens.Strong).tokens,
						{
							...style,
							[token.type === 'strong' ? 'bold' : token.type === 'em' ? 'italic' : 'strike']: true
						},
						href,
						depth + 1
					);
					break;
				case 'link':
					visit(
						(token as Tokens.Link).tokens,
						style,
						absoluteLink((token as Tokens.Link).href, baseUrl),
						depth + 1
					);
					break;
				case 'codespan':
					append((token as Tokens.Codespan).text, { ...style, code: true }, href);
					break;
				case 'text': {
					const value = token as Tokens.Text;
					if (value.tokens) visit(value.tokens, style, href, depth + 1);
					else prose(decodeHtmlEntities(value.text), style, href);
					break;
				}
				case 'escape':
					prose((token as Tokens.Escape).text, style, href);
					break;
				case 'br':
					append('\n', style, href);
					break;
				case 'image':
					append((token as Tokens.Image).text, style, href);
					break;
				case 'html': {
					// Only attribute-free editor formatting and hard breaks are portable.
					const tag = (token as Tokens.Tag).text.toLowerCase();
					if (/^<br\s*\/?\s*>$/u.test(tag)) append('\n', style, href);
					if (tag === '<u>') underlineDepth += 1;
					if (tag === '</u>') underlineDepth = Math.max(0, underlineDepth - 1);
					if (tag === '<mark>') highlightDepth += 1;
					if (tag === '</mark>') highlightDepth = Math.max(0, highlightDepth - 1);
					break;
				}
				default:
					if ('tokens' in token && Array.isArray(token.tokens))
						visit(token.tokens, style, href, depth + 1);
			}
		}
	};
	visit(tokens ?? createDocumentFootnoteLexer(footnotes).lexInline(markdown));
	return runs;
}

export function createPdfModel(
	title: string,
	markdown: string,
	metadata: string[],
	baseUrl?: string
): PdfDocumentModel {
	if (Buffer.byteLength(markdown, 'utf8') > MAX_DOCUMENT_MARKDOWN_BYTES)
		throw new PdfExportError(413, 'Das Dokument ist für den PDF-Export zu groß.');
	const parsed = parseDocumentFootnotes(markdown);
	const referenced = new Set<string>();
	let blockCount = 0;
	const blocks = (
		tokens: Token[],
		definitions: readonly DocumentFootnote[],
		depth = 0
	): PdfBlock[] => {
		if (depth > 32)
			throw new PdfExportError(413, 'Das Dokument ist für den PDF-Export zu tief verschachtelt.');
		const result: PdfBlock[] = [];
		const inline = (text: string, tokens?: Token[]) =>
			pdfInlineRuns(text, definitions, baseUrl, referenced, tokens);
		for (const token of tokens) {
			if (++blockCount > 20_000)
				throw new PdfExportError(413, 'Das Dokument ist für den PDF-Export zu komplex.');
			switch (token.type) {
				case 'paragraph':
				case 'text':
					result.push({
						kind: 'paragraph',
						runs: inline((token as Tokens.Paragraph).text, (token as Tokens.Paragraph).tokens)
					});
					break;
				case 'heading':
					result.push({
						kind: 'heading',
						level: (token as Tokens.Heading).depth,
						runs: inline((token as Tokens.Heading).text, (token as Tokens.Heading).tokens)
					});
					break;
				case 'blockquote':
					result.push({
						kind: 'quote',
						blocks: blocks((token as Tokens.Blockquote).tokens, definitions, depth + 1)
					});
					break;
				case 'code':
					result.push({ kind: 'code', text: (token as Tokens.Code).text });
					break;
				case 'hr':
					result.push({ kind: 'rule' });
					break;
				case 'list': {
					const list = token as Tokens.List;
					result.push({
						kind: 'list',
						ordered: list.ordered,
						start: Number(list.start) || 1,
						items: list.items.map((item) => {
							const content = blocks(item.tokens, definitions, depth + 1);
							if (item.task) {
								const first = content[0];
								const marker = { text: item.checked ? '[x] ' : '[ ] ' };
								if (first?.kind === 'paragraph') first.runs.unshift(marker);
								else content.unshift({ kind: 'paragraph', runs: [marker] });
							}
							return { blocks: content, ...(item.task ? { checked: item.checked === true } : {}) };
						})
					});
					break;
				}
				case 'table': {
					const table = token as Tokens.Table;
					result.push({
						kind: 'table',
						headers: table.header.map((cell) => inline(cell.text, cell.tokens)),
						rows: table.rows.map((row) => row.map((cell) => inline(cell.text, cell.tokens))),
						align: table.align
					});
					break;
				}
				case 'checkbox': // The task marker is prepended once to the first real paragraph.
				case 'space':
				case 'def':
				case 'html':
					break;
				default:
					if ('raw' in token && token.raw)
						result.push({ kind: 'paragraph', runs: [{ text: token.raw }] });
			}
		}
		return result;
	};
	// Full-document lexing resolves Markdown reference links before the block adapter sees them.
	const body = blocks(
		createDocumentFootnoteLexer(parsed.footnotes).lex(parsed.bodyMarkdown),
		parsed.footnotes
	);
	const footnotes: PdfDocumentModel['footnotes'] = [];
	const orphans: PdfDocumentModel['orphans'] = [];
	for (const note of parsed.footnotes) {
		const entry = {
			number: note.number,
			blocks: blocks(createDocumentFootnoteLexer([]).lex(note.markdown), [])
		};
		(referenced.has(note.id) ? footnotes : orphans).push(entry);
	}
	return {
		title,
		metadata: metadata.map((line) => pdfInlineRuns(line, [], baseUrl)),
		blocks: body,
		footnotes,
		orphans
	};
}
