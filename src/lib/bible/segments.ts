/**
 * Structured verse content.
 *
 * A verse is a list of segments. Import parses the source markup once into this shape; the reader
 * renders it directly. That replaces the old `strongs_extras.py` template filter, which rebuilt
 * HTML on every request with a chain of string replacements — including a global
 * `s.replace(',', ', ')` that also rewrote commas inside HTML attributes and numbers.
 *
 * The representation is deliberately compact, because it is stored as JSON for every verse of every
 * translation: plain runs are bare strings and optional fields are omitted rather than set to null.
 */

/** A run of plain text. */
export type TextSegment = string;

/** A word carrying a Strong's number, which the reader turns into a clickable lookup. */
export type WordSegment = {
	readonly kind: 'w';
	/** The word as this translation renders it. */
	readonly text: string;
	/** Canonical Strong's id of the primary sense, e.g. `G26`. Shown and linked by default. */
	readonly strong: string;
	/**
	 * All ids this word carries, including `strong`, and only present when there is more than one.
	 *
	 * German renders a Hebrew phrase as a single word often enough to matter: "sechshundert" is
	 * H8337 (six) plus H3967 (hundred), and Elberfelder writes that as `str="8337-H3967"`. There are
	 * 2,726 such words in the bundled Elberfelder text.
	 */
	readonly strongs?: readonly string[];
	/** Robinson morphology code, when the source provides one. */
	readonly morph?: string;
};

/** A footnote or study note attached at this position. */
export type NoteSegment = {
	readonly kind: 'note';
	/** Marker shown inline, e.g. `1` or `a`. Empty means "use a generic marker". */
	readonly marker: string;
	readonly text: string;
};

/** Emphasised text — italics in most sources, marking words added by the translators. */
export type EmphasisSegment = {
	readonly kind: 'em';
	readonly text: string;
};

/** A line break inside a verse, as used in poetry. */
export type BreakSegment = { readonly kind: 'br' };

/** Words of Jesus, where a source marks them. */
export type RedLetterSegment = {
	readonly kind: 'wj';
	readonly children: readonly VerseSegment[];
};

export type VerseSegment =
	TextSegment | WordSegment | NoteSegment | EmphasisSegment | BreakSegment | RedLetterSegment;

export function isTextSegment(segment: VerseSegment): segment is TextSegment {
	return typeof segment === 'string';
}

/**
 * Splits off the first visible word so a reader can keep a verse/chapter number attached to it.
 *
 * The whitespace stays at the beginning of the remainder. Rendering both arrays consecutively
 * therefore reproduces the original text exactly.
 */
export function splitVerseLead(
	segments: readonly VerseSegment[]
): [VerseSegment[], VerseSegment[]] {
	const lead: VerseSegment[] = [];
	const rest = [...segments];

	while (rest.length > 0) {
		const segment = rest.shift()!;
		if (typeof segment === 'string') {
			const boundary = segment.search(/\s/);
			if (boundary < 0) {
				lead.push(segment);
				continue;
			}
			if (boundary > 0) lead.push(segment.slice(0, boundary));
			rest.unshift(segment.slice(boundary));
			break;
		}

		lead.push(segment);
		if (segment.kind === 'w' || segment.kind === 'em' || segment.kind === 'wj') break;
		if (segment.kind === 'br') break;
	}

	// Closing punctuation can be stored as the next plain segment. Keep it with the first word too.
	const next = rest[0];
	if (typeof next === 'string') {
		const punctuation = /^[,.;:!?…)\]}»”’]+/.exec(next);
		if (punctuation) {
			lead.push(punctuation[0]);
			const remainder = next.slice(punctuation[0].length);
			if (remainder) rest[0] = remainder;
			else rest.shift();
		}
	}

	return [lead, rest];
}

/**
 * Flattens segments to the plain text used for full-text search, snippets and copying.
 *
 * Notes are excluded: they are editorial apparatus, and including them would make searches match
 * words that are not in the verse.
 */
export function segmentsToText(segments: readonly VerseSegment[]): string {
	let out = '';
	for (const segment of segments) {
		if (typeof segment === 'string') out += segment;
		else if (segment.kind === 'w' || segment.kind === 'em') out += segment.text;
		else if (segment.kind === 'br') out += ' ';
		else if (segment.kind === 'wj') out += segmentsToText(segment.children);
	}
	return normalizeWhitespace(out);
}

export type TaggedWord = {
	/** 0-based index within the verse, in reading order. */
	position: number;
	text: string;
	strong: string;
	morph?: string;
};

/**
 * Extracts the Strong-tagged words of a verse in reading order.
 *
 * Used at import time to fill `verse_words`, which is what makes "every place this word occurs" and
 * the rendering statistics ordinary SQL queries.
 *
 * A word carrying several Strong's numbers yields one entry per number, all sharing the same
 * position, so a search for any of them finds the verse.
 */
