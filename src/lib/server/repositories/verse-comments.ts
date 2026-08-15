import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { sanitizeNoteHtml } from '../../notes/sanitize.ts';
import type { Database } from '../db/client.ts';
import {
	resources,
	verseComments,
	verseListItemComments,
	verseListItems,
	verseLists
} from '../db/schema.ts';

export type ChapterVerseComment = {
	resourceId: string;
	verse: number;
	html: string;
};

export async function loadChapterVerseComments(
	db: Database,
	userId: string,
	resourceIds: string[],
	book: number,
	chapter: number
): Promise<ChapterVerseComment[]> {
	if (resourceIds.length === 0) return [];
	return db
		.select({
			resourceId: verseComments.resourceId,
			verse: verseComments.verse,
			html: verseComments.commentHtml
		})
		.from(verseComments)
		.where(
			and(
				eq(verseComments.userId, userId),
				inArray(verseComments.resourceId, resourceIds),
				eq(verseComments.bookId, book),
				eq(verseComments.chapter, chapter)
			)
		);
}

/** Saving an empty comment removes it, so a blank bubble never survives a reload. */
export async function saveVerseComment(
	db: Database,
	userId: string,
	reference: { book: number; chapter: number; verse: number },
	resourceId: string,
	html: string
): Promise<string> {
	const clean = sanitizeNoteHtml(html);
	const key = and(
		eq(verseComments.userId, userId),
		eq(verseComments.resourceId, resourceId),
		eq(verseComments.bookId, reference.book),
		eq(verseComments.chapter, reference.chapter),
		eq(verseComments.verse, reference.verse)
	);

	if (!clean) {
		await db.delete(verseComments).where(key);
		return '';
	}

	await db
		.insert(verseComments)
		.values({
			userId,
			resourceId,
			bookId: reference.book,
			chapter: reference.chapter,
			verse: reference.verse,
			commentHtml: clean
		})
		.onConflictDoUpdate({
			target: [
				verseComments.userId,
				verseComments.resourceId,
				verseComments.bookId,
				verseComments.chapter,
				verseComments.verse
			],
			set: { commentHtml: clean, updatedAt: new Date() }
		});
	return clean;
}

export type UserNoteOverview = {
	id: string;
	kind: 'translation' | 'list';
	book: number;
	chapter: number;
	verse: number;
	html: string;
	updatedAt: Date;
	listId: string | null;
	listTitle: string | null;
	/** The verse-list item this comment is attached to, for the anchor `/lists/{listId}#note-{itemId}`. */
	itemId: string | null;
	resourceId: string | null;
	resourceName: string | null;
};

/**
 * Every translation comment and verse-list comment written by a user, newest first.
 *
 * "List" here means every comment (root note or reply) the user has authored on any list they belong
 * to — their own or one shared with them — not only lists they own: collaborating on someone else's
 * list is still worth surfacing in this personal overview.
 */
export async function listUserNotes(db: Database, userId: string): Promise<UserNoteOverview[]> {
	const [translations, lists] = await Promise.all([
		db
			.select({
				id: verseComments.id,
				book: verseComments.bookId,
				chapter: verseComments.chapter,
				verse: verseComments.verse,
				html: verseComments.commentHtml,
				updatedAt: verseComments.updatedAt,
				resourceId: verseComments.resourceId,
				resourceName: sql<string>`coalesce(${resources.tabTitle}, ${resources.abbrev})`
			})
			.from(verseComments)
			.innerJoin(resources, eq(resources.id, verseComments.resourceId))
			.where(eq(verseComments.userId, userId))
			.orderBy(desc(verseComments.updatedAt)),
		db
			.select({
				id: verseListItemComments.id,
				itemId: verseListItems.id,
				book: verseListItems.bookId,
				chapter: verseListItems.chapter,
				verse: verseListItems.verse,
				html: verseListItemComments.bodyHtml,
				updatedAt: verseListItemComments.updatedAt,
				listId: verseLists.id,
				listTitle: verseLists.title
			})
			.from(verseListItemComments)
			.innerJoin(verseListItems, eq(verseListItems.id, verseListItemComments.itemId))
			.innerJoin(verseLists, eq(verseLists.id, verseListItems.listId))
			.where(eq(verseListItemComments.authorUserId, userId))
			.orderBy(desc(verseListItemComments.updatedAt))
	]);

	return [
		...translations.map((comment) => ({
			...comment,
			kind: 'translation' as const,
			listId: null,
			listTitle: null,
			itemId: null
		})),
		...lists.map((comment) => ({
			...comment,
			kind: 'list' as const,
			resourceId: null,
			resourceName: null
		}))
	].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
