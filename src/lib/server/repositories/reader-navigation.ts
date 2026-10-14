import { and, eq } from 'drizzle-orm';
import { bookById } from '../../bible/books.ts';
import type { ReaderBookNavigation } from '../../reader/book-navigation.ts';
import type { Database } from '../db/client.ts';
import { commentaryEntries, crossReferences, resources, verses } from '../db/schema.ts';
import { readableResourceCondition } from './resources.ts';

/** Fresh reader access check, including private grants; never use the public resource-list cache. */
export async function loadReaderNavigation(
	db: Database,
	resourceId: string,
	userId?: string | null
): Promise<ReaderBookNavigation[] | undefined> {
	const [resource] = await db
		.select({ kind: resources.kind })
		.from(resources)
		.where(and(eq(resources.id, resourceId), readableResourceCondition(userId)));
	if (!resource || resource.kind === 'lexicon') return undefined;

	// chapter_count is a maximum, not evidence that all chapters before it exist. Read distinct
	// source positions instead, including both formats supported by a parallel-reference resource.
	const rows =
		resource.kind === 'bible'
			? await db
					.selectDistinct({ book: verses.bookId, chapter: verses.chapter })
					.from(verses)
					.where(eq(verses.resourceId, resourceId))
			: (
					await Promise.all([
						db
							.selectDistinct({
								book: commentaryEntries.bookId,
								chapter: commentaryEntries.chapter
							})
							.from(commentaryEntries)
							.where(eq(commentaryEntries.resourceId, resourceId)),
						resource.kind === 'xrefs'
							? db
									.selectDistinct({
										book: crossReferences.fromBook,
										chapter: crossReferences.fromChapter
									})
									.from(crossReferences)
									.where(eq(crossReferences.resourceId, resourceId))
							: Promise.resolve([])
					])
				).flat();
	const byBook = new Map<number, Set<number>>();
	for (const row of rows) {
		const book = bookById(row.book);
		// Offer positions supported by the Reader's reference parser and chapter endpoint.
		if (!book || row.chapter < 1 || row.chapter > book.chapters) continue;
		const chapters = byBook.get(row.book) ?? new Set<number>();
		chapters.add(row.chapter);
		byBook.set(row.book, chapters);
	}
	return [...byBook]
		.sort(([left], [right]) => left - right)
		.map(([book, chapters]) => ({ book, chapters: [...chapters].sort((a, b) => a - b) }));
}
