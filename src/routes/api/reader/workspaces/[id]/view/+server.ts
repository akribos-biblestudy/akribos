import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { decodeReaderUrlState, sameReaderUrlWorkspace } from '$lib/reader/url-state';
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
			workspaceDetached: z.boolean().optional()
		})
		.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success || !parsed.data.snapshot) error(400, 'Ungültiger Arbeitsbereich.');
	const snapshot = await validateWorkspaceSnapshot(parsed.data.snapshot, userId);
	const context = await resolveReaderWorkspaceContext(event, true);
	const decoded = decodeReaderUrlState(new URLSearchParams(snapshot.readerState));
	const detached =
		parsed.data.workspaceDetached === true
			? 'explicit'
			: !decoded || !sameReaderUrlWorkspace(decoded.workspace as ReaderWorkspace, context.workspace)
				? 'snapshot'
				: undefined;
	const result = await saveActiveWorkspaceView(
		getDb(),
		userId,
		snapshot,
		{
			sessionId: event.locals.sessionId!,
			activeId: event.params.id,
			selectionVersion: readWorkspaceVersion(parsed.data.workspaceVersion),
			contentVersion: readWorkspaceVersion(parsed.data.workspaceContentVersion)
		},
		detached
	);
	return json(result, { status: !result.saved && result.reason === 'conflict' ? 409 : 200 });
};
