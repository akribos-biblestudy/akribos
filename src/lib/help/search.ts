import { getHelpArticles } from './catalog';
import type { HelpArticle } from './types';

export const MAX_HELP_QUERY_LENGTH = 160;

function normalize(value: string): string {
	return value
		.toLocaleLowerCase('de')
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/\p{M}/gu, '');
}

/** This is search indexing of trusted editorial HTML, not an HTML sanitizer. */
export function helpPlainText(html: string): string {
	return html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

export function helpQuery(value: string | null): string {
	return (value ?? '').trim().slice(0, MAX_HELP_QUERY_LENGTH);
}

export interface HelpSearchResult {
	article: Pick<
		HelpArticle,
		'id' | 'path' | 'title' | 'description' | 'audience' | 'icon' | 'level'
	>;
	href: string;
	excerpt: string;
	sectionTitle: string | null;
}

export function searchHelp(query: string, articles = getHelpArticles()): HelpSearchResult[] {
	const terms = [
		...new Set(
			normalize(helpQuery(query))
				.split(/[^\p{L}\p{N}]+/u)
				.filter(Boolean)
		)
	];
	if (terms.length === 0) return [];
	return articles
		.map((article, order) => {
			const title = normalize(article.title);
			const description = normalize(article.description);
			const keywords = normalize(article.keywords.join(' '));
			const sections = article.sections.map((section) => ({
				...section,
				text: helpPlainText(section.html),
				normalized: normalize(
					`${section.title ?? ''} ${helpPlainText(section.html)} ${section.screenshot?.caption ?? ''}`
				)
			}));
			const body = sections.map((section) => section.normalized).join(' ');
			if (!terms.every((term) => `${title} ${description} ${keywords} ${body}`.includes(term)))
				return null;
			const score = terms.reduce(
				(total, term) =>
					total +
					(title.includes(term) ? 12 : 0) +
					(description.includes(term) ? 5 : 0) +
					(keywords.includes(term) ? 3 : 0) +
					(body.includes(term) ? 1 : 0),
				0
			);
			const section = [...sections].sort(
				(a, b) =>
					terms.filter((term) => b.normalized.includes(term)).length -
					terms.filter((term) => a.normalized.includes(term)).length
			)[0];
			if (!section) return null;
			const titleMatch = terms.every((term) => title.includes(term) || description.includes(term));
			const text = titleMatch ? article.description : section.text;
			const {
				id,
				path,
				description: summary,
				title: articleTitle,
				audience,
				icon,
				level
			} = article;
			return {
				order,
				score,
				result: {
					article: { id, path, description: summary, title: articleTitle, audience, icon, level },
					href: titleMatch ? path : `${path}#${section.id}`,
					excerpt: text.length > 240 ? `${text.slice(0, 237).trimEnd()}…` : text,
					sectionTitle: !titleMatch ? (section.title ?? null) : null
				}
			};
		})
		.filter((item) => item !== null)
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.map((item) => item.result);
}
