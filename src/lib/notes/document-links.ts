import { marked } from 'marked';

const DOCUMENT_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const OWNED_DOCUMENT_HREF = new RegExp(`^/notes/(${DOCUMENT_ID})(?:[?#].*)?$`, 'iu');

/**
 * Extracts stable working-copy ids from ordinary Markdown links. Code spans, plain text which merely
 * resembles a URL and external links are ignored by Marked's tokeniser. Ownership is deliberately
 * checked later by the repository, at the database boundary.
 */
export function documentLinkTargetIds(markdown: string): string[] {
	const result = new Set<string>();
	const tokens = marked.lexer(markdown, { gfm: true });
	marked.walkTokens(tokens, (token) => {
		if (token.type !== 'link') return;
		const match = OWNED_DOCUMENT_HREF.exec(token.href);
		if (match?.[1]) result.add(match[1].toLowerCase());
	});
	return [...result];
}

export function ownedDocumentIdFromHref(href: string): string | null {
	return OWNED_DOCUMENT_HREF.exec(href)?.[1]?.toLowerCase() ?? null;
}
