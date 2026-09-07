import { config } from '$lib/server/config';

/** Search-engine directives. The admin area, personal pages and search results do not belong in an index. */
export function GET({ setHeaders }) {
	setHeaders({ 'content-type': 'text/plain', 'cache-control': 'public, max-age=86400' });

	const origin = config().ORIGIN.replace(/\/$/, '');

	return new Response(
		[
			'User-agent: *',
			'Disallow: /admin',
			'Disallow: /account',
			'Disallow: /lists',
			'Disallow: /l/',
			// Crawlers must see the 410/noindex responses to remove previously indexed notes.
			'Allow: /notes/published',
			'Disallow: /notes',
			'Disallow: /sermons',
			'Disallow: /search',
			'Disallow: /api/',
			'Allow: /',
			'',
			`Sitemap: ${origin}/sitemap.xml`,
			''
		].join('\n')
	);
}
