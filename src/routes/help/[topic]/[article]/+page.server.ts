import { redirectHelpGuide } from '$lib/help/load-topic';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals, setHeaders }) =>
	redirectHelpGuide(params.topic, params.article, locals.user, setHeaders);
