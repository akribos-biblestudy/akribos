import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '$lib/server/db/client';
import {
	documents,
	documentVerseLists,
	verseLists,
	verseListItems,
	verseListMembers
} from '$lib/server/db/schema';
import { findListAccess } from './verse-lists';

export type DocumentCollection = {
	id: string;
	title: string;
	verses: { book: number; chapter: number; verse: number }[];
};
export type CollectionMutationResult =
	| { ok: true; revision: number }
	| { ok: false; reason: 'notFound' }
	| { ok: false; reason: 'invalidCollection' }
	| { ok: false; reason: 'conflict'; currentRevision: number };

/** Recheck both ownership and current collection membership in the same read as its content. */
export async function listDocumentCollections(
	db: Database,
	userId: string,
	documentId: string
): Promise<DocumentCollection[]> {
	const rows = await db
		.select({
			id: verseLists.id,
			title: verseLists.title,
			book: verseListItems.bookId,
			chapter: verseListItems.chapter,
			verse: verseListItems.verse
		})
		.from(documentVerseLists)
		.innerJoin(
			documents,
			and(
				eq(documents.id, documentVerseLists.documentId),
				eq(documents.userId, userId),
				eq(documents.kind, 'sermon'),
				isNull(documents.deletedAt)
			)
		)
		.innerJoin(verseLists, eq(verseLists.id, documentVerseLists.listId))
		.leftJoin(
			verseListMembers,
			and(eq(verseListMembers.listId, verseLists.id), eq(verseListMembers.userId, userId))
		)
		.leftJoin(verseListItems, eq(verseListItems.listId, verseLists.id))
		.where(
			and(
				eq(documentVerseLists.documentId, documentId),
				eq(documentVerseLists.userId, userId),
				or(eq(verseLists.userId, userId), eq(verseListMembers.userId, userId))
			)
		)
		.orderBy(
			asc(documentVerseLists.createdAt),
			asc(verseLists.id),
			asc(verseListItems.position),
			asc(verseListItems.id)
		);
	const collections = new Map<string, DocumentCollection>();
	for (const row of rows) {
		let collection = collections.get(row.id);
		if (!collection) {
			collection = { id: row.id, title: row.title, verses: [] };
			collections.set(row.id, collection);
		}
		if (row.book !== null && row.chapter !== null && row.verse !== null)
			collection.verses.push({ book: row.book, chapter: row.chapter, verse: row.verse });
	}
	return [...collections.values()];
}

export async function changeDocumentCollection(
	db: Database,
	userId: string,
	documentId: string,
	revision: number,
	change: { action: 'add' | 'remove'; listId: string } | { action: 'create'; title: string }
): Promise<CollectionMutationResult> {
	return db.transaction(async (tx) => {
		const [document] = await tx
			.select({ revision: documents.revision })
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.userId, userId),
					eq(documents.kind, 'sermon'),
					isNull(documents.deletedAt)
				)
			)
			.for('update');
		if (!document) return { ok: false, reason: 'notFound' };
		if (!Number.isSafeInteger(revision) || revision < 1 || document.revision !== revision)
			return { ok: false, reason: 'conflict', currentRevision: document.revision };
		let listId: string;
		if (change.action === 'create') {
			const title = change.title.trim();
			if (!title || Array.from(title).length > 200)
				return { ok: false, reason: 'invalidCollection' };
			const [list] = await tx
				.insert(verseLists)
				.values({ userId, title })
				.returning({ id: verseLists.id });
			listId = list!.id;
		} else {
			listId = change.listId;
			if (
				change.action === 'add' &&
				!(await findListAccess(tx as unknown as Database, listId, userId))
			)
				return { ok: false, reason: 'invalidCollection' };
		}
		if (change.action === 'remove') {
			await tx
				.delete(documentVerseLists)
				.where(
					and(
						eq(documentVerseLists.documentId, documentId),
						eq(documentVerseLists.userId, userId),
						eq(documentVerseLists.listId, listId)
					)
				);
		} else {
			await tx
				.insert(documentVerseLists)
				.values({ documentId, userId, listId })
				.onConflictDoNothing();
		}
		const [updated] = await tx
			.update(documents)
			.set({ revision: sql`${documents.revision} + 1`, updatedAt: new Date() })
			.where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
			.returning({ revision: documents.revision });
		return { ok: true, revision: updated!.revision };
	});
}
