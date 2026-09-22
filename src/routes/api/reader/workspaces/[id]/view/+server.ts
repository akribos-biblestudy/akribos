import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	encodeReaderUrlState,
	readReaderNotesFilters,
	decodeReaderUrlState,
	sameReaderUrlWorkspace
} from '$lib/reader/url-state';
import type { ReaderWorkspace } from '$lib/reader/workspace';
import {
	readWorkspaceVersion,
	resolveReaderWorkspaceContext
} from '$lib/server/reader-workspace-context';
import { getDb } from '$lib/server/db';
import { isUuid } from '$lib/server/documents/application';
import { saveActiveWorkspaceView } from '$lib/server/repositories/saved-reader-workspaces';
import {
	readWorkspaceJson,
	requireWorkspaceUser,
	savedWorkspaceInput,
	validateWorkspaceSnapshot
} from '$lib/server/saved-reader-workspaces';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async (event) => {
	const userId = requireWorkspaceUser(event);
	if (!isUuid(event.params.id)) error(404, 'Arbeitsbereich nicht gefunden.');
	const parsed = savedWorkspaceInput
		.pick({ snapshot: true })
		.extend({
			workspaceVersion: z.unknown(),
			workspaceContentVersion: z.unknown(),
			workspaceDetached: z.boolean().optional(),
			resume: z.boolean().optional()
		})
		.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success || !parsed.data.snapshot) error(400, 'Ungültiger Arbeitsbereich.');
	const snapshot = await validateWorkspaceSnapshot(parsed.data.snapshot, userId);
	const context = await resolveReaderWorkspaceContext(event, true);
	const decoded = decodeReaderUrlState(new URLSearchParams(snapshot.readerState));
	const resume = parsed.data.resume === true && !!event.locals.readerBrowserTabId;
	if (resume && decoded) {
		// A resume only advances positions in the same local arrangement; it cannot import another view.
		const normalized = structuredClone(decoded.workspace as ReaderWorkspace);
		normalized.focusedTileId = context.workspace.focusedTileId;
		for (const tile of normalized.tiles)
			for (const tab of tile.tabs) {
				const original = context.workspace.tiles
					.find((entry) => entry.id === tile.id)
					?.tabs.find((entry) => entry.id === tab.id);
				if (original) tab.reference = original.reference;
			}
		if (!sameReaderUrlWorkspace(normalized, context.workspace))
			error(409, 'Die lokale Ansicht hat sich geändert.');
		snapshot.layoutSizes = context.workspace.layoutSizes;
		const original = decodeReaderUrlState(new URLSearchParams(context.snapshot?.readerState));
		snapshot.readerState = encodeReaderUrlState(
			decoded.workspace as ReaderWorkspace,
			original?.searchQueries ?? {},
			readReaderNotesFilters(new URLSearchParams(context.snapshot?.readerState))
		);
	}
	const detached =
		parsed.data.workspaceDetached === true
			? 'explicit'
			: !resume &&
				  (!decoded ||
						!sameReaderUrlWorkspace(decoded.workspace as ReaderWorkspace, context.workspace))
				? 'snapshot'
				: undefined;
	const result = await saveActiveWorkspaceView(
		getDb(),
		userId,
		snapshot,
		{
			sessionId: event.locals.sessionId!,
			browserTabId: event.locals.readerBrowserTabId,
			activeId: event.params.id,
			selectionVersion: readWorkspaceVersion(parsed.data.workspaceVersion),
			contentVersion: readWorkspaceVersion(parsed.data.workspaceContentVersion)
		},
		detached
	);
	return json(result, { status: !result.saved && result.reason === 'conflict' ? 409 : 200 });
};
