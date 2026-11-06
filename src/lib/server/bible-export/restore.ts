import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { segmentsToText, type VerseSegment } from '../../bible/segments.ts';
import type { Database } from '../db/client.ts';
import {
	bibleDownloadGrants,
	resourceBooks,
	resources,
	users,
	verses,
	verseWords
} from '../db/schema.ts';
import { strongAssignmentReviews } from '../db/strong-review-schema.ts';
import { refreshStrongStatistics } from '../db/statistics.ts';
import { invalidateResourceCache } from '../repositories/resources.ts';

const text = z.string().max(20000);
const maybeText = text.nullable();
const strong = z.string().regex(/^[GH]\d+$/);
const segment: z.ZodType<VerseSegment> = z.lazy(() =>
	z.union([
		text,
		z
			.object({
				kind: z.literal('w'),
				text,
				strong,
				strongs: z.array(strong).min(1).max(50).optional(),
				morph: text.optional()
			})
			.strict(),
		z.object({ kind: z.literal('note'), marker: text, text }).strict(),
		z.object({ kind: z.literal('em'), text }).strict(),
		z.object({ kind: z.literal('br') }).strict(),
		z.object({ kind: z.enum(['wj', 'nd']), children: z.array(segment).max(10000) }).strict()
	])
);
const word = z
	.object({
		position: z.number().int().min(0).max(100000),
		word: text,
		strong,
		morph: maybeText,
		lemma: maybeText,
		translit: maybeText
	})
	.strict();
const ref = {
	book: z.number().int().min(1).max(66),
	chapter: z.number().int().min(1).max(200),
	verse: z.number().int().min(1).max(250)
};
const snapshotSchema = z
	.object({
		format: z.literal('akribos-bible-snapshot'),
		version: z.literal(1),
		exportedAt: z.iso.datetime(),
		resource: z
			.object({
				id: z.string().regex(/^[\w.-]{1,120}$/),
				name: text,
				abbrev: text,
				coverTitle: maybeText,
				tabTitle: maybeText,
				selectionTitle: maybeText,
				selectionSubtitle: maybeText,
				language: text,
				canon: z.enum(['ot', 'nt', 'both']),
				direction: z.enum(['ltr', 'rtl']),
				licenseHtml: maybeText,
				sourceRevision: maybeText,
				sourceFormat: maybeText,
				hasStrongs: z.boolean(),
				hasMorphology: z.boolean()
			})
			.strict(),
		books: z
			.array(
				z
					.object({
						bookId: z.number().int().min(1).max(66),
						chapterCount: z.number().int().min(1).max(200),
						verseCount: z.number().int().positive()
					})
					.strict()
			)
			.max(66),
		verses: z
			.array(
				z
					.object({
						...ref,
						verseEnd: z.number().int().min(1).max(250).nullable(),
						segments: z.array(segment).max(10000),
						text,
						heading: maybeText,
						words: z.array(word).max(10000)
					})
					.strict()
			)
			.min(1)
			.max(100000),
		reviews: z
			.array(
				z
					.object({
						bookId: z.number().int().min(1).max(66),
						chapter: z.number().int().min(1).max(200),
						verse: z.number().int().min(1).max(250),
						wordPosition: z.number().int().min(0).max(100000),
						strong,
						word: text,
						verseFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
						decision: z.enum(['confirmed', 'incorrect']),
						approvedAt: z.iso.datetime().nullable(),
						createdAt: z.iso.datetime(),
						updatedAt: z.iso.datetime(),
						authorId: z.uuid().nullable().optional(),
						approvedBy: z.uuid().nullable().optional()
					})
					.strict()
			)
			.max(1000000)
	})
	.strict();

export function parseBibleSnapshot(contents: string) {
	const snapshot = snapshotSchema.parse(JSON.parse(contents));
	const refs = new Set<string>();
	const reviewRefs = new Set<string>();
	const bookCounts = new Map<number, { chapterCount: number; verseCount: number }>();
	for (const verse of snapshot.verses) {
		const key = `${verse.book}:${verse.chapter}:${verse.verse}`;
		if (
			refs.has(key) ||
			(verse.verseEnd !== null && verse.verseEnd < verse.verse) ||
			segmentsToText(verse.segments) !== verse.text
		)
			throw new Error('Die Bibelsicherung enthält widersprüchliche Versdaten.');
		refs.add(key);
		const book = bookCounts.get(verse.book) ?? { chapterCount: 0, verseCount: 0 };
		book.chapterCount = Math.max(book.chapterCount, verse.chapter);
		book.verseCount++;
		bookCounts.set(verse.book, book);
	}
	if (
		snapshot.books.length !== bookCounts.size ||
		snapshot.books.some((book) => {
			const computed = bookCounts.get(book.bookId);
			return (
				!computed ||
				computed.chapterCount !== book.chapterCount ||
				computed.verseCount !== book.verseCount
			);
		})
	)
		throw new Error('Die Bibelsicherung enthält widersprüchliche Buchdaten.');
	for (const review of snapshot.reviews) {
		const refKey = `${review.bookId}:${review.chapter}:${review.verse}`;
		const key = `${refKey}:${review.wordPosition}:${review.strong}`;
		if (reviewRefs.has(key))
			throw new Error('Die Bibelsicherung enthält widersprüchliche Prüfungen.');
		reviewRefs.add(key);
	}
	return snapshot;
}

