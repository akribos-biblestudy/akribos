import { error } from '@sveltejs/kit';
import { getHelpArticle, getHelpGuides, getHelpTopics } from '$lib/help/catalog';
import { helpIndexData } from '$lib/help/search';
import type { HelpArticle } from '$lib/help/types';
import type { AppPageEvent } from './routes';

function articleHref(article: HelpArticle, section?: string): string {
	return section ? `${article.path}#${section}` : article.path;
}

/** v1 clients can still request individual articles when the corresponding web route redirects. */
export function load({ route, params, locals, url }: AppPageEvent) {
	const user = locals.user;
	if (route.id === '/help') {
		const data = helpIndexData(url.searchParams.get('q'), user, articleHref);
		return {
			...data,
			topics: data.topics.map((topic) => ({
				...topic,
				guideCount: getHelpGuides(topic.id, user).length
			}))
		};
	}

	const path = `/help/${params.topic}${params.article ? `/${params.article}` : ''}`;
	const article = getHelpArticle(path, user);
	if (!article) error(404, 'Diese Hilfe-Anleitung wurde nicht gefunden.');
	const guides = getHelpGuides(article.topic, user).map(
		({ id, path, title, description, icon }) => ({
			id,
			path,
			title,
			description,
			icon
		})
	);
	const headings = article.sections.map(({ id, title }) => ({ id, title: title ?? 'Anleitung' }));
	if (article.level === 'overview' && guides.length > 0)
		headings.unshift({ id: 'anleitungen', title: 'Anleitungen zu diesem Thema' });
	return {
		article,
		headings,
		guides,
		topics: getHelpTopics(user).map(({ id, path, title, audience }) => ({
			id,
			path,
			title,
			audience
		}))
	};
}
