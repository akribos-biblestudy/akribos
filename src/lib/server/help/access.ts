import type { RequestEvent } from '@sveltejs/kit';
import type { HelpArticle } from '$lib/help/types';

export type HelpViewer = Pick<NonNullable<App.Locals['user']>, 'role'> | null;

/** Keep catalog consumers on the server and deny restricted help unless a session grants it. */
export function canReadHelp(article: Pick<HelpArticle, 'audience'>, user: HelpViewer = null) {
	return article.audience !== 'admin' || user?.role === 'admin';
}

export function setHelpResponseHeaders(setHeaders: RequestEvent['setHeaders']) {
	// Navigation and search results depend on the session, including on public article pages.
	setHeaders({ 'cache-control': 'private, no-store', vary: 'Cookie' });
}
