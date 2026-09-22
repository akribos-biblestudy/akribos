import { sermonFormatLabel } from '$lib/notes/documents';
import {
	AlignmentType,
	Document as WordDocument,
	HeadingLevel,
	ExternalHyperlink,
	FootnoteReferenceRun,
	type IRunStylePropertiesOptions,
	Packer,
	Paragraph,
	TextRun
} from 'docx';
import PDFDocument from 'pdfkit';
import { Lexer, type Token, type Tokens } from 'marked';
import { createRequire } from 'node:module';
import { findBibleReferences } from '$lib/bible/link-references';
import { formatPassage, passageFromDbEndpoints } from '$lib/bible/passage';
import { formatGermanCalendarDate } from '$lib/notes/calendar-date';
import {
	createDocumentFootnoteLexer,
	parseDocumentFootnotes,
	type DocumentFootnote,
	type DocumentFootnoteReferenceToken
} from '$lib/notes/document-footnotes';
import {
	documentContentDisposition,
	decodeHtmlEntities,
	safeLinkHref,
	safeDocumentFilename,
	type DocumentMarkdownPassage
} from '$lib/notes/document-markdown';
import type { Database } from '$lib/server/db/client';
import { listDocumentTags } from '$lib/server/repositories/document-tags';
import { getDocument, listDocumentPassages } from '$lib/server/repositories/documents';
import { listSermonDeliveries } from '$lib/server/repositories/sermon-deliveries';

export type OwnedDocumentExport = {
	document: NonNullable<Awaited<ReturnType<typeof getDocument>>>;
	tags: string[];
	passages: DocumentMarkdownPassage[];
	deliveries: Array<{ date: Date; location: string }>;
};

export const PDF_LINK_COLOR = '#2f7d32';

export type PdfInlineRun = {
	text: string;
	href?: string;
	bibleReference?: boolean;
	footnoteId?: string;
};

/** Turns portable inline Markdown into ordered text/link runs for PDFKit. */
export function pdfInlineRuns(
	markdown: string,
	footnotes: readonly DocumentFootnote[] = []
): PdfInlineRun[] {
	const runs: PdfInlineRun[] = [];
	const append = (text: string, href?: string, bibleReference = false) => {
		if (!text) return;
		const previous = runs.at(-1);
		if (
			previous &&
			!previous.footnoteId &&
			previous.href === href &&
			Boolean(previous.bibleReference) === bibleReference
		) {
			previous.text += text;
		} else {
			runs.push({ text, ...(href ? { href } : {}), ...(bibleReference ? { bibleReference } : {}) });
		}
	};
	const appendProse = (text: string, href?: string) => {
		if (href) {
			append(text, href);
			return;
		}
		let offset = 0;
		for (const reference of findBibleReferences(text)) {
			append(text.slice(offset, reference.from));
			append(reference.label, undefined, true);
			offset = reference.to;
		}
		append(text.slice(offset));
	};
	const visit = (tokens: Token[], inheritedHref?: string) => {
		for (const token of tokens) {
			switch (token.type) {
				case 'documentFootnoteReference': {
					const reference = token as DocumentFootnoteReferenceToken;
					runs.push({ text: `[${reference.number}]`, footnoteId: reference.id });
					break;
				}
				case 'link': {
					const link = token as Tokens.Link;
					const href = safeLinkHref(link.href) ?? undefined;
					visit(link.tokens, href);
					break;
				}
				case 'text': {
					const text = token as Tokens.Text;
					if (text.tokens?.length) visit(text.tokens, inheritedHref);
					else appendProse(decodeHtmlEntities(text.text), inheritedHref);
					break;
				}
				case 'strong':
				case 'em':
				case 'del':
					visit((token as Tokens.Strong | Tokens.Em | Tokens.Del).tokens, inheritedHref);
					break;
				case 'escape':
					appendProse((token as Tokens.Escape).text, inheritedHref);
					break;
				case 'codespan':
					append((token as Tokens.Codespan).text, inheritedHref);
					break;
				case 'br':
					append('\n', inheritedHref);
					break;
				case 'image':
					append((token as Tokens.Image).text, inheritedHref);
					break;
				case 'html':
					break;
				default:
					if ('tokens' in token && Array.isArray(token.tokens)) {
						visit(token.tokens, inheritedHref);
					}
			}
		}
	};
	visit(createDocumentFootnoteLexer(footnotes).lexInline(markdown));
	return runs;
}

