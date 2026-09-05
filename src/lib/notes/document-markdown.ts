import { marked, Renderer, type Tokens } from 'marked';
import TurndownService from 'turndown';
import { parseDocument, stringify as stringifyYaml } from 'yaml';
import {
	bibleReferenceFromLinkText,
	findBibleReferences,
	rewriteBibleReferenceLinks,
	type BibleReferenceMatch
} from '../bible/link-references.ts';
import { MAX_PASSAGE_VERSE, passagePointKey } from '../bible/passage.ts';
import {
	MAX_DOCUMENT_MARKDOWN_BYTES,
	MAX_DOCUMENT_PASSAGES,
	MAX_OBSIDIAN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES,
	MAX_SERMON_DELIVERIES,
	MAX_SERMON_DELIVERY_LOCATION_LENGTH
} from './documents.ts';

export {
	MAX_DOCUMENT_MARKDOWN_BYTES,
	MAX_OBSIDIAN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES
} from './documents.ts';

export const DOCUMENT_MARKDOWN_KINDS = ['note', 'sermon'] as const;
export type DocumentMarkdownKind = (typeof DOCUMENT_MARKDOWN_KINDS)[number];

export const SERMON_MARKDOWN_STATUSES = [
	'idea',
	'research',
	'outline',
	'ready',
	'delivered'
] as const;
export type SermonMarkdownStatus = (typeof SERMON_MARKDOWN_STATUSES)[number];

export type DocumentMarkdownPassage = {
	reference: string;
	/** Resource ids are only candidates here. The importing server must still authorise them. */
	resourceId?: string;
};

export type DocumentMarkdownSermon = {
	status: SermonMarkdownStatus;
	date?: string;
	series?: string;
	deliveries?: Array<{ date: string; location: string }>;
};

export type ObsidianDocumentPreview = {
	title: string;
	kind: DocumentMarkdownKind;
	markdown: string;
	html: string;
	plainText: string;
	tags: string[];
	passages: DocumentMarkdownPassage[];
	sermon?: DocumentMarkdownSermon;
	warnings: string[];
	sourceFilename: string;
};

export type DocumentMarkdownExportInput = {
	title: string;
	kind: DocumentMarkdownKind;
	tags?: readonly string[];
	passages?: readonly DocumentMarkdownPassage[];
	sermon?: Partial<DocumentMarkdownSermon>;
	/** Prefer the original Markdown when it exists; HTML is the deliberately lossy fallback. */
	markdown?: string;
	html?: string;
	createdAt: Date | string;
	updatedAt: Date | string;
};

export type DocumentMarkdownExport = {
	filename: string;
	content: string;
	contentType: 'text/markdown; charset=utf-8';
	contentDisposition: string;
};

export type DocumentMarkdownErrorCode =
	| 'invalid_filename'
	| 'invalid_encoding'
	| 'binary_file'
	| 'file_too_large'
	| 'invalid_frontmatter'
	| 'invalid_export';

export class DocumentMarkdownError extends Error {
	readonly code: DocumentMarkdownErrorCode;

	constructor(code: DocumentMarkdownErrorCode, message: string) {
		super(message);
		this.name = 'DocumentMarkdownError';
		this.code = code;
	}
}

/**
 * Deliberate Markdown/HTML round-trip losses. Keeping this list exported lets an import/export UI
 * explain the boundary without duplicating its contract.
 */
export const MARKDOWN_ROUND_TRIP_LIMITATIONS = [
	'Raw HTML, media, embeds and attributes are removed.',
	'Table layout, ordered-list start numbers and link titles are not retained.',
	'Task checkboxes become ordinary readable text.',
	'Line endings and trailing whitespace are normalised.'
] as const;

const ALLOWED_HTML_TAGS = new Set([
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'u',
	'mark',
	'p',
	'strong',
	'em',
	's',
	'ul',
	'ol',
	'li',
	'blockquote',
	'code',
	'pre',
	'hr',
	'br',
	'a'
]);
const VOID_HTML_TAGS = new Set(['hr', 'br']);
const DANGEROUS_RAW_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math']);
const ATTACHMENT_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'svg',
	'pdf',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'ppt',
	'pptx',
	'zip',
	'mp3',
	'm4a',
	'wav',
	'ogg',
	'mp4',
	'mov',
	'webm'
]);

const encoder = new TextEncoder();
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Makes Markdown stable for storage and comparison. Two-space hard breaks intentionally become
 * ordinary line breaks; exports use the explicit `\\` form when a `<br>` must survive.
 */
export function normalizeDocumentMarkdown(input: string): string {
	const withoutBom = input.startsWith('\uFEFF') ? input.slice(1) : input;
	const lines = withoutBom
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/[\t ]+$/g, ''));

	while (lines.length > 0 && lines[0] === '') lines.shift();
	while (lines.length > 0 && lines.at(-1) === '') lines.pop();
	return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

/** Convert the supported Markdown subset to inert HTML and its searchable text representation. */
export function documentMarkdownToHtml(markdown: string): { html: string; plainText: string } {
	const normalised = normalizeDocumentMarkdown(markdown);
	assertSize(normalised, MAX_DOCUMENT_MARKDOWN_BYTES, 'file_too_large');
	const renderer = new SafeDocumentRenderer();
	const rendered = marked.parse(normalised, {
		async: false,
		gfm: true,
		breaks: false,
		pedantic: false,
		renderer
	});
	const html = sanitiseDocumentHtml(String(rendered));
	return { html, plainText: documentHtmlToPlainText(html) };
}

