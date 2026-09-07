import { getDb } from '$lib/server/db';
import {
	ensureDefaultReaderWorkspace,
	listSavedReaderWorkspaces
} from '$lib/server/repositories/saved-reader-workspaces';
import { listBibles, listReaderResources } from '$lib/server/repositories/resources';
import {
	resolveReaderWorkspace,
	workspaceColumns,
	writeWorkspaceCompatibilityCookies
} from '$lib/server/reader-workspace';
import { updateReaderWorkspace } from '$lib/server/repositories/users';
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
	const bibles = await listBibles(db);
	const defaultBibleId = bibles.some((bible) => bible.id === locals.user?.defaultBibleId)
		? locals.user!.defaultBibleId
		: null;
	const readerResources = await listReaderResources(db);
	const workspace = resolveReaderWorkspace(
		cookies,
		readerResources,
		locals.user?.readerWorkspace,
		locals.user?.readerColumns
	);
	const columns = workspaceColumns(workspace);
	if (locals.user && !locals.user.readerWorkspace) {
		await updateReaderWorkspace(db, locals.user.id, workspace);
	}
	if (locals.user) await ensureDefaultReaderWorkspace(db, locals.user.id, workspace);
	// Also keep a device fallback for guests and after sign-out. Signed-in readers use the account copy.
	writeWorkspaceCompatibilityCookies(cookies, workspace);
	const readerFontScale = readFontScale(cookies, locals.user?.readerFontScale);
	writeFontScale(cookies, readerFontScale);
	const theme = readTheme(cookies, locals.user?.theme);
	if (theme) writeTheme(cookies, theme);

	const savedWorkspaces = locals.user ? await listSavedReaderWorkspaces(db, locals.user.id) : [];
	return {
		savedWorkspaces,
		activeSavedWorkspaceId: savedWorkspaces.find((entry) => entry.isActive)?.id ?? null,
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
