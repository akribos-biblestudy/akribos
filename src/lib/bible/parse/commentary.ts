/**
 * Commentary parsers.
 *
 * Commentaries have no single interchange format, so two shapes are accepted:
 *
 * **Delimited** — a reference and a body per row, which is what spreadsheet exports and most
 * self-written commentaries look like. The body may contain HTML or Markdown-ish emphasis:
 *
 *   "Joh 3,16","Der bekannteste Vers der Bibel. **Also** meint hier: auf diese Weise."
 *   Röm 8,28   Nicht alles ist gut, aber Gott wirkt in allem zum Guten.
 *
 * **ThML** — the format the Christian Classics Ethereal Library publishes, where commentary sections
 * are `<div>` elements carrying a scripture reference:
 *
 *   <div class="Section" title="Commentary on John 3:16"><scripRef passage="John 3:16"/>…</div>
 *
 * Both produce entries keyed to a verse or verse range. Bodies are sanitised to a small set of tags:
 * commentary text is displayed as HTML, and a commentary file is exactly the kind of upload that
 * should not be able to inject script into the page.
 */

import { parseReference } from '../reference.ts';
import { autoLinkProse } from '../auto-link.ts';
import { attribute, readXml } from './xml.ts';
import { splitDelimited } from './detect.ts';
import { readLines } from './usfm.ts';
import type { ParseStream, ResourceMetadata, SourceInput } from './types.ts';

export type CommentaryOptions = {
	metadata?: Partial<ResourceMetadata>;
};

export function parseCommentaryCsv(
	input: SourceInput,
	options: CommentaryOptions = {}
): ParseStream {
	return parseDelimited(input, options);
}

async function* parseDelimited(input: SourceInput, options: CommentaryOptions): ParseStream {
	let entries = 0;
	let skipped = 0;

	yield { type: 'metadata', metadata: commentaryMetadata(options) };

	for await (const rawLine of readLines(input)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const fields = splitDelimited(line);
		if (fields.length < 2) {
			skipped += 1;
			continue;
		}

		const reference = parseReference(stripQuotes(fields[0]!));
		const body = stripQuotes(fields.slice(1).join(' ')).trim();

		if (!reference || !body) {
			skipped += 1;
			if (skipped <= 5) {
				yield {
					type: 'warning',
					message: `skipped a commentary row without a usable reference: ${truncate(line)}`
				};
			}
			continue;
		}

		entries += 1;
		yield {
			type: 'commentaryEntry',
			entry: {
				book: reference.book,
				chapter: reference.chapter,
				...(reference.verse !== undefined ? { verseStart: reference.verse } : {}),
				...(reference.verseEnd !== undefined ? { verseEnd: reference.verseEnd } : {}),
				bodyHtml: sanitizeHtml(body)
			}
		};

		if (entries % 500 === 0) yield { type: 'progress', done: entries };
	}

	if (skipped > 5) {
		yield { type: 'warning', message: `${skipped} rows in total could not be read` };
	}
	yield { type: 'progress', done: entries, total: entries };
}

export async function* parseCommentaryThml(input: SourceInput): ParseStream {
	let entries = 0;
	let title: string | undefined;

	/** Reference of the section being read, its heading (if any), and the HTML collected for it. */
	let reference: ReturnType<typeof parseReference> | null = null;
	let sectionTitle: string | undefined;
	/**
	 * A CCEL section heading lives on the `<div title="…">` that wraps the `scripRef`/`scripCom`
	 * marker, e.g. `<div class="Section" title="Commentary on John 3:16">` — captured here as soon as
	 * that div opens, then claimed by the section the very next reference marker starts.
	 */
	let pendingDivTitle: string | undefined;
	let body = '';
	let depth = 0;
	let inTitle = false;

	const flush = ():
		| {
				book: number;
				chapter: number;
				verseStart?: number;
				verseEnd?: number;
				title?: string;
				bodyHtml: string;
		  }
		| undefined => {
		const text = sanitizeHtml(body);
		const current = reference;
		const currentTitle = sectionTitle;
		reference = null;
		sectionTitle = undefined;
		body = '';
		if (!current || !text) return undefined;

		return {
			book: current.book,
			chapter: current.chapter,
			...(current.verse !== undefined ? { verseStart: current.verse } : {}),
			...(current.verseEnd !== undefined ? { verseEnd: current.verseEnd } : {}),
			...(currentTitle ? { title: currentTitle } : {}),
			bodyHtml: text
		};
	};

	for await (const event of readXml(input)) {
		if (event.type === 'open') {
			const divTitle = attribute(event.attributes, 'title');
			if (divTitle) pendingDivTitle = divTitle;

			if (event.name === 'scripref' || event.name === 'scripcom') {
				// A reference marker starts a new section; the previous one is complete.
				const passage = attribute(event.attributes, 'passage', 'parsed', 'value');
				const pending = flush();
				if (pending) {
					entries += 1;
					yield { type: 'commentaryEntry', entry: pending };
				}
				reference = passage ? parseReference(normalizePassage(passage)) : null;
				sectionTitle = pendingDivTitle;
				pendingDivTitle = undefined;
				if (passage && !reference) {
					yield { type: 'warning', message: `unreadable passage reference "${passage}"` };
				}
				continue;
			}

			if (event.name === 'title' && depth < 3) {
				inTitle = true;
				continue;
			}

			if (reference && KEEP_TAGS.has(event.name)) body += `<${event.name}>`;
			depth += 1;
			continue;
		}

		if (event.type === 'text') {
			if (inTitle) title = (title ?? '') + event.text;
			else if (reference) body += escapeHtml(event.text);
			continue;
		}

		if (event.name === 'title') {
			inTitle = false;
			title = title?.replace(/\s+/g, ' ').trim() || undefined;
			continue;
		}

		if (reference && KEEP_TAGS.has(event.name)) body += `</${event.name}>`;
		depth = Math.max(0, depth - 1);
	}

	const pending = flush();
	if (pending) {
		entries += 1;
		yield { type: 'commentaryEntry', entry: pending };
	}

	yield {
		type: 'metadata',
		metadata: commentaryMetadata({ metadata: title ? { name: title, abbrev: title } : {} })
	};
	yield { type: 'progress', done: entries, total: entries };
}

