import { getHelpArticles, getHelpGuides, getHelpTopics } from '$lib/help/catalog';
import { helpQuery, searchHelp } from '$lib/help/search';
import { setHelpResponseHeaders } from '$lib/server/help/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals, setHeaders }) => {
	setHelpResponseHeaders(setHeaders);
	const query = helpQuery(url.searchParams.get('q'));
	return {
		query,
		results: query ? searchHelp(query, getHelpArticles(locals.user)) : [],
		topics: getHelpTopics(locals.user).map(({ id, path, title, description, icon, audience }) => ({
			id,
			path,
			title,
			description,
			icon,
			audience,
			guideCount: getHelpGuides(id, locals.user).length
		}))
	};
};