/** Extract references from visible prose while keeping inline formatting in one text run. */
function documentBodyBibleReferences(html: string): BibleReferenceMatch[] {
	const references: BibleReferenceMatch[] = [];
	let text = '';
	let codeDepth = 0;
	const flush = () => {
		if (text) references.push(...findBibleReferences(decodeHtmlEntities(text)));
		text = '';
	};
	// Inline formatting belongs to the same text run; blocks and code cannot supply pieces of a reference.
	for (const part of html.split(/(<[a-zA-Z/][^>]*>)/g)) {
		if (!part.startsWith('<')) {
			if (codeDepth === 0) text += part;
			continue;
		}
		const tag = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b/.exec(part);
		const name = tag?.[2]?.toLowerCase();
		if (name && /^(?:p|h[1-6]|li|blockquote|ul|ol|hr|br|pre|code)$/.test(name)) {
			flush();
		}
		if (name === 'pre' || name === 'code') {
			codeDepth = Math.max(0, codeDepth + (tag?.[1] ? -1 : 1));
		}
	}
	flush();
	return references;
}

/** Read-time canonical references also cover existing imports, without changing authored anchors. */
export function documentBodyOverlapsPassage(
	html: string,
	query: { startKey: number; endKey: number }
): boolean {
	return documentBodyBibleReferences(html).some((match) => {
		const start = match.passage?.start ?? {
			book: match.reference.book,
			chapter: match.reference.chapter,
			verse: match.reference.verse ?? 1
		};
		const end = match.passage?.end ?? {
			...start,
			verse: match.reference.verseEnd ?? match.reference.verse ?? MAX_PASSAGE_VERSE
		};
		return passagePointKey(start) <= query.endKey && passagePointKey(end) >= query.startKey;
	});
}

/** Distinct canonical books named by visible body references, including every book in a range. */
export function documentBodyBibleBooks(html: string): number[] {
	const books = new Set<number>();
	for (const match of documentBodyBibleReferences(html)) {
		const startBook = match.passage?.start.book ?? match.reference.book;
		const endBook = match.passage?.end.book ?? match.reference.book;
		for (let book = startBook; book <= endBook; book += 1) books.add(book);
	}
	return [...books].sort((left, right) => left - right);
}

/**
 * Convert allow-listed document HTML back to stable Markdown.
 *
 * This is necessarily lossy; see {@link MARKDOWN_ROUND_TRIP_LIMITATIONS}. The input is allow-listed
 * again even when it came from storage, so importing a stale or hand-written row cannot turn into an
 * unsafe Markdown link that becomes active on its next render.
 */
export function documentHtmlToMarkdown(input: string): string {
	assertSize(input, MAX_DOCUMENT_MARKDOWN_BYTES * 4, 'file_too_large');
	const service = createTurndownService();
	const turnedDown = service
		.turndown(sanitiseDocumentHtml(rewriteBibleReferenceLinks(input)))
		// Turndown's block separator can land immediately after its explicit hard-break marker. Keeping
		// that empty line would make Marked read the backslash as literal text on the next round trip.
		.replace(/\\\r?\n(?:[\t ]*\r?\n)+(?=\S)/g, '\\\n');
	const markdown = normalizeDocumentMarkdown(turnedDown);
	assertSize(markdown, MAX_DOCUMENT_MARKDOWN_BYTES, 'file_too_large');
	return markdown;
}

/** Parse one Obsidian-style Markdown file without performing any writes. */
export function previewObsidianMarkdown(
	sourceFilename: string,
	input: string | Uint8Array
): ObsidianDocumentPreview {
	const filename = validateMarkdownFilename(sourceFilename);
	const source = decodeMarkdownFile(input);
	const lineNormalised = normaliseLinesWithoutTrimming(source);
	const { metadata, body } = extractFrontmatter(lineNormalised);
	const warnings = new WarningCollector();
	const parsed = readImportMetadata(metadata, filename, warnings);
	const markdown = normaliseObsidianBody(body, warnings);
	assertSize(markdown, MAX_DOCUMENT_MARKDOWN_BYTES, 'file_too_large');
	const renderer = new SafeDocumentRenderer(warnings, true);
	const rendered = marked.parse(markdown, {
		async: false,
		gfm: true,
		breaks: false,
		pedantic: false,
		renderer
	});
	const html = sanitiseDocumentHtml(String(rendered));

	return {
		...parsed,
		markdown: rewriteImportedBibleLinks(markdown),
		html,
		plainText: documentHtmlToPlainText(html),
		warnings: warnings.values(),
		sourceFilename: filename
	};
}

/** Alias with a name that reads naturally in upload handlers. */
export const parseObsidianMarkdownFile = previewObsidianMarkdown;

/** Re-serialise only blocks containing Bible links; unrelated Markdown and large code blocks stay exact. */
function rewriteImportedBibleLinks(markdown: string): string {
	const tokens = marked.lexer(markdown, { gfm: true });
	return normalizeDocumentMarkdown(
		tokens
			.map((token) => {
				let containsBibleLink = false;
				marked.walkTokens([token], (child) => {
					if (
						child.type === 'link' &&
						bibleReferenceFromLinkText(
							documentHtmlToPlainText(marked.Parser.parseInline(child.tokens ?? []))
						)
					)
						containsBibleLink = true;
				});
				if (!containsBibleLink) return token.raw;
				return (
					documentHtmlToMarkdown(
						marked.parser([token], { renderer: new SafeDocumentRenderer() })
					).trimEnd() + (token.raw.match(/\n*$/u)?.[0] ?? '')
				);
			})
			.join('')
	);
}