/**
 * Zefania's dictionary markup is also used for verse commentaries. A typical item looks like:
 *
 *   <item id="Psalms 1:1" target="19;1;1">
 *     <reflink mscope="19;1;1-6"/>
 *     <description>...</description>
 *   </item>
 *
 * `target` and `mscope` use Zefania's numeric book ids, so they line up with our canonical ids.
 */
export async function* parseZefaniaCommentary(input: SourceInput): ParseStream {
	const information: Record<string, string> = {};
	let informationField: string | undefined;
	let inInformation = false;
	let metadataEmitted = false;
	let item:
		| {
				id?: string;
				target?: string;
				scope?: string;
				descriptions: string[];
		  }
		| undefined;
	let description = '';
	let inDescription = false;
	let entries = 0;

	for await (const event of readXml(input)) {
		if (event.type === 'open') {
			if (event.name === 'information') {
				inInformation = true;
			} else if (inInformation) {
				informationField = event.name;
			} else if (event.name === 'item') {
				item = {
					id: attribute(event.attributes, 'id'),
					target: attribute(event.attributes, 'target'),
					descriptions: []
				};
			} else if (item && event.name === 'reflink') {
				item.scope = attribute(event.attributes, 'mscope', 'target');
			} else if (item && event.name === 'description') {
				description = '';
				inDescription = true;
			}
			continue;
		}

		if (event.type === 'text') {
			if (inDescription) description += event.text;
			else if (inInformation && informationField) {
				information[informationField] = (information[informationField] ?? '') + event.text;
			}
			continue;
		}

		if (event.name === 'description' && inDescription) {
			const text = description.replace(/\s+/g, ' ').trim();
			if (text) item?.descriptions.push(text);
			description = '';
			inDescription = false;
		} else if (event.name === 'information') {
			inInformation = false;
			informationField = undefined;
			if (!metadataEmitted) {
				yield { type: 'metadata', metadata: zefaniaCommentaryMetadata(information) };
				metadataEmitted = true;
			}
		} else if (event.name === 'item' && item) {
			const reference =
				parseZefaniaScope(item.scope ?? item.target) ?? parseReference(item.id ?? '');
			if (!reference || item.descriptions.length === 0) {
				yield {
					type: 'warning',
					message: `skipped a Zefania commentary item without a usable reference or description (${item.id ?? item.target ?? '?'})`
				};
			} else {
				entries += 1;
				yield {
					type: 'commentaryEntry',
					entry: {
						book: reference.book,
						chapter: reference.chapter,
						...(reference.verse !== undefined ? { verseStart: reference.verse } : {}),
						...(reference.verseEnd !== undefined ? { verseEnd: reference.verseEnd } : {}),
						bodyHtml: item.descriptions.map((part) => `<p>${sanitizeHtml(part)}</p>`).join('')
					}
				};
			}
			item = undefined;
			if (entries > 0 && entries % 500 === 0) yield { type: 'progress', done: entries };
		} else if (inInformation) {
			informationField = undefined;
		}
	}

	if (!metadataEmitted) {
		yield { type: 'metadata', metadata: zefaniaCommentaryMetadata(information) };
	}
	yield { type: 'progress', done: entries, total: entries };
}

