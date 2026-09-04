import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { listPublishedDocuments } from '$lib/server/repositories/document-publications';

const FEED_LIMIT = 50;
const EMPTY_FEED_UPDATED = new Date(0).toISOString();

/** Atom feed of public note snapshots. Unlisted notes never enter discovery surfaces. */
export async function GET({ setHeaders }) {
	const origin = config().ORIGIN.replace(/\/$/, '');
	const feedUrl = `${origin}/notes/published/feed.xml`;
	const publicationsUrl = `${origin}/notes/published`;
	const publications = await listPublishedDocuments(getDb(), { limit: FEED_LIMIT });
	const updated = publications[0]?.publishedAt.toISOString() ?? EMPTY_FEED_UPDATED;

	setHeaders({
		'content-type': 'application/atom+xml; charset=utf-8',
		'cache-control': 'public, max-age=0, must-revalidate'
	});

	const entries = publications.map((publication) => {
		const publicationUrl = `${origin}/notes/published/${encodeURIComponent(publication.slug)}`;
		const categories = publication.tags
			.map((tag) => `\t\t<category term="${escapeXml(tag)}" />`)
			.join('\n');

		return [
			'\t<entry>',
			`\t\t<title>${escapeXml(publication.title)}</title>`,
			`\t\t<id>${escapeXml(publicationUrl)}</id>`,
			`\t\t<link href="${escapeXml(publicationUrl)}" />`,
			`\t\t<published>${publication.firstPublishedAt.toISOString()}</published>`,
			`\t\t<updated>${publication.publishedAt.toISOString()}</updated>`,
			`\t\t<author><name>${escapeXml(publication.authorName)}</name></author>`,
			`\t\t<summary type="text">${escapeXml(publication.excerpt)}</summary>`,
			`\t\t<content type="html">${escapeXml(publication.bodyHtml)}</content>`,
			categories,
			'\t</entry>'
		]
			.filter(Boolean)
			.join('\n');
	});

	return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="de">
	<title>Akribos – Veröffentlichte Notizen</title>
	<id>${escapeXml(publicationsUrl)}</id>
	<link href="${escapeXml(publicationsUrl)}" />
	<link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml" />
	<updated>${updated}</updated>
${entries.join('\n')}
</feed>
`);
}

/** Escapes element and attribute content and drops code points forbidden by XML 1.0. */
function escapeXml(value: string): string {
	let valid = '';
	for (const character of value) {
		const codePoint = character.codePointAt(0)!;
		if (
			codePoint === 0x09 ||
			codePoint === 0x0a ||
			codePoint === 0x0d ||
			(codePoint >= 0x20 && codePoint <= 0xd7ff) ||
			(codePoint >= 0xe000 && codePoint <= 0xfffd) ||
			(codePoint >= 0x10000 && codePoint <= 0x10ffff)
		) {
			valid += character;
		}
	}

	return valid
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
