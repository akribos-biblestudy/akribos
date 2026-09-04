/**
 * Adds links to Bible references in already-sanitised prose.
 *
 * The matcher is derived from the same book-name catalogue and delegates final parsing to
 * `parseReference`, so comments accept every spelling and separator understood by Reader URLs.
 * Existing links are deliberately skipped, making this safe to call repeatedly.
 */
import { BOOKS } from './books';
import { bookShortName, GERMAN_BOOK_NAMES } from './book-names';
import { formatPassage, parsePassage, type Passage } from './passage';
import { isReferenceInCanon, parseReference, referencePath, type VerseRef } from './reference';

const TAG_SPLIT = /(<[a-zA-Z/][^>]*>)/g;
const NO_LINK_TAGS = new Set(['a', 'abbr', 'code', 'pre']);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Dots and whitespace in book names are optional in the normalised reference grammar. */
function bookPattern(value: string): string {
	return value
		.trim()
		.split(/[\s.]+/)
		.filter(Boolean)
		.map(escapeRegExp)
		.join('[\\s.]*');
}

const BOOK_PATTERN = BOOKS.flatMap((book) => {
	const names = GERMAN_BOOK_NAMES[book.id];
	return names ? [names.name, names.short, ...names.aliases, book.osisId] : [];
})
	.filter((name, index, names) => names.indexOf(name) === index)
	.sort((left, right) => right.length - left.length)
	.map(bookPattern)
	.join('|');

const RANGE_END_PATTERN = `(?:(?:${BOOK_PATTERN})\\s*\\d{1,3}\\s*[,:_]\\s*\\d{1,3}|\\d{1,3}\\s*[,:_]\\s*\\d{1,3}|\\d{1,3})`;

const REFERENCE_PATTERN = new RegExp(
	`(^|[^\\p{L}\\p{N}])((?:${BOOK_PATTERN})\\s*\\d{1,3}(?:\\s*[,:_]\\s*\\d{1,3}(?:\\s*[-–—]\\s*${RANGE_END_PATTERN})?)?)(?![\\p{L}\\p{N}])`,
	'giu'
);

/** A repeated chapter/verse after a semicolon inherits the preceding explicit book name. */
const CONTINUATION_PATTERN =
	/^(\s*;\s*)(\d{1,3}\s*[,:_]\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?)(?![\p{L}\p{N}])/u;

export type BibleReferenceMatch = {
	/** UTF-16 offsets in the original text node, as expected by ProseMirror positions. */
	from: number;
	to: number;
	label: string;
	reference: VerseRef;
	/** Present for an explicit verse or range; may span chapters or books. */
	passage?: Passage;
	href: string;
	/** Compact, canonical Reader reference without the leading slash, e.g. `Mt3,12`. */
	canonical: string;
	/** False for cross-chapter/book ranges, whose text cannot be represented by one chapter fetch. */
	previewable: boolean;
};

export type BibleReferenceAttributes = Record<string, string>;
export type BibleReferenceLinkOptions = { tooltipId?: string };

/** Shared DOM attributes for static links and non-persisted editor decorations. */
export function bibleReferenceAttributes(
	match: BibleReferenceMatch,
	options: BibleReferenceLinkOptions = {}
): BibleReferenceAttributes {
	return {
		class: match.previewable ? 'bible-reference verse-ref' : 'bible-reference',
		href: match.href,
		tabindex: '0',
		'data-sveltekit-preload-data': 'off',
		'data-reference': match.canonical,
		'data-book': String(match.reference.book),
		'data-chapter': String(match.reference.chapter),
		...(match.reference.verse === undefined ? {} : { 'data-verse': String(match.reference.verse) }),
		...(match.reference.verseEnd === undefined
			? {}
			: { 'data-verse-end': String(match.reference.verseEnd) }),
		...(match.previewable && options.tooltipId ? { 'aria-describedby': options.tooltipId } : {})
	};
}

