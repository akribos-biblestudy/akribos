import { error, redirect } from '@sveltejs/kit';
import { formatReference } from '$lib/bible/reference';
import { restoreSavedWorkspace } from '$lib/reader/saved-workspaces';
import { getDb } from '$lib/server/db';
import { isUuid } from '$lib/server/documents/application';
import {
	activateSavedReaderWorkspace,
	getSavedReaderWorkspace
} from '$lib/server/repositories/saved-reader-workspaces';
import { listReaderResources } from '$lib/server/repositories/resources';
import { writeWorkspaceCompatibilityCookies } from '$lib/server/reader-workspace';
import { writeActiveReaderWorkspaceHint } from '$lib/server/reader-workspace-context';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	if (!isUuid(params.id)) error(404, 'Arbeitsbereich nicht gefunden.');
	const saved = await getSavedReaderWorkspace(getDb(), locals.user.id, params.id);
	if (!saved) error(404, 'Arbeitsbereich nicht gefunden.');
	// Navigation first lets document editors flush their pending changes. Prefetching this GET is
	// harmless; only the subsequent explicit form action replaces the current account workspace.
	return { name: saved.name };
};

export const actions: Actions = {
	default: async ({ locals, params, cookies, setHeaders }) => {
		setHeaders({ 'cache-control': 'private, no-store' });
		if (!locals.user) error(401, 'Bitte melde dich an.');
		if (!isUuid(params.id)) error(404, 'Arbeitsbereich nicht gefunden.');
		const db = getDb();
		const activated = await activateSavedReaderWorkspace(
			db,
			locals.user.id,
			locals.sessionId!,
			params.id,
			locals.readerBrowserTabId
		);
		if (!activated) error(404, 'Arbeitsbereich nicht gefunden.');
		const resources = await listReaderResources(db, locals.user.id);
		const restored = restoreSavedWorkspace(
			activated.snapshot,
			resources.map((resource) => resource.id)
		);
		if (!restored) error(400, 'Dieser Arbeitsbereich kann nicht geöffnet werden.');
		writeActiveReaderWorkspaceHint(cookies, locals.user.id, activated.id);
		writeWorkspaceCompatibilityCookies(cookies, restored.workspace);
		cookies.set('location', formatReference(restored.reference), {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: false,
			sameSite: 'lax'
		});
		redirect(303, restored.url);
	}
};
