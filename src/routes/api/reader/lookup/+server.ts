import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listReaderResources } from '$lib/server/repositories/resources';
import { findLexiconEntry } from '$lib/server/repositories/strong';

/** Read one entry in the explicitly selected Reader dictionary, without Bible fallbacks. */
export async function GET({ url, locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const resourceId = (url.searchParams.get('resource') ?? '').trim();
	if (!query) error(400, 'Leere Eintragssuche');
	const db = getDb();
	const resource = (await listReaderResources(db, locals.user?.id)).find(
		(candidate) => candidate.id === resourceId && candidate.kind === 'lexicon'
	);
	if (!resource) error(404, 'Unbekanntes Lexikon');
	const entry = await findLexiconEntry(db, resource.id, query, locals.user?.id);
	return json({ resourceId: resource.id, query, entry: entry ?? null });
}
