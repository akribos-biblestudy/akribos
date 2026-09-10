import { resourceViewerId } from '$lib/server/api/identity';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listResources } from '$lib/server/repositories/resources';

/** Every public, ready-to-read bible, lexicon, commentary and cross-reference set. */
export async function GET({ setHeaders, locals }) {
	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=3600' });
	const resources = await listResources(getDb(), resourceViewerId(locals));
	return json({ resources });
}
