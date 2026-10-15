import { readAnalyticsSettings } from '$lib/server/analytics/settings';
import { getDb } from '$lib/server/db';
import { listSavedReaderWorkspaces } from '$lib/server/repositories/saved-reader-workspaces';
import { listBibles } from '$lib/server/repositories/resources';
import { workspaceColumns, writeWorkspaceCompatibilityCookies } from '$lib/server/reader-workspace';
import { resolveReaderWorkspaceContext } from '$lib/server/reader-workspace-context';
import {
	readFontScale,
	readTheme,
	writeFontScale,
	writeTheme
} from '$lib/server/reader-preferences';
import { readTourGuestDone } from '$lib/server/tour-preferences';
import { isAppEditorPath } from '$lib/app/editor-route';
import { workspaceFromColumns } from '$lib/reader/workspace';
import type { SavedWorkspaceSummary } from '$lib/reader/saved-workspaces';
import type { ReadableResource } from '$lib/server/repositories/resources';

/**
 * Data every page needs: the available translations and the reader's column selection.
 *
 * Resources are cached in the process, so this costs no query on most requests.
 */
export async function load({ cookies, locals, url }) {
	// The embedded editor has no Reader. In particular, do not resolve a saved
	// workspace here: even a GET could otherwise initialize the browser layout.
	if (isAppEditorPath(url.pathname)) {
		return {
			appEditor: true,
			initializeReaderWorkspace: false,
			analytics: {
				enabled: false,
				scriptUrl: '',
				websiteId: '',
				provider: '',
				privacyUrl: '',
				privacyDetails: '',
				revision: ''
			},
			savedWorkspaces: [] as SavedWorkspaceSummary[],
			activeSavedWorkspaceId: null,
			activeSavedWorkspaceVersion: null,
			activeSavedWorkspaceContentVersion: null,
			bibles: [] as Awaited<ReturnType<typeof listBibles>>,
			defaultBibleId: null,
			previewBibleId: null,
			readerResources: [] as ReadableResource[],
			columns: [] as string[],
			workspace: workspaceFromColumns([]),
			readerFontScale: readFontScale(cookies, locals.user?.readerFontScale),
			theme: readTheme(cookies, locals.user?.theme),
			user: locals.user ? { ...locals.user, readerWorkspace: null, readerColumns: [] } : null,
			tourGuestDone: true
		};
	}
	const db = getDb();
	const bibles = await listBibles(db, locals.user?.id);
	const defaultBibleId = bibles.some((bible) => bible.id === locals.user?.defaultBibleId)
		? locals.user!.defaultBibleId
		: null;
	const context = await resolveReaderWorkspaceContext({ cookies, locals });
	const {
		resources: readerResources,
		workspace,
		awaitingInitialViewport: initializeReaderWorkspace
	} = context;
	const columns = workspaceColumns(workspace);
	if (!locals.localReader && !initializeReaderWorkspace)
		writeWorkspaceCompatibilityCookies(cookies, workspace);
	const readerFontScale = readFontScale(cookies, locals.user?.readerFontScale);
	writeFontScale(cookies, readerFontScale);
	const theme = readTheme(cookies, locals.user?.theme);
	if (theme) writeTheme(cookies, theme);

	const savedWorkspaces =
		locals.user && !locals.localReader
			? await listSavedReaderWorkspaces(db, locals.user.id, locals.sessionId!, context.selection)
			: [];
	return {
		appEditor: false,
		initializeReaderWorkspace,
		analytics: await readAnalyticsSettings(db),
		savedWorkspaces,
		...context.selection,
		bibles,
		defaultBibleId,
		previewBibleId: defaultBibleId ?? bibles[0]?.id ?? null,
		readerResources,
		columns,
		workspace,
		readerFontScale,
		theme,
		user:
			locals.localReader && locals.user
				? { ...locals.user, readerWorkspace: null, readerColumns: [] }
				: locals.user,
		tourGuestDone: readTourGuestDone(cookies)
	};
}
