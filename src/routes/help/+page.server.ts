import { helpIndexData } from '$lib/help/search';
import { setHelpResponseHeaders } from '$lib/server/help/access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, locals, setHeaders }) => {
	setHelpResponseHeaders(setHeaders);
	return helpIndexData(url.searchParams.get('q'), locals.user);
};
