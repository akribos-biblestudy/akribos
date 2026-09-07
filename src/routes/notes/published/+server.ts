/** Retired discovery endpoint: never enumerates shared note URLs. */
export function GET() {
	return new Response('Die öffentliche Notizübersicht wurde entfernt.', {
		status: 410,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'private, no-store',
			'x-robots-tag': 'noindex, nofollow'
		}
	});
}
