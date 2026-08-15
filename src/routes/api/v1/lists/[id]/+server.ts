import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listBibles } from '$lib/server/repositories/resources';
import {
	findVerseList,
	isListCollaborator,
	loadVerseListItems
} from '$lib/server/repositories/verse-lists';
import { resolveApiIdentity } from '$lib/server/api/identity';
import { apiError } from '$lib/server/api/errors';

/**
 * One verse list's items. Readable by its owner or an invited member (session or `personal`-scope
 * key), or by anyone at all once its owner has turned public sharing on — the same rule the `/l/{slug}`
 * page follows. Comments and reactions are not exposed through this endpoint yet, only the verses
 * themselves; see AGENTS.md.
 *
 * Query parameters:
 *   bible  which translation's text to attach to each verse; defaults to the first available one
 */
export async function GET({ params, url, locals }) {
	const db = getDb();
	const list = await findVerseList(db, { id: params.id });
	if (!list) return apiError(404, 'list_not_found', 'No verse list with this id.');

	const identity = resolveApiIdentity(locals);
	const hasPersonalAccess =
		identity.scope === 'personal' &&
		!!identity.userId &&
		(identity.userId === list.userId || (await isListCollaborator(db, list.id, identity.userId)));
	if (!list.isPublic && !hasPersonalAccess) {
		return apiError(404, 'list_not_found', 'No verse list with this id.');
	}

	const bibles = await listBibles(db);
	const requestedBible = url.searchParams.get('bible');
	const bible = requestedBible
		? (bibles.find((candidate) => candidate.id === requestedBible) ?? bibles[0])
		: bibles[0];

	return json({
		id: list.id,
		title: list.title,
		introHtml: list.introHtml,
		isPublic: list.isPublic,
		items: await loadVerseListItems(db, list.id, bible?.id ?? null)
	});
}