function parseZefaniaScope(value: string | undefined): ReturnType<typeof parseReference> {
	if (!value) return null;
	const match = /^\s*(\d+)\s*;\s*(\d+)(?:\s*;\s*(\d+)(?:\s*[-–]\s*(\d+))?)?/.exec(value);
	if (!match) return null;

	const book = Number(match[1]);
	const chapter = Number(match[2]);
	const verse = match[3] ? Number(match[3]) : undefined;
	const verseEnd = match[4] ? Number(match[4]) : undefined;
	if (book < 1 || book > 66 || chapter < 1 || !Number.isSafeInteger(chapter)) return null;
	return {
		book,
		chapter,
		...(verse !== undefined && verse > 0 ? { verse } : {}),
		...(verseEnd !== undefined && verse !== undefined && verseEnd >= verse ? { verseEnd } : {})
	};
}

function zefaniaCommentaryMetadata(information: Record<string, string>): ResourceMetadata {
	const clean = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim() || undefined;
	const name = clean(information['title']) ?? clean(information['subject']) ?? 'Kommentar';
	const id = clean(information['identifier']) ?? name;
	const language = clean(information['language'])?.toLowerCase();
	const rights = clean(information['rights']);

	return {
		id:
			id
				.replace(/[^\w]+/g, '')
				.toUpperCase()
				.slice(0, 32) || 'COMMENTARY',
		name,
		abbrev: name,
		language: language === 'ger' || language === 'deu' ? 'de' : (language ?? 'de'),
		...(rights && rights.toLowerCase() !== 'unknown' ? { licenseHtml: rights } : {}),
		...(clean(information['description'])
			? { description: clean(information['description'])! }
			: {})
	};
}

function commentaryMetadata(options: CommentaryOptions): ResourceMetadata {
	const name = options.metadata?.name ?? 'Kommentar';
	return {
		id:
			(options.metadata?.id ?? name)
				.replace(/[^\w]+/g, '')
				.toUpperCase()
				.slice(0, 32) || 'COMMENTARY',
		name,
		abbrev: options.metadata?.abbrev ?? name,
		language: options.metadata?.language ?? 'de',
		...(options.metadata?.licenseHtml ? { licenseHtml: options.metadata.licenseHtml } : {})
	};
}

/** "John 3:16" and "Joh 3,16-18" both parse; ThML uses English names and dots. */
function normalizePassage(passage: string): string {
	return passage
		.trim()
		.replace(/\.(?=\d)/g, ' ')
		.replace(/\s+/g, ' ');
}

/** Inline formatting worth keeping from a commentary body. */
const KEEP_TAGS = new Set(['p', 'br', 'em', 'i', 'strong', 'b', 'ul', 'ol', 'li', 'blockquote']);

/**
 * Reduces an untrusted body to plain text plus a small set of formatting tags.
 *
 * Everything is escaped first and only the allowed tags are put back, so no attribute — and therefore
 * no event handler, style or URL — survives from the source. Bible references mentioned in the text
 * are auto-linked last, once the result is already safe, limited-tag HTML that {@link autoLinkProse}
 * can scan without risking any markup it does not already know how to leave alone.
 */
export function sanitizeHtml(value: string): string {
	// OSIS x-p milestones are paragraphs even though their start/end are self-closing divs.
	// Preserve these boundaries before the allow-list discards source attributes.
	const paragraphs = value
		.replace(/<div\b[^>]*\/>/gi, (tag) => {
			if (!/\btype\s*=\s*(["'])x-p\1/i.test(tag)) return tag;
			if (/\beID\s*=/i.test(tag)) return '</p>';
			if (/\bsID\s*=/i.test(tag)) return '<p>';
			return tag;
		})
		.replace(/<lb\b[^>]*\/>/gi, '<br>');
	const escaped = escapeHtml(stripTags(paragraphs));
	const withTags = escaped.replace(
		/&lt;(\/?)(p|br|em|i|strong|b|ul|ol|li|blockquote)\s*\/?&gt;/gi,
		(_match, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`
	);

	const rendered = withTags
		// Markdown-style emphasis is common in hand-written commentary files.
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>')
		.replace(/\s+/g, ' ')
		.trim();

	return autoLinkProse(rendered);
}

/** Removes tags that are not in the allow list, keeping their text content. */
function stripTags(value: string): string {
	return value.replace(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g, (match, tag: string) =>
		KEEP_TAGS.has(tag.toLowerCase())
			? `<${match.startsWith('</') ? '/' : ''}${tag.toLowerCase()}>`
			: ' '
	);
}

/**
 * Escapes markup characters, leaving entities that are already escaped alone.
 *
 * A commentary body may arrive as plain text or as HTML, so `&lt;` in the source must survive as
 * `&lt;` rather than being turned into `&amp;lt;` and displayed literally.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith('"') && trimmed.endsWith('"')
		? trimmed.slice(1, -1).replaceAll('""', '"')
		: trimmed;
}

function truncate(value: string): string {
	return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}
