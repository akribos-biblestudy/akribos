import { resourceViewerId } from '$lib/server/api/identity';
import type { RequestEvent } from '@sveltejs/kit';
import type { ResourceAccessChannel } from '$lib/server/repositories/resources';
import { json } from '@sveltejs/kit';
import { bookById } from '$lib/bible/books';
import { getDb } from '$lib/server/db';
import { loadChapter, type ChapterVerse } from '$lib/server/repositories/chapter';
import { listBibles } from '$lib/server/repositories/resources';
import { apiError } from '$lib/server/api/errors';

/** One translation's text for one chapter. `book` is the canonical id from `GET /books`. */
export async function bibleChapterResponse(
	{ params, setHeaders, locals }: Pick<RequestEvent, 'params' | 'setHeaders' | 'locals'>,
	channel: ResourceAccessChannel
) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const book = Number(params.book);
	const chapter = Number(params.chapter);
	if (!bookById(book)) return apiError(404, 'unknown_book', `No book with id ${params.book}.`);
	if (!Number.isInteger(chapter) || chapter < 1) {
		return apiError(404, 'unknown_chapter', `"${params.chapter}" is not a valid chapter number.`);
	}

	const db = getDb();
	const bibles = await listBibles(db, resourceViewerId(locals), channel);
	const bible = bibles.find((candidate) => candidate.id === params.bible);
	if (!bible) return apiError(404, 'unknown_bible', `No bible with id "${params.bible}".`);

	const result = await loadChapter(db, { resourceIds: [bible.id], book, chapter });
	if (result.empty) {
		return apiError(404, 'chapter_not_found', `${bible.id} has no text for this chapter.`);
	}

	return json({
		bible: bible.id,
		book,
		chapter,
		verses: result.rows
			.map((row) => row.cells[0])
			.filter((cell): cell is ChapterVerse => cell !== null)
			.map((cell) => ({
				verse: cell.verse,
				verseEnd: cell.verseEnd,
				segments: cell.segments,
				heading: cell.heading
			})),
		headings: [...result.headings.entries()]
	});
}
