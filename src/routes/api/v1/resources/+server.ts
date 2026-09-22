import { resourceViewerId } from '$lib/server/api/identity';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listResources } from '$lib/server/repositories/resources';

/** Every public, ready-to-read bible, lexicon, commentary and cross-reference set. */
export async function GET({ setHeaders, locals }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const resources = await listResources(getDb(), resourceViewerId(locals), 'api');
	return json({ resources });
}
