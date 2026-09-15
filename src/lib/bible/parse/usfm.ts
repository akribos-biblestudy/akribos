/**
 * USFM parser.
 *
 * USFM is the format Paratext produces and the one eBible.org and the Digital Bible Library publish,
 * so it is the most likely format for a translation added after launch. It is plain text with
 * backslash markers:
 *
 *   \id GEN
 *   \c 1
 *   \p
 *   \v 1 Im Anfang \w schuf|strong="H1254"\w* Gott …
 *   \v 2 \f + \fr 1:2 \ft Oder: wüst und leer\f* Und die Erde war …
 *
 * Only the markers that carry or delimit verse content are interpreted; the rest (paragraph styles,
 * layout hints, cross-reference apparatus) is skipped, since the reader renders verses rather than
 * reproducing a print layout.
 *
 * A single file may hold one book or the whole bible, and `\id` may be absent when the file is named
 * after its book, so the book can also come from the caller's file name.
 */

import { bookByOsisId } from '../books.ts';
import { findBookId } from '../book-names.ts';
import { strongIdsFromSource } from '../strong.ts';
import { finalizeSegments, pushText, type VerseSegment } from '../segments.ts';
import type { ParseEvent, ParseStream, ResourceMetadata, SourceInput } from './types.ts';
import { asChunks } from './types.ts';

/** USFM book codes, which are neither OSIS ids nor names: GEN, EXO, …, REV. */
const USFM_BOOK_CODES: Record<string, string> = {
	GEN: 'Gen',
	EXO: 'Exod',
	LEV: 'Lev',
	NUM: 'Num',
	DEU: 'Deut',
	JOS: 'Josh',
	JDG: 'Judg',
	RUT: 'Ruth',
	'1SA': '1Sam',
	'2SA': '2Sam',
	'1KI': '1Kgs',
	'2KI': '2Kgs',
	'1CH': '1Chr',
	'2CH': '2Chr',
	EZR: 'Ezra',
	NEH: 'Neh',
	EST: 'Esth',
	JOB: 'Job',
	PSA: 'Ps',
	PRO: 'Prov',
	ECC: 'Eccl',
	SNG: 'Song',
	ISA: 'Isa',
	JER: 'Jer',
	LAM: 'Lam',
	EZK: 'Ezek',
	DAN: 'Dan',
	HOS: 'Hos',
	JOL: 'Joel',
	AMO: 'Amos',
	OBA: 'Obad',
	JON: 'Jonah',
	MIC: 'Mic',
	NAM: 'Nah',
	HAB: 'Hab',
	ZEP: 'Zeph',
	HAG: 'Hag',
	ZEC: 'Zech',
	MAL: 'Mal',
	MAT: 'Matt',
	MRK: 'Mark',
	LUK: 'Luke',
	JHN: 'John',
	ACT: 'Acts',
	ROM: 'Rom',
	'1CO': '1Cor',
	'2CO': '2Cor',
	GAL: 'Gal',
	EPH: 'Eph',
	PHP: 'Phil',
	COL: 'Col',
	'1TH': '1Thess',
	'2TH': '2Thess',
	'1TI': '1Tim',
	'2TI': '2Tim',
	TIT: 'Titus',
	PHM: 'Phlm',
	HEB: 'Heb',
	JAS: 'Jas',
	'1PE': '1Pet',
	'2PE': '2Pet',
	'1JN': '1John',
	'2JN': '2John',
	'3JN': '3John',
	JUD: 'Jude',
	REV: 'Rev'
};

export function bookFromUsfmCode(code: string): number | undefined {
	const osisId = USFM_BOOK_CODES[code.trim().toUpperCase()];
	if (osisId) return bookByOsisId(osisId)?.id;
	// Fall back to the general name index, which also knows OSIS ids and German names.
	return findBookId(code);
}

export type UsfmOptions = {
	/** Used when the file has no `\id` marker, e.g. when the book is only in the file name. */
	fallbackBook?: number;
	/** Identity for the resource, since a USFM file usually says nothing about the translation. */
	metadata?: Partial<ResourceMetadata>;
};

export function parseUsfm(input: SourceInput, options: UsfmOptions = {}): ParseStream {
	return parse(input, options);
}