export async function loadOwnedDocumentExport(
	db: Database,
	userId: string,
	documentId: string
): Promise<OwnedDocumentExport | null> {
	const document = await getDocument(db, userId, documentId);
	if (!document) return null;
	const [passageRows, tagRows, deliveries] = await Promise.all([
		listDocumentPassages(db, userId, documentId),
		listDocumentTags(db, userId, documentId),
		document.kind === 'sermon' ? listSermonDeliveries(db, userId, documentId) : []
	]);
	const passages = passageRows.map((row) => {
		const passage = passageFromDbEndpoints(row);
		const reference = passage && formatPassage(passage);
		if (!reference) throw new Error('stored document passage is invalid');
		return { reference, ...(row.resourceId ? { resourceId: row.resourceId } : {}) };
	});
	return {
		document,
		tags: tagRows.map((tag) => tag.path),
		passages,
		deliveries: deliveries.map((delivery) => ({ date: delivery.date, location: delivery.location }))
	};
}

function metadataLines(data: OwnedDocumentExport): string[] {
	const lines: string[] = [];
	if (data.passages.length)
		lines.push(`Bibelstellen: ${data.passages.map((item) => item.reference).join(', ')}`);
	if (data.tags.length) lines.push(`Schlagwörter: ${data.tags.join(', ')}`);
	if (data.document.kind === 'sermon') {
		lines.push(`Format: ${sermonFormatLabel(data.document.sermonFormat)}`);
		if (data.document.sermonSeries) lines.push(`Reihe: ${data.document.sermonSeries}`);
		if (data.document.sermonDate)
			lines.push(`Geplanter Termin: ${formatGermanCalendarDate(data.document.sermonDate)}`);
		for (const delivery of data.deliveries) {
			lines.push(`Gehalten: ${formatGermanCalendarDate(delivery.date)} · ${delivery.location}`);
		}
	}
	return lines;
}

type MarkdownExportBlock = {
	kind: 'text' | 'code' | 'rule';
	text: string;
	heading?: number;
	indent: number;
	prefix?: string;
};

/** Parse block structure once so literal code is never interpreted as prose or inline Markdown. */
function markdownExportBlocks(markdown: string): MarkdownExportBlock[] {
	const blocks: MarkdownExportBlock[] = [];
	const visit = (tokens: Token[], indent = 0) => {
		for (const token of tokens) {
			switch (token.type) {
				case 'space':
					break;
				case 'code':
					blocks.push({ kind: 'code', text: (token as Tokens.Code).text, indent });
					break;
				case 'hr':
					blocks.push({ kind: 'rule', text: '', indent });
					break;
				case 'heading':
					blocks.push({
						kind: 'text',
						text: (token as Tokens.Heading).text,
						heading: (token as Tokens.Heading).depth,
						indent
					});
					break;
				case 'blockquote':
					visit((token as Tokens.Blockquote).tokens, indent + 1);
					break;
				case 'list': {
					const list = token as Tokens.List;
					for (const [index, item] of list.items.entries()) {
						const start = blocks.length;
						visit(item.tokens, indent + 1);
						if (blocks[start])
							blocks[start].prefix = item.task
								? item.checked
									? '[x] '
									: '[ ] '
								: list.ordered
									? `${Number(list.start) + index}. `
									: '• ';
					}
					break;
				}
				case 'table': {
					const table = token as Tokens.Table;
					for (const row of [table.header, ...table.rows])
						blocks.push({ kind: 'text', text: row.map((cell) => cell.text).join(' | '), indent });
					break;
				}
				case 'paragraph':
				case 'text':
					blocks.push({
						kind: 'text',
						text: (token as Tokens.Paragraph | Tokens.Text).text,
						indent
					});
					break;
			}
		}
	};
	visit(Lexer.lex(markdown, { gfm: true }));
	return blocks;
}

type WordFootnoteContext = {
	definitions: readonly DocumentFootnote[];
	referenced: Set<string>;
};

