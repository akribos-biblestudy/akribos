import { getDb } from '$lib/server/db';
import { listBibles, listReaderResources } from '$lib/server/repositories/resources';
import { MAX_COLUMNS, resolveColumns, writeColumns } from '$lib/server/columns';
import { updateReaderColumns } from '$lib/server/repositories/users';
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
	const readerResources = await listReaderResources(db);
	const columns = resolveColumns(cookies, readerResources, locals.user?.readerColumns);
	if (locals.user && locals.user.readerColumns.length === 0) {
		await updateReaderColumns(db, locals.user.id, columns);
	}
	// Keep the device fallback aligned with whatever was just resolved, so a device's own cookie is
	// always what the next request sees — signing out does not reshuffle the reader either.
	writeColumns(cookies, columns);
	const readerFontScale = readFontScale(cookies, locals.user?.readerFontScale);
	writeFontScale(cookies, readerFontScale);
	const theme = readTheme(cookies, locals.user?.theme);
	if (theme) writeTheme(cookies, theme);

	return {
		bibles,
		readerResources,
		columns,
		readerFontScale,
		theme,
		// The limit lives in $lib/server, so the reader cannot import it to decide whether to offer a
		// further column.
		maxColumns: MAX_COLUMNS,
		user: locals.user,
		tourGuestDone: readTourGuestDone(cookies)
	};
}