async function* parse(input: SourceInput, options: UsfmOptions): ParseStream {
	let book = options.fallbackBook;
	let chapter = 0;
	let verse = 0;
	let verseEnd: number | undefined;
	let segments: VerseSegment[] = [];
	let heading: string | undefined;
	let versesSeen = 0;
	let metadataEmitted = false;
	let title: string | undefined;

	const emitMetadata = (): ParseEvent => ({
		type: 'metadata',
		metadata: {
			id: (options.metadata?.id ?? title ?? 'USFM').replace(/[^\w]+/g, '').toUpperCase() || 'USFM',
			name: options.metadata?.name ?? title ?? 'Unbenannte Übersetzung',
			abbrev: options.metadata?.abbrev ?? title ?? 'USFM',
			language: options.metadata?.language ?? 'de',
			...(options.metadata?.licenseHtml ? { licenseHtml: options.metadata.licenseHtml } : {})
		}
	});

	const flushVerse = (): ParseEvent | undefined => {
		if (!book || chapter === 0 || verse === 0) return undefined;

		const finalized = finalizeSegments(segments);
		segments = [];
		if (finalized.length === 0) {
			verse = 0;
			return undefined;
		}

		versesSeen += 1;
		const event: ParseEvent = {
			type: 'verse',
			verse: {
				book,
				chapter,
				verse,
				...(verseEnd !== undefined ? { verseEnd } : {}),
				segments: finalized,
				...(heading ? { heading } : {})
			}
		};
		heading = undefined;
		verseEnd = undefined;
		verse = 0;
		return event;
	};

	for await (const rawLine of readLines(input)) {
		// Structural markers delimit content even when a source writes an entire paragraph on one line.
		// Character styles and word attributes remain together for appendInline().
		for (const line of rawLine.split(
			/(?=\\(?:id|h|toc1|c|v|s[12]?|ms1?|p|m|pi1?|nb|q[1-3]?|b|li1?)\s)/
		)) {
			// Markers can be followed by content on the same line: "\v 1 Im Anfang …".
			const match = /^\\(\w+\*?)\s*(.*)$/.exec(line.trim());

			if (!match) {
				// Continuation of the previous verse.
				if (verse > 0 && line.trim()) pushText(segments, ` ${line.trim()}`);
				continue;
			}

			const [, marker, rest = ''] = match;

			switch (marker) {
				case 'id': {
					const pending = flushVerse();
					if (pending) yield pending;
					chapter = verse = 0;
					segments = [];
					heading = undefined;
					const code = rest.split(/\s+/)[0] ?? '';
					const resolved = bookFromUsfmCode(code);
					book = resolved;
					if (!resolved) yield { type: 'warning', message: `unknown USFM book code "${code}"` };
					break;
				}

				case 'h':
				case 'toc1':
					title ??= rest.trim() || undefined;
					break;

				case 'c': {
					const pending = flushVerse();
					if (pending) yield pending;
					chapter = Number.parseInt(rest, 10) || 0;
					verse = 0;
					break;
				}

				case 'v': {
					const pending = flushVerse();
					if (pending) yield pending;

					if (!metadataEmitted) {
						yield emitMetadata();
						metadataEmitted = true;
					}

					// "\v 16-17 text" marks a merged range.
					const versePart = /^(\d+)(?:[-‑–](\d+))?\s*(.*)$/.exec(rest.trim());
					if (!versePart) {
						yield { type: 'warning', message: `unreadable verse marker: \\v ${rest}` };
						verse = 0;
						break;
					}

					verse = Number.parseInt(versePart[1]!, 10);
					const end = versePart[2] ? Number.parseInt(versePart[2], 10) : undefined;
					verseEnd = end !== undefined && end > verse ? end : undefined;
					appendInline(segments, versePart[3] ?? '', book ?? 1);

					if (versesSeen % 500 === 0 && versesSeen > 0) {
						yield { type: 'progress', done: versesSeen };
					}
					break;
				}

				// Section headings.
				case 's':
				case 's1':
				case 's2':
				case 'ms':
				case 'ms1': {
					const pending = flushVerse();
					if (pending) yield pending;
					heading = rest.trim() || undefined;
					break;
				}

				// Paragraph and poetry markers: they break the line but carry no content of their own.
				case 'p':
				case 'm':
				case 'pi':
				case 'pi1':
				case 'nb':
				case 'q':
				case 'q1':
				case 'q2':
				case 'q3':
				case 'b':
				case 'li':
				case 'li1':
					if (verse > 0) {
						if (marker.startsWith('q') || marker === 'b') segments.push({ kind: 'br' });
						if (rest.trim()) appendInline(segments, rest, book ?? 1);
					}
					break;

				default:
					// Everything else is front matter or apparatus. Content that belongs to the running verse
					// is still appended, so a translation is never silently truncated by an unknown marker.
					if (verse > 0 && rest.trim() && !IGNORED_MARKERS.has(marker!)) {
						appendInline(segments, rest, book ?? 1);
					}
					break;
			}
		}
	}
	const pending = flushVerse();
	if (pending) yield pending;
	if (!metadataEmitted) yield emitMetadata();
	yield { type: 'progress', done: versesSeen, total: versesSeen };
}

