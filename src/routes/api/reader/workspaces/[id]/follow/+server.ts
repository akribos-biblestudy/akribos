import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { referencePath } from '$lib/bible/reference';
import { decodeReaderUrlState } from '$lib/reader/url-state';
import { activeReaderTab, type ReaderWorkspace } from '$lib/reader/workspace';
import { readWorkspaceVersion } from '$lib/server/reader-workspace-context';
import { getDb } from '$lib/server/db';
import { isUuid } from '$lib/server/documents/application';
import { followSharedWorkspacePositions } from '$lib/server/repositories/saved-reader-workspaces';
import { readWorkspaceJson, requireWorkspaceUser } from '$lib/server/saved-reader-workspaces';
import type { RequestHandler } from './$types';

/** Adopt reading progress published elsewhere into this browser tab's own working copy. */
export const POST: RequestHandler = async (event) => {
	const userId = requireWorkspaceUser(event);
	if (!isUuid(event.params.id)) error(404, 'Arbeitsbereich nicht gefunden.');
	const browserTabId = event.locals.readerBrowserTabId;
	if (!browserTabId) error(400, 'Browser-Tab fehlt.');
	const parsed = z
		.object({ workspaceVersion: z.unknown(), workspaceContentVersion: z.unknown() })
		.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success) error(400, 'Ungültiger Arbeitsbereich.');
	const result = await followSharedWorkspacePositions(getDb(), userId, {
		sessionId: event.locals.sessionId!,
		browserTabId,
		activeId: event.params.id,
		selectionVersion: readWorkspaceVersion(parsed.data.workspaceVersion),
		contentVersion: readWorkspaceVersion(parsed.data.workspaceContentVersion)
	});
	if (!result.saved) return json(result, { status: 409 });
	const workspace = decodeReaderUrlState(new URLSearchParams(result.readerState))?.workspace as
		ReaderWorkspace | undefined;
	const focused =
		workspace?.tiles.find((tile) => tile.id === workspace.focusedTileId && activeReaderTab(tile)) ??
		workspace?.tiles.find((tile) => activeReaderTab(tile));
	const reference = focused && activeReaderTab(focused)?.reference;
	return json({ ...result, path: referencePath(reference ?? { book: 43, chapter: 1 }) });
};