function wordInlineRuns(
	markdown: string,
	baseUrl: string,
	footnotes?: WordFootnoteContext
): Array<TextRun | ExternalHyperlink | FootnoteReferenceRun> {
	const runs: Array<TextRun | ExternalHyperlink | FootnoteReferenceRun> = [];
	const append = (
		text: string,
		style: IRunStylePropertiesOptions,
		href?: string,
		lineBreak = false
	) => {
		const run = new TextRun({ text, ...style, ...(lineBreak ? { break: 1 } : {}) });
		runs.push(
			href
				? new ExternalHyperlink({
						link: href.startsWith('/') || href.startsWith('#') ? new URL(href, baseUrl).href : href,
						children: [run]
					})
				: run
		);
	};
	const visit = (tokens: Token[], style: IRunStylePropertiesOptions = {}, href?: string) => {
		for (const token of tokens) {
			switch (token.type) {
				case 'documentFootnoteReference': {
					const reference = token as DocumentFootnoteReferenceToken;
					footnotes?.referenced.add(reference.id);
					runs.push(new FootnoteReferenceRun(reference.number));
					break;
				}
				case 'link': {
					const link = token as Tokens.Link;
					visit(link.tokens, style, safeLinkHref(link.href) ?? undefined);
					break;
				}
				case 'strong':
					visit((token as Tokens.Strong).tokens, { ...style, bold: true }, href);
					break;
				case 'em':
					visit((token as Tokens.Em).tokens, { ...style, italics: true }, href);
					break;
				case 'del':
					visit((token as Tokens.Del).tokens, { ...style, strike: true }, href);
					break;
				case 'text': {
					const text = token as Tokens.Text;
					if (text.tokens?.length) visit(text.tokens, style, href);
					else append(decodeHtmlEntities(text.text).replace(/\n/gu, ' '), style, href);
					break;
				}
				case 'escape':
					append((token as Tokens.Escape).text, style, href);
					break;
				case 'codespan':
					append((token as Tokens.Codespan).text, { ...style, font: 'Courier New' }, href);
					break;
				case 'br':
					append('', style, href, true);
					break;
				case 'image':
					append((token as Tokens.Image).text, style, href);
					break;
			}
		}
	};
	visit(createDocumentFootnoteLexer(footnotes?.definitions ?? []).lexInline(markdown));
	return runs;
}

function markdownParagraphs(
	markdown: string,
	baseUrl: string,
	footnotes?: WordFootnoteContext
): Paragraph[] {
	const headings = [
		HeadingLevel.HEADING_1,
		HeadingLevel.HEADING_2,
		HeadingLevel.HEADING_3,
		HeadingLevel.HEADING_4,
		HeadingLevel.HEADING_5,
		HeadingLevel.HEADING_6
	];
	return markdownExportBlocks(markdown).map(
		(block) =>
			new Paragraph({
				children:
					block.kind === 'code'
						? block.text
								.split('\n')
								.map(
									(text, index) =>
										new TextRun({ text, font: 'Courier New', ...(index ? { break: 1 } : {}) })
								)
						: block.kind === 'rule'
							? [new TextRun('────────')]
							: [
									...(block.prefix ? [new TextRun(block.prefix)] : []),
									...wordInlineRuns(block.text, baseUrl, footnotes)
								],
				...(block.heading ? { heading: headings[block.heading - 1] } : {}),
				...(block.indent ? { indent: { left: block.indent * 360 } } : {}),
				spacing: { after: 120 }
			})
	);
}

export async function createDocxExport(
	data: OwnedDocumentExport,
	options: { baseUrl?: string } = {}
): Promise<{
	filename: string;
	contentDisposition: string;
	buffer: Buffer;
}> {
	const parsed = parseDocumentFootnotes(data.document.bodyMarkdown);
	const baseUrl = options.baseUrl ?? 'https://akribos.de';
	const footnotes: WordFootnoteContext = { definitions: parsed.footnotes, referenced: new Set() };
	const children = [
		new Paragraph({
			children: [new TextRun({ text: data.document.title, bold: true, size: 36 })],
			alignment: AlignmentType.START,
			spacing: { after: 240 }
		}),
		...metadataLines(data).map(
			(line) =>
				new Paragraph({ children: [new TextRun({ text: line, color: '666666', size: 18 })] })
		),
		new Paragraph({ text: '' }),
		...markdownParagraphs(parsed.bodyMarkdown, baseUrl, footnotes)
	];
	const orphaned = parsed.footnotes.filter((note) => !footnotes.referenced.has(note.id));
	if (orphaned.length) {
		// Word does not display a native footnote that has no reference in the document body.
		// Preserve these imported definitions visibly instead of leaving them hidden in the archive.
		children.push(
			new Paragraph({ text: 'Fußnoten ohne Verweis', heading: HeadingLevel.HEADING_2 })
		);
		for (const note of orphaned) {
			children.push(new Paragraph({ text: `Fußnote ${note.number}` }));
			children.push(...markdownParagraphs(note.markdown, baseUrl));
		}
	}
	const file = new WordDocument({
		footnotes: Object.fromEntries(
			parsed.footnotes
				.filter((note) => footnotes.referenced.has(note.id))
				.map((note) => {
					const paragraphs = markdownParagraphs(note.markdown, baseUrl);
					// An empty editable note still needs a paragraph for Word's reference mark.
					return [note.number, { children: paragraphs.length ? paragraphs : [new Paragraph('')] }];
				})
		),
		numbering: {
			config: [
				{
					reference: 'document-list',
					levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }]
				}
			]
		},
		sections: [{ children }]
	});
	const filename = safeDocumentFilename(data.document.title, 'docx');
	return {
		filename,
		contentDisposition: documentContentDisposition(filename, 'docx'),
		buffer: await Packer.toBuffer(file)
	};
}

