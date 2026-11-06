/** Portable representation of the Bible data held by Akribos. Source archives may contain
 * information not imported into the database and must be retained separately. */
import { createHash } from 'node:crypto';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { bibleDownloadGrants, resourceBooks, resources, verses, verseWords } from '../db/schema.ts';
import { strongAssignmentReviews } from '../db/strong-review-schema.ts';
import { taggedWordSegments } from '../../bible/segments.ts';

export async function bibleSnapshot(db: Database, id: string, publicly: boolean) {
	return db.transaction(
		async (tx) => {
			const [resource] = await tx
				.select()
				.from(resources)
				.where(
					and(eq(resources.id, id), eq(resources.kind, 'bible'), eq(resources.status, 'ready'))
				)
				.limit(1);
			if (!resource) return null;
			if (publicly) {
				if (!resource.isPublic) return null;
				const [grant] = await tx
					.select()
					.from(bibleDownloadGrants)
					.where(eq(bibleDownloadGrants.resourceId, id))
					.limit(1);
				if (!grant) return null;
			}
			const [bookRows, verseRows, wordRows, reviewRows] = await Promise.all([
				tx
					.select()
					.from(resourceBooks)
					.where(eq(resourceBooks.resourceId, id))
					.orderBy(asc(resourceBooks.bookId)),
				tx
					.select({
						id: verses.id,
						book: verses.bookId,
						chapter: verses.chapter,
						verse: verses.verse,
						verseEnd: verses.verseEnd,
						segments: verses.segments,
						text: verses.text,
						heading: verses.heading
					})
					.from(verses)
					.where(eq(verses.resourceId, id))
					.orderBy(asc(verses.bookId), asc(verses.chapter), asc(verses.verse)),
				tx
					.select({
						verseId: verseWords.verseId,
						position: verseWords.position,
						word: verseWords.word,
						strong: verseWords.strong,
						morph: verseWords.morph,
						lemma: verseWords.lemma,
						translit: verseWords.translit
					})
					.from(verseWords)
					.where(eq(verseWords.resourceId, id))
					.orderBy(asc(verseWords.verseId), asc(verseWords.position), asc(verseWords.strong)),
				tx
					.select()
					.from(strongAssignmentReviews)
					.where(
						publicly
							? and(
									eq(strongAssignmentReviews.resourceId, id),
									isNotNull(strongAssignmentReviews.approvedAt)
								)
							: eq(strongAssignmentReviews.resourceId, id)
					)
			]);
			const words = new Map<number, typeof wordRows>();
			for (const word of wordRows) {
				const list = words.get(word.verseId) ?? [];
				list.push(word);
				words.set(word.verseId, list);
			}
			const verseByRef = new Map(
				verseRows.map((verse) => [`${verse.book}:${verse.chapter}:${verse.verse}`, verse])
			);
			const fingerprintByRef = new Map(
				verseRows.map((verse) => [
					`${verse.book}:${verse.chapter}:${verse.verse}`,
					createHash('sha256').update(JSON.stringify(verse.segments)).digest('hex')
				])
			);
			return {
				format: 'akribos-bible-snapshot',
				version: 1,
				exportedAt: new Date().toISOString(),
				resource: {
					id: resource.id,
					name: resource.name,
					abbrev: resource.abbrev,
					coverTitle: resource.coverTitle,
					tabTitle: resource.tabTitle,
					selectionTitle: resource.selectionTitle,
					selectionSubtitle: resource.selectionSubtitle,
					language: resource.language,
					canon: resource.canon,
					direction: resource.direction,
					licenseHtml: resource.licenseHtml,
					sourceRevision: resource.sourceRevision,
					sourceFormat: resource.sourceFormat,
					hasStrongs: resource.hasStrongs,
					hasMorphology: resource.hasMorphology
				},
				books: bookRows.map(({ bookId, chapterCount, verseCount }) => ({
					bookId,
					chapterCount,
					verseCount
				})),
				verses: verseRows.map(({ id: verseId, ...verse }) => ({
					...verse,
					words: (words.get(verseId) ?? []).map(
						({ position, word, strong, morph, lemma, translit }) => ({
							position,
							word,
							strong,
							morph,
							lemma,
							translit
						})
					)
				})),
				reviews: reviewRows
					.filter((review) => {
						if (!publicly) return true;
						const ref = `${review.bookId}:${review.chapter}:${review.verse}`;
						const verse = verseByRef.get(ref);
						if (!verse || fingerprintByRef.get(ref) !== review.verseFingerprint) return false;
						const word = taggedWordSegments(verse.segments)[review.wordPosition];
						return (
							!!word &&
							word.text === review.word &&
							(word.strongs ?? [word.strong]).includes(review.strong)
						);
					})
					.map(
						({
							bookId,
							chapter,
							verse,
							wordPosition,
							strong,
							word,
							verseFingerprint,
							decision,
							approvedAt,
							createdAt,
							updatedAt,
							authorId,
							approvedBy
						}) => {
							const review = {
								bookId,
								chapter,
								verse,
								wordPosition,
								strong,
								word,
								verseFingerprint,
								decision,
								approvedAt,
								createdAt,
								updatedAt
							};
							return publicly ? review : { ...review, authorId, approvedBy };
						}
					)
			};
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
}

export function bibleSnapshotResponse(
	snapshot: NonNullable<Awaited<ReturnType<typeof bibleSnapshot>>>
): Response {
	const fileName = snapshot.resource.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'bibel';
	return new Response(JSON.stringify(snapshot), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${fileName}.akribos.json"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
}
