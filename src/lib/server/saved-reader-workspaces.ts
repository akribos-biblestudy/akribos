import { error, json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { MAX_READER_URL_STATE_LENGTH } from '$lib/reader/url-state';
import { restoreSavedWorkspace } from '$lib/reader/saved-workspaces';
import { getDb } from './db';
import { listReaderResources } from './repositories/resources';
import type { SavedWorkspaceMutationResult } from './repositories/saved-reader-workspaces';

export const savedWorkspaceInput = z.object({
	name: z.string().max(320),
	snapshot: z
		.object({
			readerState: z.string().min(1).max(MAX_READER_URL_STATE_LENGTH),
			layoutSizes: z.unknown().optional()
		})
		.optional(),
	revision: z.number().int().positive().optional()
});

export function requireWorkspaceUser({ locals, request, url, setHeaders }: RequestEvent): string {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) error(401, 'Bitte melde dich an, um Arbeitsbereiche zu speichern.');
	const origin = request.headers.get('origin');
	if (request.method !== 'GET' && origin && origin !== url.origin)
		error(403, 'Ungültiger Ursprung.');
	return locals.user.id;
}

export async function readWorkspaceJson(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		error(415, 'JSON erforderlich.');
	}
	const maxBytes = 64 * 1024;
	if (Number(request.headers.get('content-length')) > maxBytes)
		error(413, 'Die Anfrage ist zu groß.');
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > maxBytes) error(413, 'Die Anfrage ist zu groß.');
	try {
		return JSON.parse(raw);
	} catch {
		error(400, 'Ungültiges JSON.');
	}
}

export async function validateWorkspaceSnapshot(input: {
	readerState: string;
	layoutSizes?: unknown;
}) {
	const resources = await listReaderResources(getDb());
	const restored = restoreSavedWorkspace(
		input,
		resources.map((resource) => resource.id)
	);
	if (!restored) error(400, 'Der Arbeitsbereich ist ungültig.');
	return restored.snapshot;
}

export function workspaceMutationResponse(result: SavedWorkspaceMutationResult, status = 200) {
	if (result.ok) return json({ workspace: result.workspace }, { status });
	const messages = {
		active: 'Bitte öffne zuerst einen anderen Arbeitsbereich, bevor du diesen löschst.',
		notFound: 'Dieser Arbeitsbereich wurde nicht gefunden.',
		conflict: 'Der Arbeitsbereich wurde inzwischen geändert. Bitte lade die Seite neu.',
		name: 'Bitte verwende einen Namen mit 1 bis 80 Zeichen.',
		duplicateName: 'Ein Arbeitsbereich mit diesem Namen existiert bereits.',
		limit: 'Du kannst bis zu 100 Arbeitsbereiche speichern.'
	};
	return json(
		{ message: messages[result.reason] },
		{
			status: result.reason === 'notFound' ? 404 : result.reason === 'conflict' ? 409 : 400
		}
	);
}
