/**
 * Adds links to Bible references in already-sanitised prose.
 *
 * The matcher is derived from the same book-name catalogue and delegates final parsing to
 * `parseReference`, so comments accept every spelling and separator understood by Reader URLs.
 * Existing links are deliberately skipped, making this safe to call repeatedly.
 */
import { BOOKS } from './books';
import { GERMAN_BOOK_NAMES } from './book-names';
import { isReferenceInCanon, parseReference, referencePath } from './reference';

const TAG_SPLIT = /(<[a-zA-Z/][^>]*>)/g;

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

const REFERENCE_PATTERN = new RegExp(
	`(^|[^\\p{L}\\p{N}])((?:${BOOK_PATTERN})\\s*\\d{1,3}(?:\\s*[,:_]\\s*\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?)?)(?![\\p{L}\\p{N}])`,
	'giu'
);

function linkText(text: string): string {
	return text.replace(REFERENCE_PATTERN, (match, prefix: string, label: string) => {
		const reference = parseReference(label);
		if (!reference || !isReferenceInCanon(reference)) return match;
		return `${prefix}<a class="bible-reference" href="${referencePath(reference)}">${label}</a>`;
	});
}

export function linkBibleReferences(html: string): string {
	let anchorDepth = 0;
	return html
		.split(TAG_SPLIT)
		.map((part) => {
			if (!part.startsWith('<')) return anchorDepth > 0 ? part : linkText(part);

			const tag = /^<\s*(\/?)\s*([a-zA-Z]+)/.exec(part);
			if (tag?.[2]?.toLowerCase() === 'a') {
				anchorDepth += tag[1] ? -1 : 1;
				anchorDepth = Math.max(0, anchorDepth);
			}
			return part;
		})
		.join('');
}