/** Markers whose content is apparatus rather than scripture. */
const IGNORED_MARKERS = new Set([
	'f',
	'fe',
	'fr',
	'ft',
	'fq',
	'fqa',
	'fk',
	'fv',
	'x',
	'xo',
	'xt',
	'rem',
	'ide',
	'sts',
	'toc2',
	'toc3',
	'mt',
	'mt1',
	'mt2',
	'mt3',
	'r',
	'd',
	'cl',
	'cp',
	'ca'
]);

/**
 * Handles the inline character markers that appear inside verse text.
 *
 * Word-level attributes are the modern way USFM carries Strong's numbers:
 *
 *   \w schuf|strong="H1254"\w*        \w Gott|H430\w*
 *
 * Footnotes (`\f … \f*`) and cross references (`\x … \x*`) are removed: the note text is editorial
 * and would otherwise be searchable as if it were scripture.
 */
function appendInline(segments: VerseSegment[], text: string, book: number): void {
	let rest = text;

	// Drop footnote and cross-reference spans, including unterminated ones at end of line.
	rest = rest.replace(/\\(f|fe|x)\b[\s\S]*?(\\\1\*|$)/g, ' ');

	const pattern = /\\(\w+)\s([\s\S]*?)\\\1\*/g;
	let cursor = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(rest)) !== null) {
		pushText(segments, rest.slice(cursor, match.index));
		cursor = match.index + match[0].length;

		const marker = match[1]!;
		const content = match[2]!;

		if (marker === 'w') {
			const [surface = '', ...attributes] = content.split('|');
			const strongAttribute =
				attributes.join('|').match(/strong="([^"]+)"/i)?.[1] ??
				attributes.join('|').match(/^([GH]?\d+(?:[\s,;]+[GH]?\d+)*)$/)?.[1];

			const strongs = strongAttribute ? strongIdsFromSource(strongAttribute, book) : [];
			const primary = strongs[0];
			const word = surface.trim();

			if (word && primary) {
				segments.push({
					kind: 'w',
					text: word,
					strong: primary,
					...(strongs.length > 1 ? { strongs } : {})
				});
			} else {
				pushText(segments, word);
			}
			continue;
		}

		if (marker === 'add' || marker === 'it' || marker === 'em' || marker === 'bd') {
			const inner = content.trim();
			if (inner) segments.push({ kind: 'em', text: inner });
			continue;
		}

		if (marker === 'wj') {
			// Words of Jesus may contain further markup; recurse into them.
			const children: VerseSegment[] = [];
			appendInline(children, content, book);
			if (children.length > 0) segments.push({ kind: 'wj', children });
			continue;
		}

		// Any other character style contributes its text.
		pushText(segments, content);
	}

	pushText(segments, rest.slice(cursor));
}

/** Splits a chunked source into lines without buffering the whole file. */
async function* readLines(input: SourceInput): AsyncGenerator<string, void, undefined> {
	let buffer = '';
	for await (const chunk of asChunks(input)) {
		buffer += chunk;
		let newline = buffer.indexOf('\n');
		while (newline !== -1) {
			yield buffer.slice(0, newline).replace(/\r$/, '');
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf('\n');
		}
	}
	if (buffer) yield buffer.replace(/\r$/, '');
}

export { readLines };
