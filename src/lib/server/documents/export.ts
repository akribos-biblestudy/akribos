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
	TextRun,
	Table,
	TableCell,
	TableRow,
	WidthType
} from 'docx';
import { type Token, type Tokens } from 'marked';
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

export { pdfInlineRuns } from './pdf-model';
import { createPdfModel } from './pdf-model';
import { renderPdf } from './pdf-renderer';

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

type MarkdownExportBlock = { indent: number; prefix?: string } & (
	| { kind: 'table'; table: Tokens.Table }
	| { kind: 'text' | 'code' | 'rule'; text: string; tokens?: Token[]; heading?: number }
);

/** Parse block structure once so literal code is never interpreted as prose or inline Markdown. */
function markdownExportBlocks(
	markdown: string,
	definitions: readonly DocumentFootnote[] = []
): MarkdownExportBlock[] {
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
						tokens: (token as Tokens.Heading).tokens,
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
					blocks.push({ kind: 'table', table: token as Tokens.Table, indent });
					break;
				}
				case 'paragraph':
				case 'text':
					blocks.push({
						kind: 'text',
						text: (token as Tokens.Paragraph | Tokens.Text).text,
						tokens: (token as Tokens.Paragraph | Tokens.Text).tokens,
						indent
					});
					break;
			}
		}
	};
	visit(createDocumentFootnoteLexer(definitions).lex(markdown));
	return blocks;
}

type WordFootnoteContext = {
	definitions: readonly DocumentFootnote[];
	referenced: Set<string>;
};

function wordInlineRuns(
	markdown: string,
	baseUrl: string,
	footnotes?: WordFootnoteContext,
	initialStyle: IRunStylePropertiesOptions = {},
	tokens?: Token[]
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
				case 'html':
					if (/^<br\s*\/?\s*>$/iu.test((token as Tokens.Tag).text)) append('', style, href, true);
					break;
				case 'image':
					append((token as Tokens.Image).text, style, href);
					break;
			}
		}
	};
	visit(
		tokens ?? createDocumentFootnoteLexer(footnotes?.definitions ?? []).lexInline(markdown),
		initialStyle
	);
	return runs;
}

function markdownWordBlocks(
	markdown: string,
	baseUrl: string,
	footnotes?: WordFootnoteContext
): Array<Paragraph | Table> {
	const headings = [
		HeadingLevel.HEADING_1,
		HeadingLevel.HEADING_2,
		HeadingLevel.HEADING_3,
		HeadingLevel.HEADING_4,
		HeadingLevel.HEADING_5,
		HeadingLevel.HEADING_6
	];
	return markdownExportBlocks(markdown, footnotes?.definitions).flatMap(
		(block): Array<Paragraph | Table> => {
			if (block.kind === 'table') {
				const { table } = block;
				return [
					...(block.prefix
						? [new Paragraph({ text: block.prefix.trim(), indent: { left: block.indent * 360 } })]
						: []),
					new Table({
						width: { size: 100, type: WidthType.PERCENTAGE },
						...(block.indent ? { indent: { size: block.indent * 360, type: WidthType.DXA } } : {}),
						rows: [table.header, ...table.rows].map(
							(row, rowIndex) =>
								new TableRow({
									tableHeader: rowIndex === 0,
									children: row.map(
										(cell, column) =>
											new TableCell({
												...(rowIndex === 0 ? { shading: { fill: 'EAF2EA' } } : {}),
												children: [
													new Paragraph({
														children: wordInlineRuns(
															cell.text,
															baseUrl,
															footnotes,
															{ bold: rowIndex === 0 },
															cell.tokens
														),
														alignment:
															table.align[column] === 'center'
																? AlignmentType.CENTER
																: table.align[column] === 'right'
																	? AlignmentType.RIGHT
																	: AlignmentType.LEFT,
														spacing: { after: 80 }
													})
												]
											})
									)
								})
						)
					})
				];
			}
			return [
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
										...wordInlineRuns(block.text, baseUrl, footnotes, {}, block.tokens)
									],
					...(block.heading ? { heading: headings[block.heading - 1] } : {}),
					...(block.indent ? { indent: { left: block.indent * 360 } } : {}),
					spacing: { after: 120 }
				})
			];
		}
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
		...markdownWordBlocks(parsed.bodyMarkdown, baseUrl, footnotes)
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
			children.push(...markdownWordBlocks(note.markdown, baseUrl));
		}
	}
	const file = new WordDocument({
		footnotes: Object.fromEntries(
			parsed.footnotes
				.filter((note) => footnotes.referenced.has(note.id))
				.map((note) => {
					const blocks = markdownWordBlocks(note.markdown, baseUrl);
					// docx 9 adds the reference run to the first child, which must be a paragraph.
					if (!(blocks[0] instanceof Paragraph)) blocks.unshift(new Paragraph(''));
					// OOXML permits block-level tables in footnotes. The library serializes subsequent
					// blocks unchanged but types this collection too narrowly as Paragraph[]. The native
					// archive/import regression covers this deliberately localized compatibility boundary.
					return [note.number, { children: blocks as Paragraph[] }];
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
	options: { baseUrl?: string; signal?: AbortSignal } = {}
): Promise<{ filename: string; contentDisposition: string; buffer: Buffer }> {
	const model = createPdfModel(
		data.document.title,
		data.document.bodyMarkdown,
		metadataLines(data),
		options.baseUrl
	);
	const buffer = await renderPdf(model, options.signal);
	const filename = safeDocumentFilename(data.document.title, 'pdf');
	return { filename, contentDisposition: documentContentDisposition(filename, 'pdf'), buffer };
}
