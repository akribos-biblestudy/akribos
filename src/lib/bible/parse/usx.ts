/** USX/USFX milestone parsers. XML structure and verse boundaries overlap. */
import { strongIdsFromSource } from '../strong.ts';
import {
	finalizeSegments,
	normalizeWhitespace,
	pushText,
	type VerseSegment,
	type WordSegment
} from '../segments.ts';
import { STRONG_ASSIGNMENT_NOTE_TEXT, strongAssignmentNotes } from '../strong-assignment.ts';
import { bookFromUsfmCode } from './usfm.ts';
import { attribute, readXml } from './xml.ts';
import type { ParseEvent, ParseStream, ResourceMetadata, SourceInput } from './types.ts';

type Options = { metadata?: Partial<ResourceMetadata> };
type Frame = {
	name: string;
	style: string;
	suppressed?: boolean;
	emphasis?: boolean;
	heading?: string;
	title?: string;
	note?: { marker: string; text: string };
	word?: { strong?: string; text: string; unreviewed: boolean };
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
	const unreviewedWords = new Set<WordSegment>();
	let heading: string | undefined;
	let verseHeading: string | undefined;
	let headingNotes: VerseSegment[] = [];
	let title: string | undefined;
	let versesSeen = 0;
	let metadataEmitted = false;
	const stack: Frame[] = [];

	const emitMetadata = (): ParseEvent => ({
		type: 'metadata',
		metadata: {
			id:
				(options.metadata?.id ?? title ?? flavour).replace(/[^\w]+/g, '').toUpperCase() ||
				flavour.toUpperCase(),
			name: title ?? 'Unbenannte Übersetzung',
			abbrev: title ?? flavour.toUpperCase(),
			language: 'de',
			...options.metadata
		}
	});
	const flushVerse = (): ParseEvent | undefined => {
		// Use the existing word-bound note contract. Explicit source notes already attached to a
		// word take precedence, so a status attribute and a note never create duplicate warnings.
		const alreadyMarked = new Set(strongAssignmentNotes(segments).map(({ word }) => word));
		const annotated: VerseSegment[] = [];
		for (const segment of segments) {
			annotated.push(segment);
			if (
				typeof segment !== 'string' &&
				segment.kind === 'w' &&
				unreviewedWords.has(segment) &&
				!alreadyMarked.has(segment)
			) {
				annotated.push({ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT });
			}
		}
		const finalized = finalizeSegments(annotated);
		const start = verse;
		const end = verseEnd;
		segments = [];
		unreviewedWords.clear();
		verse = 0;
		verseEnd = undefined;
		if (!book || !chapter || !start || finalized.length === 0) return;
		versesSeen += 1;
		const event: ParseEvent = {
			type: 'verse',
			verse: {
				book,
				chapter,
				verse: start,
				...(end ? { verseEnd: end } : {}),
				segments: finalized,
				...(verseHeading ? { heading: verseHeading } : {})
			}
		};
		verseHeading = undefined;
		return event;
	};

	for await (const event of readXml(input)) {
		if (event.type === 'open') {
			if (stack.length === 0 && event.name !== flavour)
				throw new Error(`expected <${flavour}> root element`);
			const style = attribute(event.attributes, 'style') ?? event.name;
			const frame: Frame = { name: event.name, style };
			const suppressed = stack.some((parent) => parent.suppressed);
			const inNote = stack.some((parent) => parent.note);
			stack.push(frame);
			if (suppressed || inNote) continue;

			if (['note', 'f', 'x'].includes(event.name)) {
				const caller = attribute(event.attributes, 'caller') ?? '';
				if (verse > 0 || stack.some((parent) => parent.heading !== undefined))
					frame.note = { marker: caller === '+' || caller === '-' ? '' : caller, text: '' };
				else frame.suppressed = true;
				continue;
			}
			if (event.name === 'book' || event.name === 'id') {
				const pending = flushVerse();
				if (pending) yield pending;
				chapter = 0;
				heading = undefined;
				headingNotes = [];
				const code = attribute(event.attributes, 'code', 'id') ?? '';
				book = bookFromUsfmCode(code);
				if (!book) yield { type: 'warning', message: `unknown book code "${code}"` };
			} else if (event.name === 'chapter' || event.name === 'c') {
				const pending = flushVerse();
				if (pending) yield pending;
				heading = undefined;
				headingNotes = [];
				const raw = attribute(event.attributes, 'number', 'id') ?? '';
				chapter = /^\d+$/.test(raw) ? Number(raw) : 0;
				if (chapter > 200) throw new Error(`invalid chapter number "${raw}"`);
			} else if (event.name === 'verse' || event.name === 'v' || event.name === 've') {
				const pending = flushVerse();
				if (pending) yield pending;
				if (event.name === 've' || attribute(event.attributes, 'eid')) continue;
				if (!metadataEmitted) {
					yield emitMetadata();
					metadataEmitted = true;
				}
				const raw = attribute(event.attributes, 'number', 'id') ?? '';
				const parsed = /^(\d+)(?:[-‑–](\d+))?$/.exec(raw);
				if (
					!parsed ||
					Number(parsed[1]) < 1 ||
					Number(parsed[1]) > 250 ||
					(parsed[2] && (Number(parsed[2]) < Number(parsed[1]) || Number(parsed[2]) > 250))
				) {
					throw new Error(`unsupported verse number "${raw}"`);
				}
				if (!chapter) throw new Error(`verse "${raw}" without a valid chapter`);
				verse = Number(parsed[1]);
				verseHeading = heading;
				heading = undefined;
				segments.push(...headingNotes);
				headingNotes = [];
				verseEnd = parsed[2] ? Number(parsed[2]) : undefined;
			} else if (
				event.name === 'para' ||
				(flavour === 'usfx' && /^(p|q\d?|s\d?|h|toc1)$/.test(event.name))
			) {
				if (/^(s|ms)\d?$/.test(style) || /^(sp|qa|r|mr)$/.test(style)) {
					// A section boundary may occur inside a verse. Keep its continuation until
					// the actual verse milestone, and attach the heading to the next verse.
					frame.heading = '';
				} else if (/^(h\d?|toc[123]|mt\d?)$/.test(style)) {
					frame.title = '';
				} else if (/^(i\w*|rem|cl|cp|cd|periph|restore)$/.test(style)) {
					frame.suppressed = true;
				} else if (verse > 0) {
					if (/^(q\d?|qm\d?|b)$/.test(style)) segments.push({ kind: 'br' });
					else pushText(segments, ' ');
				}
			} else if (event.name === 'char' || event.name === 'w') {
				if (/^(ca|va|vp|cat)$/.test(style)) frame.suppressed = true;
				else if (style === 'w')
					frame.word = {
						strong: attribute(event.attributes, 'strong', 's', 'lemma'),
						text: '',
						unreviewed:
							attribute(event.attributes, 'x-akribos-status')?.trim().toLowerCase() === 'unreviewed'
					};
				else if (/^(add|it|bd|bdit|em|tl)$/.test(style)) frame.emphasis = true;
			} else if (event.name === 'figure') frame.suppressed = true;
			else if (['optionalline', 'optbreak', 'ob'].includes(event.name) && verse > 0)
				segments.push({ kind: 'br' });
			continue;
		}

		if (event.type === 'text') {
			if (stack.some((frame) => frame.suppressed)) continue;
			const note = stack.find((frame) => frame.note)?.note;
			const titleFrame = stack.find((frame) => frame.title !== undefined);
			const headingFrame = stack.find((frame) => frame.heading !== undefined);
			const word = stack.find((frame) => frame.word)?.word;
			if (note) note.text += event.text;
			else if (titleFrame) titleFrame.title += event.text;
			else if (headingFrame) headingFrame.heading += event.text;
			else if (word) word.text += event.text;
			else if (verse > 0) {
				if (stack.some((frame) => frame.emphasis)) segments.push({ kind: 'em', text: event.text });
				else pushText(segments, event.text);
			}
			continue;
		}

		const frame = stack.pop()!;
		if (frame.note) {
			const text = normalizeWhitespace(frame.note.text);
			if (text)
				(stack.some((parent) => parent.heading !== undefined) ? headingNotes : segments).push({
					kind: 'note',
					marker: frame.note.marker,
					text
				});
		} else if (frame.word && verse > 0) {
			const text = frame.word.text.trim();
			const strongs = frame.word.strong && book ? strongIdsFromSource(frame.word.strong, book) : [];
			if (/^\s/.test(frame.word.text)) pushText(segments, ' ');
			if (text && strongs[0]) {
				const word: WordSegment = {
					kind: 'w',
					text,
					strong: strongs[0],
					...(strongs.length > 1 ? { strongs } : {})
				};
				segments.push(word);
				if (frame.word.unreviewed) unreviewedWords.add(word);
			} else pushText(segments, text);
			if (/\s$/.test(frame.word.text)) pushText(segments, ' ');
		} else if (frame.heading !== undefined) {
			heading =
				normalizeWhitespace([heading, frame.heading].filter(Boolean).join(' — ')) || undefined;
		} else if (frame.title !== undefined) {
			title ??= normalizeWhitespace(frame.title) || undefined;
		}
		// USFX wraps a complete book; USX's <book> is only its identification marker.
		if (event.name === 'book' && flavour === 'usfx') {
			const pending = flushVerse();
			if (pending) yield pending;
		}
	}
	const pending = flushVerse();
	if (pending) yield pending;
	if (!metadataEmitted) yield emitMetadata();
	yield { type: 'progress', done: versesSeen, total: versesSeen };
}
