import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	changeSavedReaderWorkspace,
	listSavedReaderWorkspaces
} from '$lib/server/repositories/saved-reader-workspaces';
import {
	readWorkspaceJson,
	requireWorkspaceUser,
	savedWorkspaceInput,
	validateWorkspaceSnapshot,
	workspaceMutationResponse
} from '$lib/server/saved-reader-workspaces';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const userId = requireWorkspaceUser(event);
	return json({ workspaces: await listSavedReaderWorkspaces(getDb(), userId) });
};

export const POST: RequestHandler = async (event) => {
	const userId = requireWorkspaceUser(event);
	const parsed = savedWorkspaceInput.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success || !parsed.data.snapshot)
		error(400, 'Name und Arbeitsbereich sind erforderlich.');
	const snapshot = await validateWorkspaceSnapshot(parsed.data.snapshot);
	return workspaceMutationResponse(
		await changeSavedReaderWorkspace(getDb(), userId, {
			action: 'create',
			name: parsed.data.name,
			snapshot
		}),
		201
	);
};
