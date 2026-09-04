/** Pure document-domain vocabulary and input bounds shared by client and server code. */

export const DOCUMENT_KINDS = ['note', 'article', 'sermon'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const SERMON_WORKFLOW_STATES = [
	'idea',
	'research',
	'outline',
	'ready',
	'delivered'
] as const;
export type SermonWorkflowState = (typeof SERMON_WORKFLOW_STATES)[number];

export const DOCUMENT_SOURCES = ['native', 'obsidian', 'legacy-verse-comment'] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

export const MAX_DOCUMENT_TITLE_LENGTH = 200;
export const MAX_SERMON_TEMPLATE_NAME_LENGTH = 120;
export const MAX_SERMON_DELIVERY_LOCATION_LENGTH = 200;
/** Keeps portable sermon metadata and one confirmation transaction predictably bounded. */
export const MAX_SERMON_DELIVERIES = 100;
export const MAX_TAG_SEGMENT_LENGTH = 80;
export const MAX_DOCUMENT_MARKDOWN_BYTES = 1024 * 1024;
export const MAX_OBSIDIAN_FRONTMATTER_BYTES = 64 * 1024;
/** Includes a one-MiB body, bounded YAML headroom, BOM and frontmatter delimiters. */
export const MAX_OBSIDIAN_IMPORT_BYTES =
	MAX_DOCUMENT_MARKDOWN_BYTES + MAX_OBSIDIAN_FRONTMATTER_BYTES + 16;

/** Practical guards for a nested-tag UI and a single import operation. */
export const MAX_TAG_DEPTH = 8;
export const MAX_DOCUMENT_TAGS = 50;
export const MAX_DOCUMENT_PASSAGES = 100;

/** A useful title for a newly created draft, never a public-author fallback. */
export const DEFAULT_DOCUMENT_TITLE = 'Unbenanntes Dokument';

export const GERMAN_SERMON_STARTER_TEMPLATE = `## Bibeltext

> Bibelstelle und Leitvers einfügen

## Kerngedanke

Was ist die eine Aussage, die in Erinnerung bleiben soll?

## Ziel der Predigt

Was sollen die Hörenden erkennen, glauben oder tun?

## Gliederung

### Einleitung

### Hauptteil

1. Erster Gedanke
2. Zweiter Gedanke
3. Dritter Gedanke

### Schluss

## Anwendung

## Illustrationen und Quellen

## Offene Fragen
`;

function isOneOf<const Values extends readonly string[]>(
	values: Values,
	value: unknown
): value is Values[number] {
	return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function isDocumentKind(value: unknown): value is DocumentKind {
	return isOneOf(DOCUMENT_KINDS, value);
}

export function isDocumentVisibility(value: unknown): value is DocumentVisibility {
	return isOneOf(DOCUMENT_VISIBILITIES, value);
}

export function isSermonWorkflowState(value: unknown): value is SermonWorkflowState {
	return isOneOf(SERMON_WORKFLOW_STATES, value);
}

export function isDocumentSource(value: unknown): value is DocumentSource {
	return isOneOf(DOCUMENT_SOURCES, value);
}

function characterLength(value: string): number {
	return Array.from(value).length;
}

/** Trims UI labels, folds internal whitespace, and keeps Unicode in canonical composed form. */
function normalizeLabel(value: string): string {
	return value
		.normalize('NFC')
		.split('')
		.map((character) => {
			const code = character.charCodeAt(0);
			return code <= 0x1f || code === 0x7f ? ' ' : character;
		})
		.join('')
		.replace(/\s+/gu, ' ')
		.trim();
}

export function normalizeDocumentTitle(value: string): string {
	return normalizeLabel(value);
}

export function isValidDocumentTitle(value: string): boolean {
	const normalized = normalizeDocumentTitle(value);
	return normalized.length > 0 && characterLength(normalized) <= MAX_DOCUMENT_TITLE_LENGTH;
}

/** One tag segment, not a slash-separated path. A pasted Obsidian `#` prefix is harmless. */
export function normalizeTagSegment(value: string): string {
	return normalizeLabel(value).replace(/^#+/u, '').trim();
}

export function isValidTagSegment(value: string): boolean {
	const normalized = normalizeTagSegment(value);
	return (
		normalized.length > 0 &&
		characterLength(normalized) <= MAX_TAG_SEGMENT_LENGTH &&
		!normalized.includes('/') &&
		!normalized.includes(',') &&
		!normalized.includes('\\') &&
		!normalized.includes('#')
	);
}

/** Normalizes an Obsidian-style `parent/child` tag into separately stored hierarchy segments. */
export function normalizeTagPath(value: string): string[] {
	return value.trim().replace(/^#+/u, '').split('/').map(normalizeTagSegment);
}

export function isValidTagPath(segments: readonly string[]): boolean {
	return (
		segments.length >= 1 &&
		segments.length <= MAX_TAG_DEPTH &&
		segments.every((segment) => isValidTagSegment(segment))
	);
}

/** UTF-8 bytes are the common unit shared by browser `File.size`, HTTP and export payloads. */
export function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

/** Preserves Markdown content while making platform-specific line endings deterministic. */
export function normalizeDocumentMarkdown(value: string): string {
	return value.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
}

export function isValidDocumentMarkdown(value: string): boolean {
	return !value.includes('\u0000') && utf8ByteLength(value) <= MAX_DOCUMENT_MARKDOWN_BYTES;
}

export function isObsidianImportSizeAllowed(bytes: number): boolean {
	return Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MAX_OBSIDIAN_IMPORT_BYTES;
}

/** Zero anchors are valid; a document only becomes invalid once the bounded collection overflows. */
export function isDocumentPassageCountAllowed(count: number): boolean {
	return Number.isSafeInteger(count) && count >= 0 && count <= MAX_DOCUMENT_PASSAGES;
}

export function normalizeSermonWorkflowState(
	value: unknown,
	fallback: SermonWorkflowState = 'idea'
): SermonWorkflowState {
	return isSermonWorkflowState(value) ? value : fallback;
}
