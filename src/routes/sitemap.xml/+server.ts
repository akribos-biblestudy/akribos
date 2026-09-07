import { BOOKS } from '$lib/bible/books';
import { bookShortName } from '$lib/bible/book-names';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { chapterCount } from '$lib/server/repositories/resources';
import { listBibles } from '$lib/server/repositories/resources';

/** Sitemap of Bible chapters with imported text and general site pages; no shared notes. */
export async function GET({ setHeaders }) {
	const db = getDb();
	const bibles = await listBibles(db);
	const resourceIds = bibles.map((bible) => bible.id);
	const origin = config().ORIGIN.replace(/\/$/, '');

	// "/" is now always a personalized, private redirect (never public content), so it must not be
	// advertised as an indexable URL; "/about" carries the marketing landing page instead.
	const urls: string[] = [`${origin}/about`, `${origin}/help`];

	for (const book of BOOKS) {
		const chapters = await chapterCount(db, resourceIds, book.id);
		for (let chapter = 1; chapter <= chapters; chapter += 1) {
			urls.push(`${origin}/${bookShortName(book.id)}${chapter}`);
		}
	}

	setHeaders({
		'content-type': 'application/xml',
		'cache-control': 'public, max-age=0, must-revalidate'
	});

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `\t<url><loc>${escapeXml(url)}</loc></url>`).join('\n')}
</urlset>
`
	);
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
