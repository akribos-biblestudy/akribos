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

/**
 * Data every page needs: the available translations and the reader's column selection.
 *
 * Resources are cached in the process, so this costs no query on most requests.
 */
export async function load({ cookies, locals }) {
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
	if (!initializeReaderWorkspace) writeWorkspaceCompatibilityCookies(cookies, workspace);
	const readerFontScale = readFontScale(cookies, locals.user?.readerFontScale);
	writeFontScale(cookies, readerFontScale);
	const theme = readTheme(cookies, locals.user?.theme);
	if (theme) writeTheme(cookies, theme);

	const savedWorkspaces = locals.user
		? await listSavedReaderWorkspaces(db, locals.user.id, locals.sessionId!, context.selection)
		: [];
	return {
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
		user: locals.user,
		tourGuestDone: readTourGuestDone(cookies)
	};
}
