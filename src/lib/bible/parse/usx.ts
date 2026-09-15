/**
 * USX and USFX parsers.
 *
 * Both are XML serialisations of USFM, and both are what you get when downloading from eBible.org.
 * They differ in shape rather than in content:
 *
 *   USX   <chapter number="1" sid="GEN 1"/> <para style="p"><verse number="1" sid="GEN 1:1"/>Im …
 *   USFX  <book id="GEN"><c id="1"/><p><v id="1"/>Im Anfang …<ve/>
 *
 * USX uses milestone verses inside paragraphs, so text belongs to the most recently opened verse —
 * the same handling the milestone style of OSIS needs. USFX marks the end of a verse with `<ve/>`.
 *
 * Strong's numbers appear as `<char style="w" strong="H1254">` in USX and as an attribute on `<w>` in
 * USFX.
 */

import { strongIdsFromSource } from '../strong.ts';
import { finalizeSegments, pushText, type VerseSegment } from '../segments.ts';
import { bookFromUsfmCode } from './usfm.ts';
import { attribute, readXml } from './xml.ts';
import type { ParseEvent, ParseStream, ResourceMetadata, SourceInput } from './types.ts';

type Options = {
	metadata?: Partial<ResourceMetadata>;
};

export function parseUsx(input: SourceInput, options: Options = {}): ParseStream {
	return parse(input, options, 'usx');
}

export function parseUsfx(input: SourceInput, options: Options = {}): ParseStream {
	return parse(input, options, 'usfx');
}

async function* parse(input: SourceInput, options: Options, flavour: 'usx' | 'usfx'): ParseStream {
	let book: number | undefined;
	let chapter = 0;
	let verse = 0;
	let verseEnd: number | undefined;
	let segments: VerseSegment[] = [];
	let heading: string | undefined;

	let openWord: { strong: string | undefined; text: string } | undefined;
	/** Depth of elements whose text is apparatus rather than scripture (notes, references). */
	let suppressed = 0;
	let emphasis = 0;
	let headingDepth = 0;
	let title: string | undefined;
	let inTitle = false;
	let versesSeen = 0;
	let metadataEmitted = false;

	const emitMetadata = (): ParseEvent => ({
		type: 'metadata',
		metadata: {
			id:
				(options.metadata?.id ?? title ?? flavour).replace(/[^\w]+/g, '').toUpperCase() ||
				flavour.toUpperCase(),
			name: options.metadata?.name ?? title ?? 'Unbenannte Übersetzung',
			abbrev: options.metadata?.abbrev ?? title ?? flavour.toUpperCase(),
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

	for await (const event of readXml(input)) {
		if (event.type === 'open') {
			switch (event.name) {
				case 'book':
				case 'id': {
					const pending = flushVerse();
					if (pending) yield pending;
					chapter = verse = 0;
					segments = [];
					heading = undefined;
					const code = attribute(event.attributes, 'code', 'id');
					if (code) {
						const resolved = bookFromUsfmCode(code);
						book = resolved;
						if (!resolved) yield { type: 'warning', message: `unknown book code "${code}"` };
					}
					break;
				}

				case 'chapter':
				case 'c': {
					const pending = flushVerse();
					if (pending) yield pending;
					chapter = Number.parseInt(attribute(event.attributes, 'number', 'id') ?? '', 10) || 0;
					break;
				}

				case 'verse':
				case 'v': {
					const pending = flushVerse();
					if (pending) yield pending;

					if (!metadataEmitted) {
						yield emitMetadata();
						metadataEmitted = true;
					}

					const raw = attribute(event.attributes, 'number', 'id') ?? '';
					// "16-17" marks a merged range in both flavours.
					const parsed = /^(\d+)(?:[-‑–](\d+))?/.exec(raw.trim());
					verse = parsed ? Number.parseInt(parsed[1]!, 10) : 0;
					const end = parsed?.[2] ? Number.parseInt(parsed[2], 10) : undefined;
					verseEnd = end !== undefined && end > verse ? end : undefined;

					if (verse === 0) {
						yield { type: 'warning', message: `unreadable verse number "${raw}"` };
					}
					if (versesSeen % 500 === 0 && versesSeen > 0) {
						yield { type: 'progress', done: versesSeen };
					}
					break;
				}

				// End-of-verse milestone, USFX only.
				case 've': {
					const pending = flushVerse();
					if (pending) yield pending;
					break;
				}

				case 'char':
				case 'w': {
					const style = attribute(event.attributes, 'style') ?? event.name;
					const strong = attribute(event.attributes, 'strong', 's', 'lemma');

					if (style === 'w' || event.name === 'w') {
						openWord = { strong, text: '' };
					} else if (style === 'add' || style === 'it' || style === 'bd' || style === 'em') {
						emphasis += 1;
					}
					break;
				}

				case 'note':
				case 'f':
				case 'x':
					suppressed += 1;
					break;

				case 'para': {
					const style = attribute(event.attributes, 'style') ?? '';
					if (/^(s|ms|mt)\d?$/.test(style)) {
						const pending = flushVerse();
						if (pending) yield pending;
						headingDepth += 1;
						inTitle = /^mt/.test(style);
						heading = '';
					} else if (verse > 0 && /^q\d?$/.test(style)) {
						segments.push({ kind: 'br' });
					}
					break;
				}

				case 'h':
				case 'toc1':
					inTitle = true;
					break;

				case 'optionalline':
				case 'ob':
					if (verse > 0) segments.push({ kind: 'br' });
					break;

				default:
					break;
			}
			continue;
		}

		if (event.type === 'text') {
			if (suppressed > 0) continue;
			if (openWord) openWord.text += event.text;
			else if (headingDepth > 0) heading = (heading ?? '') + event.text;
			else if (inTitle) title = (title ?? '') + event.text;
			else if (verse > 0) {
				if (emphasis > 0 && event.text.trim()) segments.push({ kind: 'em', text: event.text });
				else pushText(segments, event.text);
			}
			continue;
		}

		switch (event.name) {
			case 'char':
			case 'w': {
				if (openWord) {
					const word = openWord;
					openWord = undefined;
					const trailing = /\s$/.test(word.text) ? ' ' : '';
					const text = word.text.trim();
					const strongs = word.strong && book ? strongIdsFromSource(word.strong, book) : [];
					const primary = strongs[0];

					if (text && primary) {
						segments.push({
							kind: 'w',
							text,
							strong: primary,
							...(strongs.length > 1 ? { strongs } : {})
						});
					} else if (text) {
						pushText(segments, text);
					}
					pushText(segments, trailing);
				} else if (emphasis > 0) {
					emphasis -= 1;
				}
				break;
			}

			case 'note':
			case 'f':
			case 'x':
				suppressed = Math.max(0, suppressed - 1);
				break;

			case 'para':
				if (headingDepth > 0) {
					headingDepth -= 1;
					heading = heading?.replace(/\s+/g, ' ').trim() || undefined;
					if (inTitle) {
						title = title ?? heading ?? undefined;
						inTitle = false;
						heading = undefined;
					}
				}
				break;

			case 'h':
			case 'toc1':
				inTitle = false;
				title = title?.replace(/\s+/g, ' ').trim() || undefined;
				break;

			case 'chapter':
			case 'c':
			case 'book': {
				const pending = flushVerse();
				if (pending) yield pending;
				break;
			}

			default:
				break;
		}
	}

	const pending = flushVerse();
	if (pending) yield pending;
	if (!metadataEmitted) yield emitMetadata();
	yield { type: 'progress', done: versesSeen, total: versesSeen };
}