export async function createPdfExport(
	data: OwnedDocumentExport,
	options: { baseUrl?: string; compress?: boolean } = {}
): Promise<{
	filename: string;
	contentDisposition: string;
	buffer: Buffer;
}> {
	const parsed = parseDocumentFootnotes(data.document.bodyMarkdown);
	const pdf = new PDFDocument({
		size: 'A4',
		margins: { top: 68, right: 56, bottom: 68, left: 56 },
		bufferPages: true,
		compress: options.compress ?? true,
		info: { Title: data.document.title, Creator: 'Akribos' }
	});
	const chunks: Buffer[] = [];
	pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
	const completed = new Promise<Buffer>((resolve, reject) => {
		pdf.on('end', () => resolve(Buffer.concat(chunks)));
		pdf.on('error', reject);
	});
	const require = createRequire(import.meta.url);
	const fonts = {
		latin: require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
		latinExt: require.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'),
		greek: require.resolve('@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff'),
		greekExt: require.resolve('@fontsource/noto-sans/files/noto-sans-greek-ext-400-normal.woff'),
		hebrew:
			require.resolve('@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-400-normal.woff')
	} as const;
	for (const [name, path] of Object.entries(fonts)) pdf.registerFont(name, path);

	function fontForCharacter(character: string): keyof typeof fonts {
		const code = character.codePointAt(0) ?? 0;
		if ((code >= 0x0590 && code <= 0x05ff) || (code >= 0xfb1d && code <= 0xfb4f)) {
			return 'hebrew';
		}
		if (code >= 0x1f00 && code <= 0x1fff) return 'greekExt';
		if (code >= 0x0370 && code <= 0x03ff) return 'greek';
		if ((code >= 0x0100 && code <= 0x024f) || (code >= 0x1e00 && code <= 0x1eff)) {
			return 'latinExt';
		}
		return 'latin';
	}

	function fontRuns(text: string): Array<{ font: keyof typeof fonts; text: string }> {
		const runs: Array<{ font: keyof typeof fonts; text: string }> = [];
		for (const character of text) {
			const font = fontForCharacter(character);
			const previous = runs.at(-1);
			if (previous?.font === font) previous.text += character;
			else runs.push({ font, text: character });
		}
		return runs;
	}

	function writeText(
		text: string,
		options: PDFKit.Mixins.TextOptions = {},
		continuedAfter = false
	): void {
		const runs = fontRuns(text);
		if (runs.length === 0) {
			pdf.font('latin').text('', { ...options, continued: continuedAfter });
			return;
		}
		for (const [index, run] of runs.entries()) {
			pdf
				.font(run.font)
				.text(run.text, { ...options, continued: index < runs.length - 1 || continuedAfter });
		}
	}

	function absoluteHref(href: string): string {
		if (!href.startsWith('/') && !href.startsWith('#')) return href;
		return new URL(href, options.baseUrl ?? 'https://akribos.de').href;
	}

	function writeInlineMarkdown(
		value: string,
		textOptions: PDFKit.Mixins.TextOptions = {},
		footnotes: readonly DocumentFootnote[] = []
	): void {
		const runs = pdfInlineRuns(value, footnotes);
		if (runs.length === 0) {
			writeText('', textOptions);
			return;
		}
		for (const [index, run] of runs.entries()) {
			const linked = Boolean(run.href || run.footnoteId);
			const highlighted = linked || Boolean(run.bibleReference);
			pdf.fillColor(highlighted ? PDF_LINK_COLOR : '#222222');
			writeText(
				run.text,
				{
					...textOptions,
					link: run.href ? absoluteHref(run.href) : null,
					goTo: run.footnoteId ? `akribos-footnote-${run.footnoteId}` : undefined,
					underline: linked
				},
				index < runs.length - 1
			);
		}
		pdf.fillColor('#222222');
	}

	function addPageFurniture(): void {
		const range = pdf.bufferedPageRange();
		for (let offset = 0; offset < range.count; offset += 1) {
			pdf.switchToPage(range.start + offset);
			const { width, height, margins } = pdf.page;
			const savedBottom = margins.bottom;
			margins.bottom = 0;
			pdf.save();
			pdf.font('Helvetica-Bold').fontSize(8).fillColor(PDF_LINK_COLOR);
			pdf.text('AKRIBOS', margins.left, 29, { lineBreak: false });
			pdf
				.fillColor('#777777')
				.text(data.document.kind === 'sermon' ? 'AUSARBEITUNG' : 'NOTIZ', margins.left + 55, 29, {
					lineBreak: false
				});
			pdf
				.moveTo(margins.left, 47)
				.lineTo(width - margins.right, 47)
				.lineWidth(0.6)
				.strokeColor(PDF_LINK_COLOR)
				.stroke();
			pdf
				.moveTo(margins.left, height - 45)
				.lineTo(width - margins.right, height - 45)
				.lineWidth(0.4)
				.strokeColor('#bbbbbb')
				.stroke();
			pdf.font('Helvetica').fontSize(8).fillColor('#777777');
			pdf.text('akribos.de', margins.left, height - 34, { lineBreak: false });
			pdf.text(`Seite ${offset + 1} / ${range.count}`, width - margins.right - 80, height - 34, {
				width: 80,
				align: 'right',
				lineBreak: false
			});
			pdf.restore();
			margins.bottom = savedBottom;
		}
	}

	pdf.font('latin').fontSize(22);
	writeText(data.document.title);
	pdf.moveDown(0.5).fontSize(9).fillColor('#666666');
	for (const line of metadataLines(data)) writeText(line);
	pdf.moveDown().fillColor('#222222').fontSize(11);
	function writeBlocks(markdown: string, footnotes: readonly DocumentFootnote[] = [], prefix = '') {
		for (const block of markdownExportBlocks(markdown)) {
			if (block.kind === 'code') {
				if (prefix) writeText(prefix);
				pdf.moveDown(0.3);
				writeText(block.text, { indent: 14 + block.indent * 14, paragraphGap: 5 });
				pdf.moveDown(0.3);
			} else if (block.kind === 'rule') {
				if (prefix) writeText(prefix);
				pdf.moveDown(0.45);
				pdf
					.moveTo(pdf.x, pdf.y)
					.lineTo(pdf.page.width - pdf.page.margins.right, pdf.y)
					.lineWidth(0.5)
					.strokeColor('#bbbbbb')
					.stroke();
				pdf.moveDown(0.45);
			} else {
				if (block.heading)
					pdf
						.moveDown(block.heading === 1 ? 0.9 : 0.55)
						.fontSize(Math.max(11, 18 - block.heading * 2));
				if (prefix || block.prefix) writeText(prefix + (block.prefix ?? ''), {}, true);
				writeInlineMarkdown(
					block.text,
					{
						paragraphGap: 5,
						...(block.indent ? { indent: block.indent * 14 } : {})
					},
					footnotes
				);
				if (block.heading) pdf.moveDown(0.25).fontSize(11);
			}
			prefix = '';
		}
		if (prefix) writeText(prefix);
	}
	writeBlocks(parsed.bodyMarkdown, parsed.footnotes);
	if (parsed.footnotes.length) {
		// A separate, linked section preserves rich multi-paragraph notes across PDF pagination.
		pdf.moveDown().fontSize(14);
		writeText('Fußnoten');
		pdf.moveDown(0.3).fontSize(11);
		for (const note of parsed.footnotes) {
			pdf.addNamedDestination(`akribos-footnote-${note.id}`, 'XYZ', pdf.x, pdf.y, null);
			writeBlocks(note.markdown, [], `${note.number}. `);
			pdf.moveDown(0.3);
		}
	}

	addPageFurniture();
	pdf.end();
	const filename = safeDocumentFilename(data.document.title, 'pdf');
	return {
		filename,
		contentDisposition: documentContentDisposition(filename, 'pdf'),
		buffer: await completed
	};
}