export function wordsFromSegments(segments: readonly VerseSegment[]): TaggedWord[] {
	const words: TaggedWord[] = [];
	let position = 0;

	const walk = (list: readonly VerseSegment[]): void => {
		for (const segment of list) {
			if (typeof segment === 'string') continue;

			if (segment.kind === 'w') {
				for (const strong of segment.strongs ?? [segment.strong]) {
					words.push({
						position,
						text: segment.text,
						strong,
						...(segment.morph ? { morph: segment.morph } : {})
					});
				}
				position += 1;
			} else if (segment.kind === 'wj') {
				walk(segment.children);
			}
		}
	};

	walk(segments);
	return words;
}

/** Collapses runs of whitespace and trims, without touching the characters themselves. */
export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

const CLOSING_PUNCTUATION = ',.;:!?)]»”’';
const OPENING_PUNCTUATION = '([«“‘';

/**
 * Repairs the spacing that tagged-word markup leaves behind, operating only on the plain runs
 * between words so the words themselves are never altered.
 *
 * Zefania puts the space that separates two words *inside* the preceding element —
 * `<gr str="976">Buch </gr> des <gr str="1078">Geschlechts </gr>,` — which on its own produces
 * "Buch des Geschlechts ,". Three rules are enough:
 *
 *  1. collapse runs of whitespace,
 *  2. drop a leading space that sits in front of closing punctuation,
 *  3. drop a trailing space that sits behind opening punctuation.
 */
export function tidySegmentSpacing(segments: VerseSegment[]): VerseSegment[] {
	return segments.map((segment) => {
		if (typeof segment !== 'string') return segment;

		let text = segment.replace(/\s+/g, ' ');

		if (text.length > 1 && text.startsWith(' ') && CLOSING_PUNCTUATION.includes(text[1]!)) {
			text = text.slice(1);
		}
		if (text.length > 1 && text.endsWith(' ') && OPENING_PUNCTUATION.includes(text.at(-2)!)) {
			text = text.slice(0, -1);
		}

		return text;
	});
}

/**
 * Appends text to a segment list, merging with a preceding plain run so the stored JSON does not
 * accumulate a segment per character of markup noise.
 */
export function pushText(segments: VerseSegment[], text: string): void {
	if (!text) return;
	const last = segments.at(-1);
	if (typeof last === 'string') segments[segments.length - 1] = last + text;
	else segments.push(text);
}

// --- partial highlighting ----------------------------------------------------

/**
 * A highlighted section of a verse, addressed by inclusive "word" indices — the same tokens
 * `countVerseWords` counts, in reading order across the whole verse. A verse rendered as a lead and a
 * remainder (see `splitVerseLead`) still shares one index space; `wordOffset` on `VerseText` is what
 * lets the remainder continue counting where the lead left off.
 */
export type HighlightRange = { start: number; end: number; color: string };

/**
 * The running state threaded through a verse's segments while assigning word indices: which index is
 * currently open, and whether the previous character was non-whitespace (so the next run continues
 * the same word rather than starting a new one, e.g. a `,` glued to the tagged word before it).
 */
export type HighlightCursor = { word: number; open: boolean };

export function initHighlightCursor(wordOffset = 0): HighlightCursor {
	return { word: wordOffset - 1, open: false };
}

/**
 * Rendering-only view of a verse's segments, split at word boundaries so a `HighlightRange` can paint
 * part of a plain-text or emphasis run without touching a tagged word, footnote or line break — those
 * stay whole tokens, matching how a reader actually selects "one or more words".
 */
export type DisplayChunk =
	| { kind: 'text'; text: string; color: string | null }
	| { kind: 'w'; segment: WordSegment; color: string | null }
	| { kind: 'em'; text: string; color: string | null }
	| { kind: 'note'; segment: NoteSegment }
	| { kind: 'br' }
	| { kind: 'wj'; children: DisplayChunk[] };

function colorAt(word: number, ranges: readonly HighlightRange[]): string | null {
	let color: string | null = null;
	for (const range of ranges) {
		if (word >= range.start && word <= range.end) color = range.color;
	}
	return color;
}

/**
 * Splits `text` into whitespace-delimited runs, advancing `cursor` by one word for every run that
 * does not continue the token open from a previous call (which is how a plain run glued directly
 * after a tagged word, with no separating space, stays part of that same word).
 *
 * `atomic` is for tagged words and emphasis-as-one-token cases where the text must never be split
 * even if it happens to contain internal whitespace — the whole string is one run, one word index.
 */
