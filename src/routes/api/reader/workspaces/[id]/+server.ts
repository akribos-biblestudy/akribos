import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '$lib/server/db';
import { isUuid } from '$lib/server/documents/application';
import { changeSavedReaderWorkspace } from '$lib/server/repositories/saved-reader-workspaces';
import {
	readWorkspaceJson,
	requireWorkspaceUser,
	savedWorkspaceInput,
	validateWorkspaceSnapshot,
	workspaceMutationResponse
} from '$lib/server/saved-reader-workspaces';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async (event) => {
	const userId = requireWorkspaceUser(event);
	if (!isUuid(event.params.id)) error(404, 'Arbeitsbereich nicht gefunden.');
	const parsed = savedWorkspaceInput.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success || !parsed.data.revision) error(400, 'Ungültige Arbeitsbereichsdaten.');
	const snapshot = parsed.data.snapshot
		? await validateWorkspaceSnapshot(parsed.data.snapshot)
		: undefined;
	return workspaceMutationResponse(
		await changeSavedReaderWorkspace(getDb(), userId, {
			action: 'update',
			id: event.params.id,
			revision: parsed.data.revision,
			name: parsed.data.name,
			snapshot
		})
	);
};

export const DELETE: RequestHandler = async (event) => {
	const userId = requireWorkspaceUser(event);
	if (!isUuid(event.params.id)) error(404, 'Arbeitsbereich nicht gefunden.');
	const parsed = z
		.object({ revision: z.number().int().positive() })
		.safeParse(await readWorkspaceJson(event.request));
	if (!parsed.success) error(400, 'Die aktuelle Revision ist erforderlich.');
	return workspaceMutationResponse(
		await changeSavedReaderWorkspace(getDb(), userId, {
			action: 'delete',
			id: event.params.id,
			revision: parsed.data.revision
		})
	);
};
