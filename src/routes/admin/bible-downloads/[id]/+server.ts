import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { bibleSnapshot, bibleSnapshotResponse } from '$lib/server/bible-export/snapshot';
import { usxResponse } from '$lib/server/bible-export/usx';

export async function GET({ params, url }) {
	const snapshot = await bibleSnapshot(getDb(), params.id, false);
	if (!snapshot) error(404, 'Bibel nicht gefunden');
	return url.searchParams.get('format') === 'usx'
		? usxResponse(snapshot)
		: bibleSnapshotResponse(snapshot);
}
