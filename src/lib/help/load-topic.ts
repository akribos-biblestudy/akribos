import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getHelpArticle, getHelpGuides, getHelpTopics } from './catalog';
import { LEGACY_HELP_GUIDE_PARAM } from './links';
import { setHelpResponseHeaders, type HelpViewer } from '$lib/server/help/access';

function readHelpEntry(path: string, user: HelpViewer, setHeaders: RequestEvent['setHeaders']) {
	setHelpResponseHeaders(setHeaders);
	const entry = getHelpArticle(path, user);
	if (!entry) error(404, 'Diese Hilfe-Anleitung wurde nicht gefunden.');
	if (entry.audience === 'admin') setHeaders({ 'x-robots-tag': 'noindex, nofollow' });
	return entry;
}

export function loadHelpTopic(
	topicId: string,
	user: HelpViewer,
	setHeaders: RequestEvent['setHeaders'],
	legacyGuideId: string | null = null
) {
	const topic = readHelpEntry(`/help/${topicId}`, user, setHeaders);
	const guides = getHelpGuides(topicId, user);
	return {
		topic,
		guides,
		legacyGuideId: guides.find(({ id }) => id === legacyGuideId)?.id ?? null,
		topics: getHelpTopics(user).map(({ id, path, title, audience }) => ({
			id,
			path,
			title,
			audience
		}))
	};
}

export function redirectHelpGuide(
	topicId: string,
	guideId: string,
	user: HelpViewer,
	setHeaders: RequestEvent['setHeaders']
): never {
	const path =
		topicId === 'administration' && guideId === 'notizen-teilen'
			? '/help/dokumente/notizen-teilen'
			: `/help/${topicId}/${guideId}`;
	const guide = readHelpEntry(path, user, setHeaders);
	// A Location without its own fragment preserves the bookmark's original fragment.
	redirect(308, `/help/${guide.topic}?${LEGACY_HELP_GUIDE_PARAM}=${guide.id}`);
}