/** Export only portable document data; ownership, ids and publication state are not accepted. */
export function exportDocumentMarkdown(input: DocumentMarkdownExportInput): string {
	const title = normaliseTitle(input.title);
	if (!title) throw new DocumentMarkdownError('invalid_export', 'An export needs a title.');
	if (!isDocumentKind(input.kind)) {
		throw new DocumentMarkdownError('invalid_export', 'The document kind is not exportable.');
	}

	const validationWarnings = new WarningCollector();
	const tags = normaliseTags(input.tags ?? [], validationWarnings);
	const passages = normalisePassages(input.passages ?? [], validationWarnings);
	if (validationWarnings.values().length > 0) {
		throw new DocumentMarkdownError(
			'invalid_export',
			`Invalid export metadata: ${validationWarnings.values().join(' ')}`
		);
	}

	const frontmatter: Record<string, unknown> = {
		title,
		type: input.kind,
		tags,
		passages: passages.map(({ reference, resourceId }) => ({
			reference,
			...(resourceId ? { resource: resourceId } : {})
		}))
	};

	if (input.kind === 'sermon') {
		const status = input.sermon?.status ?? 'idea';
		if (!isSermonStatus(status)) {
			throw new DocumentMarkdownError('invalid_export', 'The sermon status is not exportable.');
		}
		const sermon: Record<string, unknown> = { status };
		if (input.sermon?.date) {
			if (!isCalendarDate(input.sermon.date)) {
				throw new DocumentMarkdownError('invalid_export', 'The sermon date must use YYYY-MM-DD.');
			}
			sermon.date = input.sermon.date;
		}
		if (input.sermon?.series) {
			const series = normaliseShortText(input.sermon.series, 200);
			if (!series) {
				throw new DocumentMarkdownError('invalid_export', 'The sermon series is invalid.');
			}
			sermon.series = series;
		}
		if (input.sermon?.deliveries?.length) {
			if (input.sermon.deliveries.length > MAX_SERMON_DELIVERIES) {
				throw new DocumentMarkdownError(
					'invalid_export',
					`A sermon export may contain at most ${MAX_SERMON_DELIVERIES} deliveries.`
				);
			}
			sermon.deliveries = input.sermon.deliveries.map((delivery) => {
				if (!isCalendarDate(delivery.date)) {
					throw new DocumentMarkdownError('invalid_export', 'A delivery date must use YYYY-MM-DD.');
				}
				const location = normaliseShortText(delivery.location, 200);
				if (!location) {
					throw new DocumentMarkdownError('invalid_export', 'A delivery location is invalid.');
				}
				return { date: delivery.date, location };
			});
		}
		frontmatter.sermon = sermon;
	}

	frontmatter.created = normaliseTimestamp(input.createdAt);
	frontmatter.updated = normaliseTimestamp(input.updatedAt);

	const body = input.markdown ?? documentHtmlToMarkdown(input.html ?? '');
	const normalisedBody = normalizeDocumentMarkdown(body);
	assertSize(normalisedBody, MAX_DOCUMENT_MARKDOWN_BYTES, 'file_too_large');
	const yaml = stringifyYaml(frontmatter, {
		schema: 'core',
		lineWidth: 0,
		sortMapEntries: false,
		defaultStringType: 'PLAIN',
		defaultKeyType: 'PLAIN'
	});
	if (encoder.encode(yaml).byteLength > MAX_OBSIDIAN_FRONTMATTER_BYTES) {
		throw new DocumentMarkdownError(
			'invalid_export',
			'Export frontmatter exceeds the safe YAML size limit.'
		);
	}
	const result = `---\n${yaml}---\n${normalisedBody ? `\n${normalisedBody}` : ''}`;
	assertSize(result, MAX_OBSIDIAN_IMPORT_BYTES, 'file_too_large');
	return result.endsWith('\n') ? result : `${result}\n`;
}

/** A ready-to-send Markdown download without any private metadata in either name or body. */
export function createDocumentMarkdownExport(
	input: DocumentMarkdownExportInput
): DocumentMarkdownExport {
	const filename = safeDocumentMarkdownFilename(input.title);
	return {
		filename,
		content: exportDocumentMarkdown(input),
		contentType: 'text/markdown; charset=utf-8',
		contentDisposition: markdownContentDisposition(filename)
	};
}

/** Produce a portable leaf filename; it never returns path separators or control characters. */
export function safeDocumentMarkdownFilename(title: string): string {
	return safeDocumentFilename(title, 'md');
}

