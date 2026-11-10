import { error, json } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { bookName, bookShortName } from '$lib/bible/book-names';
import { bookTitle } from '$lib/bible/book-titles';
import { nextChapter, previousChapter } from '$lib/bible/reference';
import { assertAppRequest } from '$lib/server/app/adapter';
import { checkApiRateLimit } from '$lib/server/api/rate-limit';
import { getDb } from '$lib/server/db';
import { commentaryEntries, crossReferences, resources, verses } from '$lib/server/db/schema';
import { arrangeChapter } from '$lib/server/repositories/chapter';
import { readableResourceCondition } from '$lib/server/repositories/resources';
import type { RequestHandler } from './$types';

// Transport bound, not a licence duration or a promise about device storage.
const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;

function groupByChapter<T extends { book: number; chapter: number }>(rows: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = `${row.book}:${row.chapter}`;
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}
	return groups;
}

export const GET: RequestHandler = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store', vary: 'Cookie' });
	assertAppRequest(event);
	const rate = await checkApiRateLimit(getDb(), `offline:ip:${event.getClientAddress()}`, 30);
	if (!rate.allowed) {
		event.setHeaders({ 'retry-after': String(rate.retryAfterSeconds) });
		error(429, 'Zu viele Offline-Anfragen. Bitte später erneut versuchen.');
	}
	const owner = event.locals.user?.id ?? null;
	const result = await getDb().transaction(
		async (tx) => {
			const [resource] = await tx
				.select({
					id: resources.id,
					kind: resources.kind,
					name: resources.name,
					abbrev: resources.abbrev,
					coverTitle: sql<string>`coalesce(${resources.coverTitle}, ${resources.abbrev})`,
					tabTitle: sql<string>`coalesce(${resources.tabTitle}, ${resources.abbrev})`,
					selectionTitle: sql<string>`coalesce(${resources.selectionTitle}, ${resources.name})`,
					selectionSubtitle: sql<
						string | null
					>`coalesce(${resources.selectionSubtitle}, ${resources.abbrev})`,
					language: resources.language,
					canon: resources.canon,
					direction: resources.direction,
					sortOrder: resources.sortOrder,
					hasStrongs: resources.hasStrongs,
					hasMorphology: resources.hasMorphology,
					licenseHtml: resources.licenseHtml,
					usageNotesHtml: resources.usageNotesHtml,
					sourceRevision: resources.sourceRevision,
					updatedAt: resources.updatedAt
				})
				.from(resources)
				.where(
					and(eq(resources.id, event.params.resource), readableResourceCondition(owner, 'offline'))
				)
				.limit(1);
			if (!resource || !['bible', 'commentary', 'xrefs'].includes(resource.kind))
				error(404, 'Werk nicht für Offline-Nutzung verfügbar');

			// Measure uncompressed serialized content before loading it into the server process.
			const [verseSize] = await tx
				.select({
					bytes: sql<number>`coalesce(sum(octet_length(${verses.segments}::text) + coalesce(octet_length(${verses.heading}), 0) + 128), 0)`
				})
				.from(verses)
				.where(eq(verses.resourceId, resource.id));
			const [commentSize] = await tx
				.select({
					bytes: sql<number>`coalesce(sum(octet_length(${commentaryEntries.bodyHtml}) + coalesce(octet_length(${commentaryEntries.title}), 0) + 192), 0)`
				})
				.from(commentaryEntries)
				.where(eq(commentaryEntries.resourceId, resource.id));
			const [crossSize] = await tx
				.select({ bytes: sql<number>`count(*) * 192` })
				.from(crossReferences)
				.where(eq(crossReferences.resourceId, resource.id));
			if (
				Number(verseSize?.bytes ?? 0) +
					Number(commentSize?.bytes ?? 0) +
					Number(crossSize?.bytes ?? 0) >
				MAX_PACKAGE_BYTES
			)
				error(413, 'Werk ist zu groß');

			const verseRows =
				resource.kind === 'bible'
					? await tx
							.select({
								resourceId: verses.resourceId,
								book: verses.bookId,
								chapter: verses.chapter,
								verse: verses.verse,
								verseEnd: verses.verseEnd,
								segments: verses.segments,
								heading: verses.heading
							})
							.from(verses)
							.where(eq(verses.resourceId, resource.id))
							.orderBy(asc(verses.bookId), asc(verses.chapter), asc(verses.verse))
					: [];
			const comments = await tx
				.select({
					book: commentaryEntries.bookId,
					chapter: commentaryEntries.chapter,
					id: commentaryEntries.id,
					resourceId: commentaryEntries.resourceId,
					verseStart: commentaryEntries.verseStart,
					verseEnd: commentaryEntries.verseEnd,
					title: commentaryEntries.title,
					bodyHtml: commentaryEntries.bodyHtml
				})
				.from(commentaryEntries)
				.where(eq(commentaryEntries.resourceId, resource.id))
				.orderBy(
					asc(commentaryEntries.bookId),
					asc(commentaryEntries.chapter),
					asc(commentaryEntries.verseStart),
					asc(commentaryEntries.id)
				);
			const crosses = await tx
				.select({
					book: crossReferences.fromBook,
					chapter: crossReferences.fromChapter,
					id: crossReferences.id,
					resourceId: crossReferences.resourceId,
					fromVerse: crossReferences.fromVerse,
					toBook: crossReferences.toBook,
					toChapter: crossReferences.toChapter,
					toVerse: crossReferences.toVerse,
					toVerseEnd: crossReferences.toVerseEnd,
					votes: crossReferences.votes
				})
				.from(crossReferences)
				.where(eq(crossReferences.resourceId, resource.id))
				.orderBy(
					asc(crossReferences.fromBook),
					asc(crossReferences.fromChapter),
					asc(crossReferences.fromVerse),
					asc(crossReferences.toBook),
					asc(crossReferences.toVerse)
				);

			const verseGroups = groupByChapter(verseRows);
			const commentGroups = groupByChapter(comments);
			const crossGroups = groupByChapter(crosses);
			const keys = new Set([...verseGroups.keys(), ...commentGroups.keys(), ...crossGroups.keys()]);
			const chapters = [...keys]
				.map((key) => {
					const [book, chapterNumber] = key.split(':').map(Number) as [number, number];
					const chapter = arrangeChapter(
						verseGroups.get(key) ?? [],
						resource.kind === 'bible' ? [resource.id] : [],
						book,
						chapterNumber
					);
					const chapterComments = (commentGroups.get(key) ?? []).map((row) => ({
						id: row.id,
						resourceId: row.resourceId,
						verseStart: row.verseStart,
						verseEnd: row.verseEnd,
						title: row.title,
						bodyHtml: row.bodyHtml
					}));
					const chapterCrosses = (crossGroups.get(key) ?? []).map((row) => ({
						id: row.id,
						resourceId: row.resourceId,
						fromVerse: row.fromVerse,
						toBook: row.toBook,
						toChapter: row.toChapter,
						toVerse: row.toVerse,
						toVerseEnd: row.toVerseEnd,
						votes: row.votes
					}));
					const verseNumbers = [
						...new Set([
							...chapterComments.map((item) => item.verseStart ?? 1),
							...chapterCrosses.map((item) => item.fromVerse)
						])
					].sort((a, b) => a - b);
					for (const verse of verseNumbers)
						if (!chapter.rows.some((row) => row.verse === verse))
							chapter.rows.push({ verse, cells: resource.kind === 'bible' ? [null] : [] });
					chapter.rows.sort((a, b) => a.verse - b.verse);
					chapter.empty = chapter.rows.length === 0;
					const reference = { book, chapter: chapterNumber };
					return {
						resourceId: resource.id,
						reference,
						fullTitle: `${bookName(book)} ${chapterNumber}`,
						shortBookName: bookShortName(book),
						bookTitle: bookTitle(book, resource.language),
						chapter: { ...chapter, headings: [...chapter.headings.entries()] },
						highlights: [],
						markedVerses: [],
						documentAnchors: [],
						referenceResources: {
							commentaries: chapterComments,
							crossReferences: chapterCrosses,
							verseNumbers
						},
						navigation: {
							previous: previousChapter(book, chapterNumber),
							next: nextChapter(book, chapterNumber)
						}
					};
				})
				.sort(
					(a, b) => a.reference.book - b.reference.book || a.reference.chapter - b.reference.chapter
				);
			return { version: 1, owner, resource, chapters };
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
	if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PACKAGE_BYTES)
		error(413, 'Werk ist zu groß');
	return json(result);
};
