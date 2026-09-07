import { error, json } from '@sveltejs/kit';
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
		.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success || !parsed.data.snapshot) error(400, 'Ungültiger Arbeitsbereich.');
	const snapshot = await validateWorkspaceSnapshot(parsed.data.snapshot);
	const saved = await saveActiveWorkspaceView(getDb(), userId, event.params.id, snapshot);
	return json({ saved });
};
