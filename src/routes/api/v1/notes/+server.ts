import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listUserNotes } from '$lib/server/repositories/verse-comments';
import { resolveApiIdentity } from '$lib/server/api/identity';
import { apiError } from '$lib/server/api/errors';

/**
 * The caller's own comments — both translation and verse-list comments — requires a session or a
 * `personal`-scope API key.
 */
export async function GET({ locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });

	const identity = resolveApiIdentity(locals);
	if (identity.scope !== 'personal' || !identity.userId) {
		return apiError(
			403,
			'personal_scope_required',
			'Reading comments needs a signed-in session or a personal-scope API key.'
		);
	}

	const notes = await listUserNotes(getDb(), identity.userId);
	return json({ notes });
}
