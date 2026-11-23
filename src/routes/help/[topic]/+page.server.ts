import { LEGACY_HELP_GUIDE_PARAM } from '$lib/help/links';
import { loadHelpTopic } from '$lib/help/load-topic';
import type { PageServerLoad } from './$types';

export const load = (({ params, locals, setHeaders, url }) =>
	loadHelpTopic(
		params.topic,
		locals.user,
		setHeaders,
		url.searchParams.get(LEGACY_HELP_GUIDE_PARAM)
	)) satisfies PageServerLoad;