/** Replace one resource atomically. Personal workspace and feedback data are not modified. */
export async function restoreBibleSnapshot(
	db: Database,
	snapshot: ReturnType<typeof parseBibleSnapshot>
) {
	const { resource, verses: savedVerses, reviews } = snapshot;
	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ kind: resources.kind })
			.from(resources)
			.where(eq(resources.id, resource.id))
			.limit(1);
		if (existing && existing.kind !== 'bible')
			throw new Error('Diese Ressourcenkennung gehört bereits zu einem anderen Werk.');
		const metadata = {
			name: resource.name,
			isPublic: false,
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
			sourceFile: null,
			hasStrongs: resource.hasStrongs,
			hasMorphology: resource.hasMorphology,
			verseCount: savedVerses.length,
			wordCount: savedVerses.reduce((n, verse) => n + verse.words.length, 0),
			status: 'ready' as const,
			updatedAt: new Date()
		};
		await tx
			.insert(resources)
			.values({ id: resource.id, kind: 'bible', ...metadata })
			.onConflictDoUpdate({ target: resources.id, set: metadata });
		await tx.delete(bibleDownloadGrants).where(eq(bibleDownloadGrants.resourceId, resource.id));
		await tx
			.delete(strongAssignmentReviews)
			.where(eq(strongAssignmentReviews.resourceId, resource.id));
		await tx.delete(verses).where(eq(verses.resourceId, resource.id));
		await tx.delete(resourceBooks).where(eq(resourceBooks.resourceId, resource.id));
		if (snapshot.books.length)
			await tx
				.insert(resourceBooks)
				.values(snapshot.books.map((book) => ({ resourceId: resource.id, ...book })));
		for (let offset = 0; offset < savedVerses.length; offset += 400) {
			const chunk = savedVerses.slice(offset, offset + 400);
			const inserted = await tx
				.insert(verses)
				.values(
					chunk.map((verse) => ({
						resourceId: resource.id,
						bookId: verse.book,
						chapter: verse.chapter,
						verse: verse.verse,
						verseEnd: verse.verseEnd,
						segments: verse.segments,
						text: verse.text,
						heading: verse.heading
					}))
				)
				.returning({
					id: verses.id,
					book: verses.bookId,
					chapter: verses.chapter,
					verse: verses.verse
				});
			const ids = new Map(inserted.map((v) => [`${v.book}:${v.chapter}:${v.verse}`, v.id]));
			const rows = chunk.flatMap((verse) =>
				verse.words.map((word) => ({
					resourceId: resource.id,
					verseId: ids.get(`${verse.book}:${verse.chapter}:${verse.verse}`)!,
					bookId: verse.book,
					...word
				}))
			);
			for (let j = 0; j < rows.length; j += 2000)
				await tx.insert(verseWords).values(rows.slice(j, j + 2000));
		}
		const userIds = [
			...new Set(
				reviews
					.flatMap((review) => [review.authorId, review.approvedBy])
					.filter((id): id is string => !!id)
			)
		];
		const existingUsers = new Set(
			userIds.length
				? (await tx.select({ id: users.id }).from(users).where(inArray(users.id, userIds))).map(
						(u) => u.id
					)
				: []
		);
		const rows = reviews.map((review) => ({
			...review,
			resourceId: resource.id,
			authorId: review.authorId && existingUsers.has(review.authorId) ? review.authorId : null,
			approvedBy:
				review.approvedBy && existingUsers.has(review.approvedBy) ? review.approvedBy : null,
			approvedAt: review.approvedAt ? new Date(review.approvedAt) : null,
			createdAt: new Date(review.createdAt),
			updatedAt: new Date(review.updatedAt)
		}));
		for (let offset = 0; offset < rows.length; offset += 500)
			await tx.insert(strongAssignmentReviews).values(rows.slice(offset, offset + 500));
	});
	invalidateResourceCache();
	try {
		await refreshStrongStatistics(db);
		return { statisticsRefreshed: true };
	} catch {
		return { statisticsRefreshed: false };
	}
}
