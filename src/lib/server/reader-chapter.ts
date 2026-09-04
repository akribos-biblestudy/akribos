import { bookName, bookShortName } from '$lib/bible/book-names';
import { nextChapter, previousChapter } from '$lib/bible/reference';
import type { Database } from './db/client.ts';
import { loadChapter } from './repositories/chapter.ts';
import { loadReferenceResources } from './repositories/reference-resources.ts';
import type { ReadableResource } from './repositories/resources.ts';
import { loadChapterVerseComments } from './repositories/verse-comments.ts';
import { loadChapterHighlights } from './repositories/verse-highlights.ts';
import { markedVersesByList } from './repositories/verse-lists.ts';
import { loadReaderDocumentAnchors } from './repositories/reader-documents.ts';

/**
 * Loads one chapter for one resource tab. Reader tabs can sit at unrelated references, so their
 * streams must not share the old page-wide chapter grid. Keeping the payload builder here also makes
 * the SSR chapter and endless-scroll API byte-for-byte compatible.
 */
export async function loadReaderTabChapter(
	db: Database,
	resource: ReadableResource,
	reference: { book: number; chapter: number },
	userId: string | null
) {
	const bibleIds = resource.kind === 'bible' ? [resource.id] : [];
	const [chapter, referenceResources, verseComments, highlights, markedVerses, documentAnchors] =
		await Promise.all([
			loadChapter(db, {
				resourceIds: bibleIds,
				book: reference.book,
				chapter: reference.chapter
			}),
			loadReferenceResources(db, {
				resourceIds: [resource.id],
				book: reference.book,
				chapter: reference.chapter
			}),
			userId
				? loadChapterVerseComments(db, userId, bibleIds, reference.book, reference.chapter)
				: Promise.resolve([]),
			userId
				? loadChapterHighlights(db, userId, reference.book, reference.chapter)
				: Promise.resolve([]),
			userId
				? markedVersesByList(db, userId, reference.book, reference.chapter)
				: Promise.resolve([]),
			loadReaderDocumentAnchors(
				db,
				userId,
				resource.kind === 'bible' ? resource.id : null,
				reference
			)
		]);

	for (const verse of referenceResources.verseNumbers) {
		if (!chapter.rows.some((row) => row.verse === verse)) {
			chapter.rows.push({ verse, cells: bibleIds.map(() => null) });
		}
	}
	chapter.rows.sort((left, right) => left.verse - right.verse);
	chapter.empty = chapter.rows.length === 0;

	return {
		resourceId: resource.id,
		reference,
		fullTitle: `${bookName(reference.book)} ${reference.chapter}`,
		shortBookName: bookShortName(reference.book),
		chapter: { ...chapter, headings: [...chapter.headings.entries()] },
		verseComments,
		highlights,
		markedVerses,
		documentAnchors,
		referenceResources,
		navigation: {
			previous: previousChapter(reference.book, reference.chapter),
			next: nextChapter(reference.book, reference.chapter)
		}
	};
}
