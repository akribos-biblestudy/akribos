import { error, json } from '@sveltejs/kit';
import { bookById } from '$lib/bible/books';
import { getDb } from '$lib/server/db';
import { loadReaderTabChapter } from '$lib/server/reader-chapter';
import { listReaderResources } from '$lib/server/repositories/resources';

export async function GET({ params, url, locals, setHeaders }) {
	const book = Number(params.book);
	const chapterNumber = Number(params.chapter);
	const definition = bookById(book);
	if (
		!definition ||
		!Number.isSafeInteger(chapterNumber) ||
		chapterNumber < 1 ||
		chapterNumber > definition.chapters
	) {
		error(404, 'Unbekanntes Kapitel');
	}

	const db = getDb();
	const readerResources = await listReaderResources(db);
	const resource = readerResources.find(
		(candidate) => candidate.id === url.searchParams.get('resource')
	);
	if (!resource) error(404, 'Unbekannte Ressource');
	setHeaders({ 'cache-control': 'private, no-store' });
	return json(
		await loadReaderTabChapter(
			db,
			resource,
			{ book, chapter: chapterNumber },
			locals.user?.id ?? null
		)
	);
}