/** Produce the same portable filename for every supported download format. */
export function safeDocumentFilename(title: string, extension: 'md' | 'docx' | 'pdf'): string {
	const normalisedTitle = title.normalize('NFKC');
	const suffix = `.${extension}`;
	const titleWithoutExtension = normalisedTitle.toLowerCase().endsWith(suffix)
		? normalisedTitle.slice(0, -suffix.length)
		: normalisedTitle;
	const cleanedStem = replaceControlCharacters(titleWithoutExtension, ' ')
		.replace(/[<>:"/\\|?*]+/g, ' ')
		.replace(/\.{2,}/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[ .]+|[ .]+$/g, '');
	let stem = Array.from(cleanedStem)
		.slice(0, 120)
		.join('')
		.replace(/[ .]+$/g, '');
	if (!stem || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = 'document';
	return `${stem}.${extension}`;
}

/** RFC 6266/5987-compatible header value with an ASCII fallback and a UTF-8 filename. */
export function markdownContentDisposition(filenameOrTitle: string): string {
	return documentContentDisposition(filenameOrTitle, 'md');
}

export function documentContentDisposition(
	filenameOrTitle: string,
	extension: 'md' | 'docx' | 'pdf'
): string {
	const suffix = `.${extension}`;
	const filename = filenameOrTitle.toLowerCase().endsWith(suffix)
		? safeDocumentFilename(filenameOrTitle.slice(0, -suffix.length), extension)
		: safeDocumentFilename(filenameOrTitle, extension);
	const ascii =
		filename
			.replaceAll('ß', 'ss')
			.replaceAll('ẞ', 'SS')
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^\x20-\x7E]/g, '-')
			.replace(/["\\]/g, '-') || `document.${extension}`;
	const encoded = encodeURIComponent(filename).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

class SafeDocumentRenderer extends Renderer {
	private readonly warnings?: WarningCollector;
	private readonly stripAttachmentLinks: boolean;

	constructor(warnings?: WarningCollector, stripAttachmentLinks = false) {
		super();
		this.warnings = warnings;
		this.stripAttachmentLinks = stripAttachmentLinks;
	}

	override code({ text }: Tokens.Code): string {
		return `<pre><code>${escapeHtml(text.replace(/\n$/, ''))}</code></pre>\n`;
	}

	override heading({ tokens, depth }: Tokens.Heading): string {
		const safeDepth = Math.min(Math.max(depth, 1), 6);
		return `<h${safeDepth}>${this.parser.parseInline(tokens)}</h${safeDepth}>\n`;
	}

	override list(token: Tokens.List): string {
		const tag = token.ordered ? 'ol' : 'ul';
		const items = token.items.map((item) => this.listitem(item)).join('');
		return `<${tag}>\n${items}</${tag}>\n`;
	}

	override checkbox({ checked }: Tokens.Checkbox): string {
		return checked ? '[x] ' : '[ ] ';
	}

	override del({ tokens }: Tokens.Del): string {
		return `<s>${this.parser.parseInline(tokens)}</s>`;
	}

	override link({ href, tokens }: Tokens.Link): string {
		const label = this.parser.parseInline(tokens);
		const reference = bibleReferenceFromLinkText(documentHtmlToPlainText(label));
		if (reference) return `<a href="${escapeHtmlAttribute(reference.href)}">${label}</a>`;
		if (this.stripAttachmentLinks && isAttachmentHref(href)) {
			this.warnings?.add(
				'attachment-link',
				'An attachment link was reduced to its readable label.'
			);
			return label;
		}
		const safeHref = safeLinkHref(href);
		return safeHref ? `<a href="${escapeHtmlAttribute(safeHref)}">${label}</a>` : label;
	}

	override image({ text, tokens }: Tokens.Image): string {
		this.warnings?.add('image', 'An image or attachment was removed from the import.');
		const label = tokens
			? this.parser.parseInline(tokens, this.parser.textRenderer)
			: escapeHtml(text);
		return label ? `<em>${escapeHtml(decodeHtmlEntities(label))}</em>` : '';
	}

	override html({ text }: Tokens.HTML | Tokens.Tag): string {
		// Markdown has no underline/highlight syntax. Only these attribute-free inline tags survive.
		if (/^<\/?(?:u|mark)>$/iu.test(text)) return text.toLowerCase();
		this.warnings?.add('raw-html', 'Raw HTML was removed from the import.');
		return escapeHtml(rawHtmlToText(text));
	}

	override table(token: Tokens.Table): string {
		const rows = [token.header, ...token.rows];
		return rows
			.map(
				(row) => `<p>${row.map((cell) => this.parser.parseInline(cell.tokens)).join(' · ')}</p>\n`
			)
			.join('');
	}
}

class WarningCollector {
	readonly #messages = new Map<string, string>();

	add(code: string, message: string): void {
		if (!this.#messages.has(code)) this.#messages.set(code, message);
	}

	values(): string[] {
		return [...this.#messages.values()];
	}
}

function createTurndownService(): TurndownService {
	const service = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		br: '\\\n',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
		fence: '```',
		emDelimiter: '_',
		strongDelimiter: '**',
		linkStyle: 'inlined'
	});
	service.addRule('strikethrough', {
		filter: ['s', 'del'],
		replacement: (content) => (content.trim() ? `~~${content}~~` : '')
	});
	const escapeText = service.escape.bind(service);
	service.escape = (text) => escapeText(text).replace(/</g, '\\<');
	service.addRule('inlineFormatting', {
		filter: ['u', 'mark'],
		replacement: (content, node) => {
			const tag = node.nodeName.toLowerCase();
			return content.trim() ? `<${tag}>${content}</${tag}>` : '';
		}
	});
	return service;
}

function normaliseObsidianBody(body: string, warnings: WarningCollector): string {
	let markdown = body.replace(/!\[\[([^\]\r\n]{0,500})\]\]/g, () => {
		warnings.add('obsidian-embed', 'An Obsidian embed was removed from the import.');
		return '';
	});

	markdown = markdown.replace(/\[\[([^\]\r\n]{1,500})\]\]/g, (_whole, contents: string) => {
		const separator = contents.indexOf('|');
		const target = (separator < 0 ? contents : contents.slice(0, separator)).trim();
		const explicitLabel = separator < 0 ? '' : contents.slice(separator + 1).trim();
		const label = explicitLabel || wikilinkDefaultLabel(target);
		if (!isSafeWikilinkTarget(target) || isAttachmentHref(target)) {
			warnings.add(
				'unsafe-wikilink',
				'An unsafe or attachment wikilink was reduced to readable text.'
			);
			return escapeMarkdownLabel(label || target);
		}

		warnings.add('wikilink', 'Obsidian wikilinks were converted to ordinary internal links.');
		return `[${escapeMarkdownLabel(label)}](<${encodeWikilinkTarget(target)}>)`;
	});

	return normalizeDocumentMarkdown(markdown);
}

function extractFrontmatter(source: string): { metadata: Record<string, unknown>; body: string } {
	const lines = source.split('\n');
	if (lines[0] !== '---') return { metadata: {}, body: source };

	const closing = lines.findIndex((line, index) => index > 0 && (line === '---' || line === '...'));
	if (closing < 0) {
		throw new DocumentMarkdownError('invalid_frontmatter', 'The YAML frontmatter is not closed.');
	}

	const yaml = lines.slice(1, closing).join('\n');
	assertSize(yaml, MAX_OBSIDIAN_FRONTMATTER_BYTES, 'invalid_frontmatter');
	const document = parseDocument(yaml, {
		schema: 'core',
		version: '1.2',
		customTags: [],
		merge: false,
		resolveKnownTags: false,
		strict: true,
		uniqueKeys: true,
		stringKeys: true,
		prettyErrors: true
	});
	if (document.errors.length > 0 || document.warnings.length > 0) {
		const issue = document.errors[0] ?? document.warnings[0];
		throw new DocumentMarkdownError(
			'invalid_frontmatter',
			`Unsafe or invalid YAML frontmatter: ${issue?.message ?? 'unknown YAML error'}`
		);
	}

	let value: unknown;
	try {
		// Imports do not need aliases at all. Disabling them completely is simpler and safer than trying
		// to distinguish a useful alias from an exponential expansion.
		value = document.toJS({ maxAliasCount: 0 });
	} catch (error) {
		throw new DocumentMarkdownError(
			'invalid_frontmatter',
			`YAML aliases are not allowed: ${error instanceof Error ? error.message : 'invalid alias'}`
		);
	}

	if (value == null) value = {};
	if (!isPlainRecord(value)) {
		throw new DocumentMarkdownError('invalid_frontmatter', 'Frontmatter must be a YAML mapping.');
	}
	assertMetadataComplexity(value);
	return { metadata: value, body: lines.slice(closing + 1).join('\n') };
}

function readImportMetadata(
	metadata: Record<string, unknown>,
	filename: string,
	warnings: WarningCollector
): Pick<ObsidianDocumentPreview, 'title' | 'kind' | 'tags' | 'passages' | 'sermon'> {
	const known = new Set([
		'title',
		'type',
		'kind',
		'tags',
		'passages',
		'references',
		'sermon',
		'status',
		'date',
		'series',
		'sermon_status',
		'sermon_date',
		'sermon_series',
		'created',
		'updated'
	]);
	for (const key of Object.keys(metadata)) {
		if (isDangerousMetadataKey(key)) {
			warnings.add(
				`unsafe-metadata:${key}`,
				`Frontmatter field "${key}" was ignored; imports cannot set ownership or publication state.`
			);
		} else if (!known.has(key)) {
			warnings.add(`unknown-metadata:${key}`, `Unknown frontmatter field "${key}" was ignored.`);
		} else if (key === 'created' || key === 'updated') {
			warnings.add(
				'metadata-timestamps',
				'Exported timestamps are informational and are not restored during import.'
			);
		}
	}

	const fallbackTitle = filename.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
	let title = normaliseTitle(metadata.title);
	if (!title) {
		if (hasOwn(metadata, 'title')) {
			warnings.add('invalid-title', 'The frontmatter title was invalid; the filename was used.');
		}
		title = normaliseTitle(fallbackTitle) || 'Untitled';
	}

	const kind = readKind(metadata, warnings);
	const tags = normaliseTags(metadata.tags, warnings);
	const passages = normalisePassages(
		[...toMetadataList(metadata.passages), ...toMetadataList(metadata.references)],
		warnings
	);
	const sermon = readSermon(metadata, kind, warnings);
	return { title, kind, tags, passages, ...(sermon ? { sermon } : {}) };
}

function readKind(
	metadata: Record<string, unknown>,
	warnings: WarningCollector
): DocumentMarkdownKind {
	const type = metadata.type;
	const kind = metadata.kind;
	if (type != null && kind != null && String(type).toLowerCase() !== String(kind).toLowerCase()) {
		warnings.add('kind-conflict', 'Both type and kind were present; type took precedence.');
	}
	const candidate = type ?? kind ?? 'note';
	if (typeof candidate === 'string' && isDocumentKind(candidate.toLowerCase())) {
		return candidate.toLowerCase() as DocumentMarkdownKind;
	}
	warnings.add('invalid-kind', 'The document type was invalid and defaulted to note.');
	return 'note';
}

function normaliseTags(value: unknown, warnings: WarningCollector): string[] {
	if (value == null) return [];
	const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
	if (values.length === 0 && value != null && !Array.isArray(value)) {
		warnings.add('invalid-tags', 'Tags must be a string or a list of strings.');
		return [];
	}

	const tags: string[] = [];
	const seen = new Set<string>();
	for (const candidate of values.slice(0, 100)) {
		if (typeof candidate !== 'string') {
			warnings.add('invalid-tag-entry', 'A non-text tag was ignored.');
			continue;
		}
		const withoutHash = candidate.trim().replace(/^#+/, '');
		const segments = withoutHash.split('/').map((segment) => segment.trim());
		if (
			segments.length === 0 ||
			segments.some(
				(segment) =>
					!segment ||
					segment === '.' ||
					segment === '..' ||
					Array.from(segment).length > 80 ||
					containsControlCharacters(segment) ||
					segment.includes('\\') ||
					segment.includes(',')
			)
		) {
			warnings.add('invalid-tag-entry', 'An invalid tag was ignored.');
			continue;
		}
		const tag = segments.join('/');
		const key = tag.toLocaleLowerCase('und');
		if (!seen.has(key)) {
			seen.add(key);
			tags.push(tag);
		}
	}
	if (values.length > 100) warnings.add('too-many-tags', 'Only the first 100 tags were imported.');
	return tags;
}

function normalisePassages(value: unknown, warnings: WarningCollector): DocumentMarkdownPassage[] {
	const values = toMetadataList(value);
	const passages: DocumentMarkdownPassage[] = [];
	const seen = new Set<string>();
	for (const candidate of values.slice(0, MAX_DOCUMENT_PASSAGES)) {
		let reference: unknown;
		let resource: unknown;
		if (typeof candidate === 'string') {
			reference = candidate;
		} else if (isPlainRecord(candidate)) {
			reference = candidate.reference;
			resource = candidate.resource ?? candidate.resourceId;
			if (
				candidate.resource != null &&
				candidate.resourceId != null &&
				candidate.resource !== candidate.resourceId
			) {
				warnings.add(
					'passage-resource-conflict',
					'A passage had both resource and resourceId; resource took precedence.'
				);
			}
		} else {
			warnings.add('invalid-passage', 'An invalid passage entry was ignored.');
			continue;
		}

		const cleanReference = normaliseShortText(reference, 200);
		if (!cleanReference) {
			warnings.add('invalid-passage', 'A passage without a valid reference was ignored.');
			continue;
		}
		let resourceId: string | undefined;
		if (resource != null) {
			resourceId = normaliseShortText(resource, 128) || undefined;
			if (!resourceId) {
				warnings.add(
					'invalid-passage-resource',
					'An invalid passage resource was ignored; the reference was retained.'
				);
			}
		}
		const key = `${cleanReference}\u0000${resourceId ?? ''}`;
		if (!seen.has(key)) {
			seen.add(key);
			passages.push({ reference: cleanReference, ...(resourceId ? { resourceId } : {}) });
		}
	}
	if (values.length > MAX_DOCUMENT_PASSAGES) {
		warnings.add(
			'too-many-passages',
			`Only the first ${MAX_DOCUMENT_PASSAGES} passage references were imported.`
		);
	}
	return passages;
}

function readSermon(
	metadata: Record<string, unknown>,
	kind: DocumentMarkdownKind,
	warnings: WarningCollector
): DocumentMarkdownSermon | undefined {
	const nested = isPlainRecord(metadata.sermon) ? metadata.sermon : {};
	if (metadata.sermon != null && !isPlainRecord(metadata.sermon)) {
		warnings.add('invalid-sermon', 'Sermon metadata must be a mapping.');
	}
	const hasSermonMetadata =
		metadata.sermon != null ||
		['status', 'date', 'series', 'sermon_status', 'sermon_date', 'sermon_series'].some((key) =>
			hasOwn(metadata, key)
		);
	if (kind !== 'sermon') {
		if (hasSermonMetadata) {
			warnings.add(
				'sermon-on-other-kind',
				'Sermon metadata was ignored for a non-sermon document.'
			);
		}
		return undefined;
	}

	const statusValue = nested.status ?? metadata.sermon_status ?? metadata.status ?? 'idea';
	const status =
		typeof statusValue === 'string' && isSermonStatus(statusValue.toLowerCase())
			? (statusValue.toLowerCase() as SermonMarkdownStatus)
			: 'idea';
	if (status === 'idea' && String(statusValue).toLowerCase() !== 'idea') {
		warnings.add('invalid-sermon-status', 'The sermon status was invalid and defaulted to idea.');
	}

	const dateValue = nested.date ?? metadata.sermon_date ?? metadata.date;
	let date: string | undefined;
	if (dateValue != null) {
		date = typeof dateValue === 'string' && isCalendarDate(dateValue) ? dateValue : undefined;
		if (!date) warnings.add('invalid-sermon-date', 'An invalid sermon date was ignored.');
	}

	const seriesValue = nested.series ?? metadata.sermon_series ?? metadata.series;
	let series: string | undefined;
	if (seriesValue != null) {
		series = normaliseShortText(seriesValue, 200) || undefined;
		if (!series) warnings.add('invalid-sermon-series', 'An invalid sermon series was ignored.');
	}

	const deliveryValues = nested.deliveries;
	const deliveries: NonNullable<DocumentMarkdownSermon['deliveries']> = [];
	if (deliveryValues != null && !Array.isArray(deliveryValues)) {
		warnings.add('invalid-sermon-deliveries', 'Sermon deliveries must be a list.');
	} else if (Array.isArray(deliveryValues)) {
		for (const candidate of deliveryValues.slice(0, MAX_SERMON_DELIVERIES)) {
			if (!isPlainRecord(candidate)) {
				warnings.add('invalid-sermon-delivery', 'An invalid sermon delivery was ignored.');
				continue;
			}
			const deliveryDate =
				typeof candidate.date === 'string' && isCalendarDate(candidate.date)
					? candidate.date
					: undefined;
			const location = normaliseShortText(candidate.location, MAX_SERMON_DELIVERY_LOCATION_LENGTH);
			if (!deliveryDate || !location) {
				warnings.add('invalid-sermon-delivery', 'An invalid sermon delivery was ignored.');
				continue;
			}
			deliveries.push({ date: deliveryDate, location });
		}
		if (deliveryValues.length > MAX_SERMON_DELIVERIES) {
			warnings.add(
				'too-many-sermon-deliveries',
				`Only the first ${MAX_SERMON_DELIVERIES} sermon deliveries were imported.`
			);
		}
	}

	return {
		status,
		...(date ? { date } : {}),
		...(series ? { series } : {}),
		...(deliveries.length ? { deliveries } : {})
	};
}

function sanitiseDocumentHtml(input: string): string {
	const html = stripDangerousRawHtml(input);

	return html.replace(
		/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
		(whole, slash, name, rest) => {
			const tag = String(name).toLowerCase();
			if (!ALLOWED_HTML_TAGS.has(tag)) return '';
			if (slash) return VOID_HTML_TAGS.has(tag) ? '' : `</${tag}>`;
			if (VOID_HTML_TAGS.has(tag)) return `<${tag}>`;
			if (tag !== 'a') return `<${tag}>`;
			const href = readHtmlHref(String(rest));
			const safeHref = href ? safeLinkHref(href) : null;
			return safeHref ? `<a href="${escapeHtmlAttribute(safeHref)}">` : '<a>';
		}
	);
}

function documentHtmlToPlainText(html: string): string {
	return decodeHtmlEntities(
		html
			.replace(/<\/?(?:h[1-6]|p|li|blockquote|pre|ul|ol)\b[^>]*>/gi, ' ')
			.replace(/<br\s*\/?\s*>/gi, ' ')
			.replace(/<[^>]*>/g, '')
	)
		.replace(/\s+/g, ' ')
		.trim();
}

export function safeLinkHref(input: string): string | null {
	const decoded = decodeHtmlEntities(input).trim();
	if (!decoded || containsControlCharacters(decoded) || decoded.includes('\\')) return null;
	const schemeProbe = decoded.replace(/[\t\n\r ]+/g, '');
	if (/^https?:\/\//i.test(schemeProbe)) {
		try {
			const parsed = new URL(decoded);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? decoded : null;
		} catch {
			return null;
		}
	}
	if (/^mailto:/i.test(schemeProbe)) return decoded;
	if (/^[a-z][a-z\d+.-]*:/i.test(schemeProbe) || decoded.startsWith('//')) return null;
	return decoded;
}

function readHtmlHref(attributes: string): string | null {
	const match = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
	return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function rawHtmlToText(input: string): string {
	return stripDangerousRawHtml(input).replace(/<\/?[a-zA-Z][^>]*>/g, '');
}

/**
 * Removes active raw-HTML elements and comments in one forward scan. A repeated unterminated tag
 * must stay linear in the one-MiB request bound; a lazy `.*?</script>` expression becomes quadratic
 * because it retries the remainder of the document from every opening tag.
 */
function stripDangerousRawHtml(input: string): string {
	let result = '';
	let cursor = 0;
	let suppressedTag: string | null = null;
	let suppressedDepth = 0;

	while (cursor < input.length) {
		const opening = input.indexOf('<', cursor);
		if (opening < 0) {
			if (!suppressedTag) result += input.slice(cursor);
			break;
		}
		if (!suppressedTag) result += input.slice(cursor, opening);

		if (input.startsWith('<!--', opening)) {
			const commentEnd = input.indexOf('-->', opening + 4);
			if (commentEnd < 0) break;
			cursor = commentEnd + 3;
			continue;
		}

		const closing = input.indexOf('>', opening + 1);
		if (closing < 0) {
			if (!suppressedTag) result += input.slice(opening);
			break;
		}

		const token = input.slice(opening, closing + 1);
		const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b/u.exec(token);
		if (!match) {
			if (!suppressedTag) result += token;
			cursor = closing + 1;
			continue;
		}

		const isClosing = match[1] === '/';
		const tag = match[2]!.toLowerCase();
		const selfClosing = /\/\s*>$/u.test(token);
		if (suppressedTag) {
			if (tag === suppressedTag) {
				if (isClosing) suppressedDepth -= 1;
				else if (!selfClosing) suppressedDepth += 1;
				if (suppressedDepth <= 0) {
					suppressedTag = null;
					suppressedDepth = 0;
				}
			}
		} else if (DANGEROUS_RAW_TAGS.has(tag)) {
			if (!isClosing && !selfClosing) {
				suppressedTag = tag;
				suppressedDepth = 1;
			}
		} else {
			result += token;
		}
		cursor = closing + 1;
	}

	return result;
}

function isAttachmentHref(input: string): boolean {
	const clean = decodeHtmlEntities(input).split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? '';
	const extension = clean.match(/\.([a-z\d]{1,8})$/i)?.[1]?.toLowerCase();
	return Boolean(extension && ATTACHMENT_EXTENSIONS.has(extension));
}

function isSafeWikilinkTarget(target: string): boolean {
	if (
		!target ||
		target.length > 500 ||
		containsControlCharacters(target) ||
		target.includes('\\') ||
		/[<>]/.test(target)
	) {
		return false;
	}
	// Obsidian wikilinks name vault-local notes. Ordinary Markdown links handle web/mail targets;
	// treating an external scheme as a wikilink would silently broaden it beyond that contract.
	if (/^[a-z][a-z\d+.-]*:/i.test(target.replace(/[\t\n\r ]+/g, ''))) return false;
	if (safeLinkHref(target) == null) return false;
	const path = target.split('#', 1)[0] ?? '';
	if (path.startsWith('//')) return false;
	return !path.split('/').some((segment) => segment === '.' || segment === '..');
}

function wikilinkDefaultLabel(target: string): string {
	const withoutFragment = target.split('#')[0] || target.slice(1);
	return withoutFragment.split('/').at(-1)?.trim() || target;
}

function encodeWikilinkTarget(target: string): string {
	return encodeURI(target).replace(
		/[[\]<>]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

function escapeMarkdownLabel(input: string): string {
	return input.replace(/\\|\[|\]/g, '\\$&');
}

function validateMarkdownFilename(input: string): string {
	const filename = input.normalize('NFC').trim();
	let decoded = filename;
	try {
		decoded = decodeURIComponent(filename);
	} catch {
		// A literal percent sign is legal in a leaf filename; the direct checks below are sufficient.
	}
	if (
		!filename ||
		filename.length > 255 ||
		!filename.toLowerCase().endsWith('.md') ||
		filename.toLowerCase() === '.md' ||
		containsControlCharacters(filename) ||
		filename.includes('/') ||
		filename.includes('\\') ||
		decoded.includes('/') ||
		decoded.includes('\\') ||
		decoded
			.replaceAll('\\', '/')
			.split('/')
			.some((part) => part === '..')
	) {
		throw new DocumentMarkdownError(
			'invalid_filename',
			'Only a safe, path-free .md filename can be imported.'
		);
	}
	return filename;
}

function decodeMarkdownFile(input: string | Uint8Array): string {
	let source: string;
	if (typeof input === 'string') {
		// The preview confirmation transports the original upload through a textarea. Browsers encode
		// textarea line breaks as CRLF in multipart form data, so enforce the file limit only after
		// restoring the platform-neutral LF representation that was measured during upload.
		source = input.replace(/\r\n?/g, '\n');
		assertSize(source, MAX_OBSIDIAN_IMPORT_BYTES, 'file_too_large');
	} else {
		if (input.byteLength > MAX_OBSIDIAN_IMPORT_BYTES) {
			throw new DocumentMarkdownError(
				'file_too_large',
				'Markdown imports exceed the body plus frontmatter limit.'
			);
		}
		try {
			source = fatalDecoder.decode(input);
		} catch {
			throw new DocumentMarkdownError('invalid_encoding', 'The Markdown file is not valid UTF-8.');
		}
	}
	if (containsBinaryControlCharacters(source)) {
		throw new DocumentMarkdownError('binary_file', 'Binary data cannot be imported as Markdown.');
	}
	return source.startsWith('\uFEFF') ? source.slice(1) : source;
}

function normaliseLinesWithoutTrimming(input: string): string {
	return input
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/[\t ]+$/g, ''))
		.join('\n');
}

function assertSize(
	input: string,
	maximum: number,
	code: Extract<DocumentMarkdownErrorCode, 'file_too_large' | 'invalid_frontmatter'>
): void {
	if (encoder.encode(input).byteLength <= maximum) return;
	throw new DocumentMarkdownError(
		code,
		code === 'invalid_frontmatter'
			? 'YAML frontmatter is limited to 64 KiB.'
			: maximum === MAX_OBSIDIAN_IMPORT_BYTES
				? 'Markdown imports exceed the body plus frontmatter limit.'
				: 'Markdown document bodies are limited to 1 MiB.'
	);
}

function assertMetadataComplexity(value: Record<string, unknown>): void {
	const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
	let nodes = 0;
	while (stack.length > 0) {
		const current = stack.pop()!;
		nodes += 1;
		if (nodes > 5000 || current.depth > 20) {
			throw new DocumentMarkdownError(
				'invalid_frontmatter',
				'YAML frontmatter is too deeply nested or complex.'
			);
		}
		if (Array.isArray(current.value)) {
			for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
		} else if (isPlainRecord(current.value)) {
			for (const child of Object.values(current.value)) {
				stack.push({ value: child, depth: current.depth + 1 });
			}
		}
	}
}

function normaliseTitle(value: unknown): string {
	return normaliseShortText(value, 200);
}

function normaliseShortText(value: unknown, maximumLength: number): string {
	if (typeof value !== 'string') return '';
	const clean = value.replace(/\s+/g, ' ').trim();
	return clean && Array.from(clean).length <= maximumLength && !containsControlCharacters(clean)
		? clean
		: '';
}

function containsControlCharacters(input: string): boolean {
	for (let index = 0; index < input.length; index += 1) {
		const code = input.charCodeAt(index);
		if (code < 0x20 || code === 0x7f) return true;
	}
	return false;
}

function containsBinaryControlCharacters(input: string): boolean {
	for (let index = 0; index < input.length; index += 1) {
		const code = input.charCodeAt(index);
		if (code === 0x7f || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)) {
			return true;
		}
	}
	return false;
}

function replaceControlCharacters(input: string, replacement: string): string {
	let result = '';
	for (let index = 0; index < input.length; index += 1) {
		const code = input.charCodeAt(index);
		result += code < 0x20 || code === 0x7f ? replacement : input[index];
	}
	return result;
}

function toMetadataList(value: unknown): unknown[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

function normaliseTimestamp(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(date.getTime())) {
		throw new DocumentMarkdownError('invalid_export', 'Export timestamps must be valid dates.');
	}
	return date.toISOString();
}

function isCalendarDate(input: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	date.setUTCHours(0, 0, 0, 0);
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function isDocumentKind(input: string): input is DocumentMarkdownKind {
	return (DOCUMENT_MARKDOWN_KINDS as readonly string[]).includes(input);
}

function isSermonStatus(input: string): input is SermonMarkdownStatus {
	return (SERMON_MARKDOWN_STATUSES as readonly string[]).includes(input);
}

function isDangerousMetadataKey(key: string): boolean {
	const normalised = key.toLowerCase().replace(/[_-]/g, '');
	return /^(?:id|uuid|documentid|owner|ownerid|owneremail|user|userid|email|author|authoremail|role|admin|isadmin|visibility|public|ispublic|published|ispublished|publishedat|publication|publicationid|slug|snapshot|snapshotid)$/.test(
		normalised
	);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function escapeHtml(input: string): string {
	return input
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(input: string): string {
	return escapeHtml(input);
}

function decodeHtmlEntities(input: string): string {
	return input.replace(
		/&(?:#(\d{1,7})|#x([\da-f]{1,6})|amp|lt|gt|quot|apos|colon|tab|newline);/gi,
		(entity, decimal: string | undefined, hexadecimal: string | undefined) => {
			if (decimal || hexadecimal) {
				const point = Number.parseInt(decimal ?? hexadecimal!, decimal ? 10 : 16);
				if (
					!Number.isFinite(point) ||
					point <= 0 ||
					point > 0x10ffff ||
					(point >= 0xd800 && point <= 0xdfff)
				) {
					return '\uFFFD';
				}
				return String.fromCodePoint(point);
			}
			switch (entity.toLowerCase()) {
				case '&amp;':
					return '&';
				case '&lt;':
					return '<';
				case '&gt;':
					return '>';
				case '&quot;':
					return '"';
				case '&apos;':
					return "'";
				case '&colon;':
					return ':';
				case '&tab;':
					return '\t';
				case '&newline;':
					return '\n';
				default:
					return entity;
			}
		}
	);
}
