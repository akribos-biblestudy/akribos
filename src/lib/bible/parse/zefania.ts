/**
 * Zefania XML parser.
 *
 * Zefania is the format of every translation bundled in `data/bibles/`. Structure:
 *
 *   <XMLBIBLE biblename="…">
 *     <INFORMATION><title/><identifier/><language/><rights/>…</INFORMATION>
 *     <BIBLEBOOK bnumber="1" bname="1 Mose" bsname="1Mo">
 *       <CHAPTER cnumber="1">
 *         <VERS vnumber="1">Im <gr str="7225">Anfang </gr><gr str="1254">schuf </gr>…</VERS>
 *
 * Points the real files force us to handle:
 *
 * - `<gr>` carries a bare Strong's number whose dictionary depends on the book, and optionally an
 *   `rmac` morphology code (only the Textus Receptus file has those).
 * - Tagged words include their trailing space *inside* the element, so naive concatenation yields
 *   "Buch , des". Spacing is repaired once here rather than per request.
 * - Luther 1912 wraps study notes in `<DIV><NOTE type="x-studynote">…</NOTE></DIV>`, which must not
 *   become part of the verse text.
 * - bibelkommentare.de's MyBible-derived export (elb_bk) tags a Strong's number the site hasn't
 *   mapped to a word yet as `<gr str="…">[?]</gr>`. That `[?]` is a placeholder from their own site,
 *   never real verse text, so it is dropped like a `<gr>` with no text at all.
 * - The interlinear file contains a duplicated `<CHAPTER cnumber="2">` in Galatians. Verses are
 *   emitted in source order and the ingester decides which duplicate to keep; see
 *   `src/lib/server/import/ingest-bible.ts` for the rule and why.
 */

import { normalizeSourceRevision } from './source-revision.ts';
import { strongIdsFromSource } from '../strong.ts';
import { finalizeSegments, pushText, tidySegmentSpacing, type VerseSegment } from '../segments.ts';
import { attribute, intAttribute, readXml } from './xml.ts';
import type { ParseEvent, ParseStream, ResourceMetadata, SourceInput } from './types.ts';

/** bibelkommentare.de's own marker for "this Strong's number has no word assigned yet". */
const UNASSIGNED_STRONG_PLACEHOLDER = '[?]';

export async function* parseZefania(input: SourceInput): ParseStream {
	const information: Record<string, string> = {};
	let biblename: string | undefined;
	let sourceRevision: string | undefined;
	let firstElement = true;

	let book: number | undefined;
	let chapter: number | undefined;
	let verse: number | undefined;
	let verseEnd: number | undefined;

	let segments: VerseSegment[] = [];
	/** Stack of open inline elements, so text is routed to the right collector. */
	let openWord: { strong: string | undefined; morph: string | undefined; text: string } | undefined;
	let openNote: { marker: string; text: string } | undefined;
	let informationField: string | undefined;
	let inVerse = false;
	let versesSeen = 0;
	let metadataEmitted = false;

	for await (const event of readXml(input)) {
		if (event.type === 'open') {
			if (firstElement && (event.name === 'xmlbible' || event.name === 'x-bible')) {
				sourceRevision = normalizeSourceRevision(attribute(event.attributes, 'revision'));
			}
			firstElement = false;
			switch (event.name) {
				case 'xmlbible':
				case 'x-bible':
					biblename = attribute(event.attributes, 'biblename');
					break;

				case 'information':
					break;

				case 'biblebook': {
					book = intAttribute(event.attributes, 'bnumber');
					if (book === undefined) {
						yield warn('a BIBLEBOOK element without a usable bnumber was skipped');
					}
					break;
				}

				case 'chapter':
					chapter = intAttribute(event.attributes, 'cnumber');
					break;

				case 'vers':
				case 'verse': {
					verse = intAttribute(event.attributes, 'vnumber', 'vers', 'v');
					verseEnd = intAttribute(event.attributes, 'vnumber_end', 'vend');
					segments = [];
					inVerse = true;
					break;
				}

				case 'gr':
				case 'w': {
					if (!inVerse) break;
					openWord = {
						strong: attribute(event.attributes, 'str', 'strong', 'lemma'),
						morph: attribute(event.attributes, 'rmac', 'morph'),
						text: ''
					};
					break;
				}

				case 'note':
					if (inVerse) openNote = { marker: attribute(event.attributes, 'n') ?? '', text: '' };
					break;

				case 'br':
					if (inVerse && !openWord && !openNote) segments.push({ kind: 'br' });
					break;

				case 'style':
				case 'em':
				case 'i':
					// Emphasis is handled on close, where the collected text is available.
					break;

				default:
					// INFORMATION children are metadata fields: <title>, <identifier>, <language>, …
					if (!inVerse && book === undefined) informationField = event.name;
					break;
			}
			continue;
		}

		if (event.type === 'text') {
			if (openWord) openWord.text += event.text;
			else if (openNote) openNote.text += event.text;
			else if (inVerse) pushText(segments, event.text);
			else if (informationField)
				information[informationField] = (information[informationField] ?? '') + event.text;
			continue;
		}

		// event.type === 'close'
		switch (event.name) {
			case 'gr':
			case 'w': {
				if (!openWord) break;
				const word = openWord;
				openWord = undefined;

				// Trailing whitespace belongs between words, not inside the clickable word itself.
				const trailing = /\s$/.test(word.text) ? ' ' : '';
				const text = word.text.trim();
				// One word may carry several numbers, e.g. str="8337-H3967" for "sechshundert".
				const strongs =
					word.strong && book !== undefined ? strongIdsFromSource(word.strong, book) : [];

				if (!text || text === UNASSIGNED_STRONG_PLACEHOLDER) {
					pushText(segments, trailing);
					break;
				}

				const primary = strongs[0];
				if (primary) {
					segments.push({
						kind: 'w',
						text,
						strong: primary,
						...(strongs.length > 1 ? { strongs } : {}),
						...(word.morph ? { morph: word.morph.toUpperCase() } : {})
					});
				} else {
					// A word whose Strong's number is missing or unusable still belongs in the text.
					pushText(segments, text);
					if (word.strong) {
						yield warn(
							`ignored unusable Strong's reference "${word.strong}" at ${book}:${chapter}:${verse}`
						);
					}
				}
				pushText(segments, trailing);
				break;
			}

			case 'note': {
				if (!openNote) break;
				const note = openNote;
				openNote = undefined;
				const text = note.text.replace(/\s+/g, ' ').trim();
				if (text) segments.push({ kind: 'note', marker: note.marker, text });
				break;
			}

			case 'vers':
			case 'verse': {
				if (!inVerse) break;
				inVerse = false;

				if (!metadataEmitted) {
					// Metadata is complete by the time the first verse closes.
					yield {
						type: 'metadata',
						metadata: buildMetadata(information, biblename, sourceRevision)
					};
					metadataEmitted = true;
				}

				if (book === undefined || chapter === undefined || verse === undefined) {
					yield warn(`skipped a verse with an incomplete reference (${book}:${chapter}:${verse})`);
					break;
				}

				const finalized = finalizeSegments(tidySegmentSpacing(segments));
				versesSeen += 1;

				yield {
					type: 'verse',
					verse: {
						book,
						chapter,
						verse,
						...(verseEnd !== undefined && verseEnd > verse ? { verseEnd } : {}),
						segments: finalized
					}
				};

				if (versesSeen % 500 === 0) yield { type: 'progress', done: versesSeen };
				break;
			}

			case 'chapter':
				chapter = undefined;
				break;

			case 'biblebook':
				book = undefined;
				break;

			default:
				informationField = undefined;
				break;
		}
	}

	if (!metadataEmitted) {
		yield { type: 'metadata', metadata: buildMetadata(information, biblename, sourceRevision) };
	}
	yield { type: 'progress', done: versesSeen, total: versesSeen };
}

