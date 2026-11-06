import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { checkApiRateLimit } from '$lib/server/api/rate-limit';
import { bibleSnapshot, bibleSnapshotResponse } from '$lib/server/bible-export/snapshot';
import { limitPublicDownload } from '$lib/server/bible-export/public-download-gate';
import { usxResponse } from '$lib/server/bible-export/usx';

export async function GET({ params, url, request, getClientAddress }) {
	return limitPublicDownload(request.signal, async () => {
		const db = getDb();
		const rate = await checkApiRateLimit(db, `bible-download:ip:${getClientAddress()}`, 20);
		if (!rate.allowed)
			return new Response('Zu viele Bibel-Downloads. Bitte später erneut versuchen.', {
				status: 429,
				headers: { 'Retry-After': String(rate.retryAfterSeconds), 'Cache-Control': 'no-store' }
			});
		const snapshot = await bibleSnapshot(db, params.id, true);
		if (!snapshot) error(404, 'Bibel nicht gefunden');
		return url.searchParams.get('format') === 'usx'
			? usxResponse(snapshot)
			: bibleSnapshotResponse(snapshot);
	});
}
