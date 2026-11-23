import type { RequestEvent } from '@sveltejs/kit';
import { isAppEditorPath } from '$lib/app/editor-route';

function isWebVisitRequest({ headers }: Request): boolean {
	if (headers.has('x-akribos-app')) return false;
	return !['sec-purpose', 'purpose', 'x-purpose', 'x-moz'].some((name) =>
		/\b(?:prefetch|prerender|preview)\b/i.test(headers.get(name) ?? '')
	);
}

/** A completed top-level document navigation, rather than a data load, iframe or prefetch. */
export function isWebDocumentVisit(
	{
		isDataRequest,
		isSubRequest,
		request,
		route,
		url
	}: Pick<RequestEvent, 'isDataRequest' | 'isSubRequest' | 'request' | 'route' | 'url'>,
	response: Response
): boolean {
	return (
		request.method === 'GET' &&
		!isDataRequest &&
		!isSubRequest &&
		route.id !== null &&
		!url.pathname.startsWith('/api/app/') &&
		!isAppEditorPath(url.pathname) &&
		request.headers.get('sec-fetch-mode') === 'navigate' &&
		request.headers.get('sec-fetch-dest') === 'document' &&
		isWebVisitRequest(request) &&
		response.ok &&
		/^text\/html\b/i.test(response.headers.get('content-type') ?? '')
	);
}

/** The browser sends this only after a page is displayed. The origin and session are still required. */
export function isWebVisitSignal({ request, url }: Pick<RequestEvent, 'request' | 'url'>): boolean {
	const fetchSite = request.headers.get('sec-fetch-site');
	return (
		isWebVisitRequest(request) &&
		request.headers.get('x-akribos-web-visit') === '1' &&
		request.headers.get('origin') === url.origin &&
		(fetchSite === 'same-origin' || fetchSite === null)
	);
}