function matchFromReference(
	text: string,
	from: number,
	to: number,
	reference: VerseRef,
	passage?: Passage
): BibleReferenceMatch {
	const crossesChapter = Boolean(
		passage &&
		(passage.start.book !== passage.end.book || passage.start.chapter !== passage.end.chapter)
	);
	const href = referencePath(reference);
	const canonicalPassage = passage && formatPassage(passage);
	return {
		from,
		to,
		label: text.slice(from, to),
		reference,
		...(passage ? { passage } : {}),
		href,
		canonical:
			crossesChapter && canonicalPassage
				? canonicalPassage.replace(/^(\S+)\s+/u, '$1')
				: href.slice(1),
		previewable: reference.verse !== undefined && !crossesChapter
	};
}

function parseMatchReference(label: string): { reference: VerseRef; passage?: Passage } | null {
	const passage = parsePassage(label);
	if (passage) {
		const sameChapter =
			passage.start.book === passage.end.book && passage.start.chapter === passage.end.chapter;
		return {
			reference: {
				book: passage.start.book,
				chapter: passage.start.chapter,
				verse: passage.start.verse,
				...(sameChapter && passage.end.verse > passage.start.verse
					? { verseEnd: passage.end.verse }
					: {})
			},
			passage
		};
	}

	const reference = parseReference(label);
	return reference && isReferenceInCanon(reference) ? { reference } : null;
}

/**
 * Finds references in one plain-text run. Besides every spelling accepted by `parseReference`, a
 * semicolon-separated chapter/verse may inherit the previous book (`Joh 3,16; 4,2`). A prose word
 * between the two deliberately breaks that inheritance.
 */
export function findBibleReferences(text: string): BibleReferenceMatch[] {
	const matches: BibleReferenceMatch[] = [];
	REFERENCE_PATTERN.lastIndex = 0;

	let primary: RegExpExecArray | null;
	while ((primary = REFERENCE_PATTERN.exec(text))) {
		const prefix = primary[1] ?? '';
		const label = primary[2] ?? '';
		const parsed = parseMatchReference(label);
		if (!parsed) continue;

		const from = primary.index + prefix.length;
		const to = from + label.length;
		matches.push(matchFromReference(text, from, to, parsed.reference, parsed.passage));

		let continuationOffset = to;
		while (parsed.reference.verse !== undefined) {
			const continuation = CONTINUATION_PATTERN.exec(text.slice(continuationOffset));
			if (!continuation) break;
			const separator = continuation[1] ?? '';
			const continuationLabel = continuation[2] ?? '';
			const continued = parseMatchReference(
				`${bookShortName(parsed.reference.book)} ${continuationLabel}`
			);
			if (!continued) break;

			const continuedFrom = continuationOffset + separator.length;
			const continuedTo = continuedFrom + continuationLabel.length;
			matches.push(
				matchFromReference(text, continuedFrom, continuedTo, continued.reference, continued.passage)
			);
			continuationOffset += continuation[0].length;
		}
	}

	REFERENCE_PATTERN.lastIndex = 0;
	return matches.sort((left, right) => left.from - right.from);
}

function linkText(text: string, options: BibleReferenceLinkOptions): string {
	const matches = findBibleReferences(text);
	if (matches.length === 0) return text;

	let cursor = 0;
	let linked = '';
	for (const match of matches) {
		if (match.from < cursor) continue;
		const attributes = Object.entries(bibleReferenceAttributes(match, options))
			.map(([name, value]) => `${name}="${value}"`)
			.join(' ');
		linked += `${text.slice(cursor, match.from)}<a ${attributes}>${match.label}</a>`;
		cursor = match.to;
	}
	return linked + text.slice(cursor);
}

export function linkBibleReferences(html: string, options: BibleReferenceLinkOptions = {}): string {
	let skipDepth = 0;
	return html
		.split(TAG_SPLIT)
		.map((part) => {
			if (!part.startsWith('<')) return skipDepth > 0 ? part : linkText(part, options);

			const tag = /^<\s*(\/?)\s*([a-zA-Z]+)/.exec(part);
			if (tag?.[2] && NO_LINK_TAGS.has(tag[2].toLowerCase())) {
				skipDepth += tag[1] ? -1 : 1;
				skipDepth = Math.max(0, skipDepth);
			}
			return part;
		})
		.join('');
}
