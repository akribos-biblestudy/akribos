import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listBibles } from '$lib/server/repositories/resources';
import { loadCommentsForList } from '$lib/server/repositories/verse-list-comments';
import { findVerseList, loadVerseListItems } from '$lib/server/repositories/verse-lists';

/**
 * Public, read-only view of a shared verse list.
 *
 * Reachable only through the unguessable slug, and only while sharing is on. No session is involved,
 * so the page is cacheable and can be opened by anyone the link is given to. This is the read-only
 * link from the original feature, kept unchanged and independent of the email-invited membership
 * added alongside it: comments are shown (with author names) but cannot be added, replied to or
 * reacted to from here — that needs a session and, through it, membership.
 */
export async function load({ params, setHeaders }) {
	const db = getDb();
	const list = await findVerseList(db, { slug: params.slug });
	if (!list || !list.isPublic) error(404, 'Diese Stellensammlung ist nicht öffentlich.');

	const bibles = await listBibles(db);
	const primary = bibles[0]?.id ?? null;

	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=300' });

	return {
		list: { title: list.title, introHtml: list.introHtml },
		items: await loadVerseListItems(db, list.id, primary, { redactEmail: true }),
		comments: await loadCommentsForList(db, list.id, null),
		title: list.title,
		translation: bibles[0]?.tabTitle ?? null
	};
}
