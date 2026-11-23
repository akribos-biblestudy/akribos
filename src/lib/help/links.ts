import type { HelpArticle } from './types';

export const LEGACY_HELP_GUIDE_PARAM = 'anleitung';

export function helpAnchor(article: HelpArticle, section?: string): string {
	if (article.level === 'overview') return section ?? '';
	return section ? `${article.id}--${section}` : article.id;
}

export function helpHref(article: HelpArticle, section?: string): string {
	const anchor = helpAnchor(article, section);
	return `/help/${article.topic}${anchor ? `#${anchor}` : ''}`;
}
