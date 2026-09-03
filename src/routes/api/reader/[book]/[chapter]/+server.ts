import { error, json } from '@sveltejs/kit';
import { bookById } from '$lib/bible/books';
import { bookName, bookShortName } from '$lib/bible/book-names';
import { nextChapter, previousChapter } from '$lib/bible/reference';
import { activeReaderTab, activeResourceIds } from '$lib/reader/workspace';
import { getDb } from '$lib/server/db';
import { resolveReaderWorkspace } from '$lib/server/reader-workspace';
import { loadChapter } from '$lib/server/repositories/chapter';
import { loadChapterVerseComments } from '$lib/server/repositories/verse-comments';
import { loadReferenceResources } from '$lib/server/repositories/reference-resources';
import { listBibles, listReaderResources } from '$lib/server/repositories/resources';
import { loadChapterHighlights } from '$lib/server/repositories/verse-highlights';

export async function GET({ params, cookies, locals, setHeaders }) {
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
	const [bibles, readerResources] = await Promise.all([listBibles(db), listReaderResources(db)]);
	const workspace = resolveReaderWorkspace(
		cookies,
		readerResources,
		locals.user?.readerWorkspace,
		locals.user?.readerColumns
	);
	const byId = new Map(readerResources.map((resource) => [resource.id, resource]));
	const activeIds = activeResourceIds(workspace);
	const bibleIds = activeIds.filter((id) => byId.get(id)?.kind === 'bible');
	const [chapter, referenceResources, verseComments, highlights] = await Promise.all([
		loadChapter(db, { resourceIds: bibleIds, book, chapter: chapterNumber }),
		loadReferenceResources(db, {
			resourceIds: activeIds,
			book,
			chapter: chapterNumber
		}),
		locals.user
			? loadChapterVerseComments(db, locals.user.id, bibleIds, book, chapterNumber)
			: Promise.resolve([]),
		locals.user
			? loadChapterHighlights(db, locals.user.id, book, chapterNumber)
			: Promise.resolve([])
	]);

	for (const verse of referenceResources.verseNumbers) {
		if (!chapter.rows.some((row) => row.verse === verse)) {
			chapter.rows.push({ verse, cells: bibleIds.map(() => null) });
		}
	}
	chapter.rows.sort((left, right) => left.verse - right.verse);
	chapter.empty = chapter.rows.length === 0;

	let bibleCellIndex = 0;
	const columns = workspace.tiles.flatMap((tile) => {
		const tab = activeReaderTab(tile);
		const resource = tab ? byId.get(tab.resourceId) : undefined;
		if (!tab || !resource) return [];
		return [
			{
				resourceId: resource.id,
				bibleCellIndex: resource.kind === 'bible' ? bibleCellIndex++ : null
			}
		];
	});
	setHeaders({ 'cache-control': 'private, no-store' });

	return json({
		reference: { book, chapter: chapterNumber },
		fullTitle: `${bookName(book)} ${chapterNumber}`,
		shortBookName: bookShortName(book),
		chapter: { ...chapter, headings: [...chapter.headings.entries()] },
		verseComments,
		highlights,
		referenceResources,
		columns,
		navigation: {
			previous: previousChapter(book, chapterNumber),
			next: nextChapter(book, chapterNumber)
		}
	});
}