function emitRuns(
	text: string,
	ranges: readonly HighlightRange[],
	cursor: HighlightCursor,
	atomic: boolean
): { text: string; color: string | null }[] {
	if (atomic) {
		if (!text) return [];
		if (!cursor.open) cursor.word += 1;
		cursor.open = true;
		return [{ text, color: colorAt(cursor.word, ranges) }];
	}

	const pieces = text.split(/(\s+)/).filter((piece) => piece !== '');
	const out: { text: string; color: string | null }[] = [];
	for (const piece of pieces) {
		if (/^\s+$/.test(piece)) {
			// Whitespace between two words of the same highlight is part of one continuous marked
			// phrase and should paint too, so the highlight does not visibly break at every word
			// boundary; whitespace at the edge of a highlight, or between two differently-coloured
			// ones, stays uncoloured. `cursor.word + 1` is always the index the next word will get
			// (whitespace only ever closes the current token), so this can look ahead before that
			// word is actually reached.
			const previousColor = colorAt(cursor.word, ranges);
			const nextColor = colorAt(cursor.word + 1, ranges);
			out.push({
				text: piece,
				color: previousColor && previousColor === nextColor ? previousColor : null
			});
			cursor.open = false;
			continue;
		}
		if (!cursor.open) cursor.word += 1;
		out.push({ text: piece, color: colorAt(cursor.word, ranges) });
		cursor.open = true;
	}
	return out;
}

/**
 * Rebuilds one segment as `DisplayChunk`s, colouring the runs whose word index falls inside one of
 * `ranges`. Notes are excluded from the word count, the same way they are excluded from
 * `segmentsToText`; a line break closes the current token like whitespace does.
 */
export function highlightSegment(
	segment: VerseSegment,
	ranges: readonly HighlightRange[],
	cursor: HighlightCursor
): DisplayChunk[] {
	if (typeof segment === 'string') {
		return emitRuns(segment, ranges, cursor, false).map(
			(run) => ({ kind: 'text', text: run.text, color: run.color }) as const
		);
	}

	if (segment.kind === 'w') {
		const [run] = emitRuns(segment.text, ranges, cursor, true);
		return [{ kind: 'w', segment, color: run?.color ?? null }];
	}

	if (segment.kind === 'em') {
		return emitRuns(segment.text, ranges, cursor, false).map(
			(run) => ({ kind: 'em', text: run.text, color: run.color }) as const
		);
	}

	if (segment.kind === 'note') return [{ kind: 'note', segment }];

	if (segment.kind === 'br') {
		cursor.open = false;
		return [{ kind: 'br' }];
	}

	// 'wj': words of Jesus recurse, sharing the same running cursor.
	return [{ kind: 'wj', children: highlightSegments(segment.children, ranges, cursor) }];
}

export function highlightSegments(
	segments: readonly VerseSegment[],
	ranges: readonly HighlightRange[],
	cursor: HighlightCursor
): DisplayChunk[] {
	const out: DisplayChunk[] = [];
	for (const segment of segments) out.push(...highlightSegment(segment, ranges, cursor));
	return out;
}

/**
 * Total number of highlightable words in a verse, in the same index space `HighlightRange` uses.
 * Selecting the full range (`{ start: 0, end: countVerseWords(segments) - 1 }`) is how the reader
 * decides a selection covers the whole verse and should behave like the existing verse-wide highlight
 * instead of a translation-specific one.
 */
export function countVerseWords(segments: readonly VerseSegment[]): number {
	const cursor = initHighlightCursor();
	highlightSegments(segments, [], cursor);
	return cursor.word + 1;
}

/**
 * Locates the inclusive word-index range that overlaps a character span within a verse's flattened
 * text (as produced by `segmentsToText`), using the same whitespace tokenisation as
 * `highlightSegment`. Used to turn a browser text selection — which only knows character offsets —
 * into the word range a highlight is stored against. Returns `null` when the span does not overlap
 * any word, e.g. a selection that landed entirely on whitespace.
 */
export function wordRangeForCharSpan(
	text: string,
	charStart: number,
	charEnd: number
): { start: number; end: number } | null {
	const pieces = text.split(/(\s+)/).filter((piece) => piece !== '');
	let pos = 0;
	let word = -1;
	let start: number | null = null;
	let end: number | null = null;

	for (const piece of pieces) {
		const isWhitespace = /^\s+$/.test(piece);
		const pieceStart = pos;
		const pieceEnd = pos + piece.length;
		if (!isWhitespace) {
			word += 1;
			if (pieceEnd > charStart && pieceStart < charEnd) {
				if (start === null) start = word;
				end = word;
			}
		}
		pos = pieceEnd;
	}

	return start === null || end === null ? null : { start, end };
}

/** Drops empty runs and trims the leading and trailing whitespace of a finished verse. */
export function finalizeSegments(segments: VerseSegment[]): VerseSegment[] {
	const out = segments.filter(
		(segment) => typeof segment !== 'string' || segment.trim().length > 0 || segment === ' '
	);

	const first = out[0];
	if (typeof first === 'string') {
		const trimmed = first.replace(/^\s+/, '');
		if (trimmed) out[0] = trimmed;
		else out.shift();
	}

	const last = out.at(-1);
	if (typeof last === 'string') {
		const trimmed = last.replace(/\s+$/, '');
		if (trimmed) out[out.length - 1] = trimmed;
		else out.pop();
	}

	return out;
}
