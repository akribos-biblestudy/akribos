import { linkBibleReferences, rewriteBibleReferenceLinks } from './link-references.ts';
import { parseReference } from './reference.ts';

type CommentaryContext = {
	book: number;
	chapter: number;
	verseStart: number | null;
	verseEnd: number | null;
};

/** Render already-sanitized imports without changing stored content.
 * Older SWORD imports lost their paragraph tags. Recover only standalone verse labels
 * ("Phil 4:1. Text") in the commented range, never ordinary citations in a sentence.
 * Structured imports already carry the author's paragraph decisions and are left alone.
 */
export function renderCommentaryHtml(html: string, context: CommentaryContext): string {
	const linked = linkBibleReferences(rewriteBibleReferenceLinks(html));
	if (/<(?:p|div|h[1-6]|br|ul|ol|blockquote|code|pre)\b/i.test(linked)) return linked;
	let previousEnd = 0;
	let lastVerse = 0;
	return linked.replace(/<a\b[^>]*>([^<]*)<\/a>/gi, (anchor, label: string, offset: number) => {
		const before = linked.slice(0, offset).replace(/<[^>]*>/g, '');
		previousEnd = offset + anchor.length;
		const reference = parseReference(label);
		if (
			!reference?.verse ||
			reference.verseEnd ||
			reference.book !== context.book ||
			reference.chapter !== context.chapter ||
			reference.verse < (context.verseStart ?? 1) ||
			reference.verse > (context.verseEnd ?? context.verseStart ?? Infinity) ||
			reference.verse <= lastVerse ||
			!/(?:^|[.!?])\s*$/u.test(before) ||
			/(?:\b(?:vgl|siehe|s|bzw|z|B|ca)|\.\s*[A-Za-z])\.\s*$/iu.test(before) ||
			!/^\.\s+\p{Lu}/u.test(linked.slice(previousEnd)) ||
			// An open parenthesis/quote belongs to prose, even across previous links.
			/[([{„“»«]/u.test(
				before.replace(/[^()[\]{}„“»«]/gu, '').replace(/\(\)|\[\]|\{\}|„“|»«/gu, '')
			)
		)
			return anchor;
		lastVerse = reference.verse;
		return `${offset === 0 ? '' : '<br><br>'}${anchor}`;
	});
}
