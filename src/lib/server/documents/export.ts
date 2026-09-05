import {
	AlignmentType,
	Document as WordDocument,
	HeadingLevel,
	Packer,
	Paragraph,
	TextRun
} from 'docx';
import PDFDocument from 'pdfkit';
import { Lexer, type Token, type Tokens } from 'marked';
import { createRequire } from 'node:module';
import { formatPassage, passageFromDbEndpoints } from '$lib/bible/passage';
import { formatGermanCalendarDate } from '$lib/notes/calendar-date';
import {
	documentContentDisposition,
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

export type PdfInlineRun = { text: string; href?: string };

/** Turns portable inline Markdown into ordered text/link runs for PDFKit. */
export function pdfInlineRuns(markdown: string): PdfInlineRun[] {
	const runs: PdfInlineRun[] = [];
	const append = (text: string, href?: string) => {
		if (!text) return;
		const previous = runs.at(-1);
		if (previous && previous.href === href) previous.text += text;
		else runs.push({ text, ...(href ? { href } : {}) });
	};
	const visit = (tokens: Token[], inheritedHref?: string) => {
		for (const token of tokens) {
			switch (token.type) {
				case 'link': {
					const link = token as Tokens.Link;
					const href = safeLinkHref(link.href) ?? undefined;
					visit(link.tokens, href);
					break;
				}
				case 'text': {
					const text = token as Tokens.Text;
					if (text.tokens?.length) visit(text.tokens, inheritedHref);
					else append(text.text, inheritedHref);
					break;
				}
				case 'strong':
				case 'em':
				case 'del':
					visit((token as Tokens.Strong | Tokens.Em | Tokens.Del).tokens, inheritedHref);
					break;
				case 'escape':
				case 'codespan':
					append((token as Tokens.Escape | Tokens.Codespan).text, inheritedHref);
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
	visit(Lexer.lexInline(markdown, { gfm: true }));
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
		if (data.document.sermonSeries) lines.push(`Predigtreihe: ${data.document.sermonSeries}`);
		if (data.document.sermonDate)
			lines.push(`Geplanter Termin: ${formatGermanCalendarDate(data.document.sermonDate)}`);
		for (const delivery of data.deliveries) {
			lines.push(`Gehalten: ${formatGermanCalendarDate(delivery.date)} · ${delivery.location}`);
		}
	}
	return lines;
}

function markdownParagraphs(markdown: string): Paragraph[] {
	return markdown
		.replace(/\r\n?/gu, '\n')
		.split('\n')
		.map((line) => {
			const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
			if (heading) {
				return new Paragraph({
					text: heading[2],
					heading:
						heading[1]!.length === 1
							? HeadingLevel.HEADING_1
							: heading[1]!.length === 2
								? HeadingLevel.HEADING_2
								: HeadingLevel.HEADING_3
				});
			}
			const bullet = /^[-*+]\s+(.+)$/u.exec(line);
			if (bullet) return new Paragraph({ text: bullet[1], bullet: { level: 0 } });
			const numbered = /^\d+[.)]\s+(.+)$/u.exec(line);
			if (numbered)
				return new Paragraph({
					text: numbered[1],
					numbering: { reference: 'document-list', level: 0 }
				});
			const quote = /^>\s?(.*)$/u.exec(line);
			const text = (quote?.[1] ?? line).replace(/\*\*([^*]+)\*\*/gu, '$1').replace(/[*_`~]/gu, '');
			return new Paragraph({ text, ...(quote ? { indent: { left: 500 } } : {}) });
		});
}

export async function createDocxExport(data: OwnedDocumentExport): Promise<{
	filename: string;
	contentDisposition: string;
	buffer: Buffer;
}> {
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
		...markdownParagraphs(data.document.bodyMarkdown)
	];
	const file = new WordDocument({
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

	function writeInlineMarkdown(value: string, textOptions: PDFKit.Mixins.TextOptions = {}): void {
		const runs = pdfInlineRuns(value);
		if (runs.length === 0) {
			writeText('', textOptions);
			return;
		}
		for (const [index, run] of runs.entries()) {
			const linked = Boolean(run.href);
			pdf.fillColor(linked ? PDF_LINK_COLOR : '#222222');
			writeText(
				run.text,
				{
					...textOptions,
					link: run.href ? absoluteHref(run.href) : null,
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
				.text(data.document.kind === 'sermon' ? 'PREDIGT' : 'NOTIZ', margins.left + 55, 29, {
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
	for (const line of data.document.bodyMarkdown.replace(/\r\n?/gu, '\n').split('\n')) {
		const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
		if (heading) {
			pdf.moveDown(heading[1]!.length === 1 ? 0.9 : 0.55).fontSize(18 - heading[1]!.length * 2);
			writeInlineMarkdown(heading[2]!);
			pdf.moveDown(0.25).fontSize(11);
		} else if (/^\s*(?:---+|___+|\*\*\*+)\s*$/u.test(line)) {
			pdf.moveDown(0.45);
			pdf
				.moveTo(pdf.x, pdf.y)
				.lineTo(pdf.page.width - pdf.page.margins.right, pdf.y)
				.lineWidth(0.5)
				.strokeColor('#bbbbbb')
				.stroke();
			pdf.moveDown(0.45);
		} else {
			const bullet = /^\s*[-*+]\s+(.+)$/u.exec(line);
			const numbered = /^\s*(\d+[.)])\s+(.+)$/u.exec(line);
			const quote = /^>\s?(.*)$/u.exec(line);
			const body = bullet?.[1] ?? numbered?.[2] ?? quote?.[1] ?? line;
			const prefix = bullet ? '• ' : numbered ? `${numbered[1]} ` : '';
			if (prefix) writeText(prefix, {}, true);
			writeInlineMarkdown(body, {
				paragraphGap: line ? 2 : 5,
				...(quote ? { indent: 14 } : {})
			});
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
