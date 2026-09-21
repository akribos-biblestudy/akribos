import { loadHelpArticle } from '$lib/help/load-article';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, setHeaders }) =>
	loadHelpArticle(`/help/${params.topic}/${params.article}`, locals.user, setHeaders);