function warn(message: string): ParseEvent {
	return { type: 'warning', message };
}

function buildMetadata(
	information: Record<string, string>,
	biblename: string | undefined,
	sourceRevision: string | undefined
): ResourceMetadata {
	const clean = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim() || undefined;

	const title = clean(information['title']) ?? clean(biblename) ?? 'Unbenannte Übersetzung';
	const identifier = clean(information['identifier']) ?? slug(title);
	const language = normalizeLanguage(clean(information['language']));
	const rights = clean(information['rights']);

	return {
		id: identifier.toUpperCase(),
		name: title,
		...(sourceRevision ? { sourceRevision } : {}),
		abbrev: shortenTitle(title),
		language,
		direction: language === 'hbo' ? 'rtl' : 'ltr',
		...(rights && rights.toLowerCase() !== 'unknown' ? { licenseHtml: rights } : {}),
		...(clean(information['description'])
			? { description: clean(information['description'])! }
			: {})
	};
}

/**
 * Derives a column header from a source title.
 *
 * Titles in the wild are descriptive rather than short — "Schlachter Bibel 1951 with Strong",
 * "Textus Receptus NT(Strongs)" — and a reader column has room for about twenty characters. The
 * mention of Strong's numbers and any parenthetical are noise here, since the reader shows tagged
 * words as such. The admin UI can always override the result.
 */
function shortenTitle(title: string): string {
	const short = title
		.replace(/\([^)]*\)/g, ' ')
		.replace(/\bwith\s+strongs?\b/gi, ' ')
		.replace(/\bstrongs?\b/gi, ' ')
		.replace(/\bbibel\b/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	return short || title;
}

/** Zefania uses ISO 639-2/B codes such as GER and GRC; map the ones we expect to BCP 47-ish tags. */
function normalizeLanguage(value: string | undefined): string {
	const code = value?.toLowerCase();
	switch (code) {
		case undefined:
		case '':
			return 'de';
		case 'ger':
		case 'deu':
		case 'de':
			return 'de';
		case 'grc':
		case 'gre':
		case 'ell':
			return 'grc';
		case 'heb':
		case 'hbo':
			return 'hbo';
		case 'eng':
		case 'en':
			return 'en';
		default:
			return code;
	}
}

function slug(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[^\w]+/g, '')
		.slice(0, 32)
		.toUpperCase();
}
