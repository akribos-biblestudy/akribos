import { error, type RequestEvent } from '@sveltejs/kit';
import { getHelpArticle, getHelpGuides, getHelpHeadings, getHelpTopics } from './catalog';
import { setHelpResponseHeaders, type HelpViewer } from '$lib/server/help/access';

export function loadHelpArticle(
	path: string,
	user: HelpViewer = null,
	setHeaders?: RequestEvent['setHeaders']
) {
	if (setHeaders) setHelpResponseHeaders(setHeaders);
	const article = getHelpArticle(path, user);
	if (!article) error(404, 'Diese Hilfe-Anleitung wurde nicht gefunden.');
	if (setHeaders && article.audience === 'admin') {
		setHeaders({ 'x-robots-tag': 'noindex, nofollow' });
	}
	const guides = getHelpGuides(article.topic, user).map(
		({ id, path, title, description, icon }) => ({
			id,
			path,
			title,
			description,
			icon
		})
	);
	return {
		article,
		headings: [
			...(article.level === 'overview' && guides.length
				? [{ id: 'anleitungen', title: 'Anleitungen zu diesem Thema' }]
				: []),
			...getHelpHeadings(article)
		],
		guides,
		topics: getHelpTopics(user).map(({ id, path, title, audience }) => ({
			id,
			path,
			title,
			audience
		}))
	};
}
