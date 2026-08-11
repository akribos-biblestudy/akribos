/**
 * Sanitiser for user-written notes.
 *
 * Notes are entered in a small rich-text editor and stored as HTML, so they have to be reduced to a
 * known-safe subset before being stored — a shared list renders someone else's note in a reader's
 * browser.
 *
 * The approach is allow-list only: everything is escaped first and then a fixed set of tags is put
 * back, with no attributes at all. Nothing that is not in the list can survive, which is a much
 * smaller thing to get right than trying to spot what is dangerous.
 */

// Chromium wraps new lines in a contenteditable field in attribute-free div elements. Keeping those
// wrappers is equivalent to keeping paragraphs and prevents their markup from becoming visible text
// after the note has gone through the server and the page is reloaded.
const ALLOWED_TAGS = [
	'p',
	'div',
	'br',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'code',
	'h2',
	'h3',
	'ul',
	'ol',
	'li',
	'blockquote'
];

const TAG_PATTERN = new RegExp(`&lt;(/?)(${ALLOWED_TAGS.join('|')})\\s*/?&gt;`, 'gi');

export function sanitizeNoteHtml(input: string): string {
	if (!input) return '';

	const escaped = input
		// Any entity already present stays as it is; a bare ampersand is escaped.
		.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

	return (
		escaped
			.replace(
				TAG_PATTERN,
				(_match, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`
			)
			// Collapse the empty paragraphs a contenteditable field tends to leave behind.
			.replace(/<p>\s*<\/p>/g, '')
			.trim()
			.slice(0, 20_000)
	);
}

/** Plain text of a note, for summaries and search snippets. */
export function noteToText(html: string | null): string {
	if (!html) return '';
	return html
		.replace(/<[^>]*>/g, ' ')
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replace(/\s+/g, ' ')
		.trim();
}
