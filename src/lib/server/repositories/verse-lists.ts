/**
 * Verse lists and their items.
 *
 * A list is an ordered set of verses. It always has exactly one owner (`verse_lists.user_id`), who can
 * rename it, delete it, toggle the public share link and manage its members. Once shared with other
 * accounts (see `verse-list-members.ts`), any member can add verses of their own, but a member may only
 * remove verses they themselves added — the owner alone may remove any of them. Comments and reactions
 * on each verse live in `verse-list-comments.ts`.
 */

import { randomBytes } from 'node:crypto';
import { and, asc, eq, max, or, sql } from 'drizzle-orm';
import type { VerseSegment } from '../../bible/segments.ts';
import type { Database } from '../db/client.ts';
import {
	users,
	verseListItems,
	verseListMembers,
	verseLists,
	verses,
	type VerseList
} from '../db/schema.ts';

export type VerseListSummary = {
	id: string;
	title: string;
	isPublic: boolean;
	slug: string | null;
	itemCount: number;
	updatedAt: Date;
	/** Whether the caller owns this list or only belongs to it as an invited member. */
	role: 'owner' | 'member';
	/** The owner's display name (falling back to their email), only set for `role: 'member'`. */
	ownerName: string | null;
};

export type VerseListItemWithText = {
	id: string;
	book: number;
	chapter: number;
	verse: number;
	position: number;
	addedByUserId: string;
	addedByName: string;
	/** The verse text in the reader's first translation, so a list reads on its own. */
	segments: VerseSegment[] | null;
};

/** Every list the caller owns or has been invited into, newest first. */
export async function listVerseLists(db: Database, userId: string): Promise<VerseListSummary[]> {
	const rows = await db.execute<{
		id: string;
		title: string;
		is_public: boolean;
		slug: string | null;
		item_count: number;
		updated_at: string;
		role: 'owner' | 'member';
		owner_name: string | null;
	}>(sql`
		select
			l.id, l.title, l.is_public, l.slug, l.updated_at,
			count(i.id)::int as item_count,
			case when l.user_id = ${userId} then 'owner' else 'member' end as role,
			case when l.user_id = ${userId} then null else coalesce(owner.display_name, owner.email) end as owner_name
		from verse_lists l
		left join verse_list_items i on i.list_id = l.id
		left join verse_list_members m on m.list_id = l.id and m.user_id = ${userId}
		join users owner on owner.id = l.user_id
		where l.user_id = ${userId} or m.user_id is not null
		group by l.id, owner.display_name, owner.email
		order by l.updated_at desc
	`);

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		isPublic: row.is_public,
		slug: row.slug,
		itemCount: Number(row.item_count),
		updatedAt: new Date(row.updated_at),
		role: row.role,
		ownerName: row.owner_name
	}));
}

export async function createVerseList(
	db: Database,
	userId: string,
	title: string
): Promise<VerseList> {
	const [list] = await db
		.insert(verseLists)
		.values({ userId, title: title.trim() || 'Neue Stellensammlung' })
		.returning();
	return list!;
}

export async function findVerseList(
	db: Database,
	options: { id?: string; slug?: string; userId?: string }
): Promise<VerseList | undefined> {
	const conditions = [];
	if (options.id) conditions.push(eq(verseLists.id, options.id));
	if (options.slug) conditions.push(eq(verseLists.slug, options.slug));
	if (options.userId) conditions.push(eq(verseLists.userId, options.userId));
	if (conditions.length === 0) return undefined;

	const [row] = await db
		.select()
		.from(verseLists)
		.where(and(...conditions))
		.limit(1);
	return row;
}

/** The owner's display name (falling back to their email), for a member's view of a shared list. */
export async function findListOwnerName(db: Database, ownerUserId: string): Promise<string> {
	const [row] = await db
		.select({ name: sql<string>`coalesce(${users.displayName}, ${users.email})` })
		.from(users)
		.where(eq(users.id, ownerUserId))
		.limit(1);
	return row?.name ?? '';
}

export type VerseListAccess = { list: VerseList; isOwner: boolean };

/**
 * Finds a list the caller may read and collaborate on: either as its owner, or as an accepted member.
 * Returns `undefined` for anyone else, exactly like `findVerseList` does for a non-owner today — a
 * list id belonging to someone else, or that the caller was never invited to, is simply not found.
 */
export async function findListAccess(
	db: Database,
	id: string,
	userId: string
): Promise<VerseListAccess | undefined> {
	const list = await findVerseList(db, { id });
	if (!list) return undefined;
	if (list.userId === userId) return { list, isOwner: true };

	const [membership] = await db
		.select({ id: verseListMembers.id })
		.from(verseListMembers)
		.where(and(eq(verseListMembers.listId, id), eq(verseListMembers.userId, userId)))
		.limit(1);
	if (!membership) return undefined;

	return { list, isOwner: false };
}

/** True when `userId` may read this list, either as its owner or as an accepted member. */
export async function isListCollaborator(
	db: Database,
	listId: string,
	userId: string
): Promise<boolean> {
	const access = await findListAccess(db, listId, userId);
	return access !== undefined;
}

/**
 * A list's verses with their text, for the list page and the public share view.
 *
 * `redactEmail` covers the one caller with an audience that never proved anything about who it is:
 * the public `/l/{slug}` link. Everywhere else, "who added this" is shown to people who are already
 * the list's owner or an invited collaborator — they know each other's addresses from the invite
 * itself — so the real display name or email is fine. An anonymous visitor of the public link gets a
 * generic placeholder instead of a fellow collaborator's email address.
 */
export async function loadVerseListItems(
	db: Database,
	listId: string,
	resourceId: string | null,
	options: { redactEmail?: boolean } = {}
): Promise<VerseListItemWithText[]> {
	const rows = await db
		.select({
			id: verseListItems.id,
			book: verseListItems.bookId,
			chapter: verseListItems.chapter,
			verse: verseListItems.verse,
			position: verseListItems.position,
			addedByUserId: verseListItems.addedByUserId,
			addedByDisplayName: users.displayName,
			addedByEmail: users.email,
			segments: verses.segments
		})
		.from(verseListItems)
		.innerJoin(users, eq(users.id, verseListItems.addedByUserId))
		.leftJoin(
			verses,
			and(
				eq(verses.bookId, verseListItems.bookId),
				eq(verses.chapter, verseListItems.chapter),
				eq(verses.verse, verseListItems.verse),
				resourceId ? eq(verses.resourceId, resourceId) : sql`false`
			)
		)
		.where(eq(verseListItems.listId, listId))
		.orderBy(asc(verseListItems.position), asc(verseListItems.bookId));

	return rows.map(({ addedByDisplayName, addedByEmail, ...row }) => ({
		...row,
		segments: row.segments ?? null,
		addedByName:
			addedByDisplayName ?? (options.redactEmail ? 'Ein Mitglied der Liste' : addedByEmail)
	}));
}

export async function addVerseToList(
	db: Database,
	listId: string,
	reference: { book: number; chapter: number; verse: number },
	addedByUserId: string
): Promise<void> {
	const [row] = await db
		.select({ highest: max(verseListItems.position) })
		.from(verseListItems)
		.where(eq(verseListItems.listId, listId));

	await db
		.insert(verseListItems)
		.values({
			listId,
			bookId: reference.book,
			chapter: reference.chapter,
			verse: reference.verse,
			position: (row?.highest ?? -1) + 1,
			addedByUserId
		})
		// Adding a verse twice is a no-op rather than an error: the reader offers the action per verse
		// and a double click should not fail.
		.onConflictDoNothing();

	await touch(db, listId);
}

/**
 * Whether `userId` may remove a verse item they did or did not add themselves.
 *
 * The rule from the issue: a collaborator may only remove verses they added themselves; the list's
 * owner may remove any of them. Exported mainly so it can be unit-tested without a database.
 */
export function canDeleteItem(
	item: { addedByUserId: string },
	access: { userId: string; isOwner: boolean }
): boolean {
	return access.isOwner || item.addedByUserId === access.userId;
}

/**
 * Removes a verse from a list, but only the rows `userId` is allowed to remove (see `canDeleteItem`).
 * An attempt to remove someone else's verse without owning the list therefore matches no row rather
 * than failing loudly — the caller only ever passes a reference it already showed a delete control
 * for, so this is a last-line-of-defence check, not user-facing feedback.
 */
export async function removeVerseFromList(
	db: Database,
	listId: string,
	reference: { book: number; chapter: number; verse: number },
	access: { userId: string; isOwner: boolean }
): Promise<void> {
	const conditions = [
		eq(verseListItems.listId, listId),
		eq(verseListItems.bookId, reference.book),
		eq(verseListItems.chapter, reference.chapter),
		eq(verseListItems.verse, reference.verse)
	];
	if (!access.isOwner) conditions.push(eq(verseListItems.addedByUserId, access.userId));

	await db.delete(verseListItems).where(and(...conditions));
	await touch(db, listId);
}

export async function renameVerseList(db: Database, listId: string, title: string): Promise<void> {
	await db
		.update(verseLists)
		.set({ title: title.trim().slice(0, 300) || 'Neue Stellensammlung', updatedAt: new Date() })
		.where(eq(verseLists.id, listId));
}

export async function deleteVerseList(db: Database, listId: string): Promise<void> {
	await db.delete(verseLists).where(eq(verseLists.id, listId));
}

/**
 * Turns sharing on or off.
 *
 * Sharing mints a fresh slug every time it is enabled, so a link that was once shared stops working
 * when sharing is turned off and on again. This is the read-only public link and is independent of
 * the email-invited members in `verse_list_members`: a list can have both, or either, at once.
 */
export async function setVerseListSharing(
	db: Database,
	listId: string,
	isPublic: boolean
): Promise<string | null> {
	const slug = isPublic ? randomBytes(12).toString('base64url') : null;
	await db
		.update(verseLists)
		.set({ isPublic, slug, updatedAt: new Date() })
		.where(eq(verseLists.id, listId));
	return slug;
}

/**
 * Which verses of a chapter are in which of the reader's lists — their own, and any shared list they
 * belong to as a member.
 *
 * The reader's verse menu offers every list at once and has to show which ones already hold the
 * verse, so one query over all of them beats one query per list.
 */
export async function markedVersesByList(
	db: Database,
	userId: string,
	book: number,
	chapter: number
): Promise<{ listId: string; verse: number }[]> {
	return db
		.select({ listId: verseListItems.listId, verse: verseListItems.verse })
		.from(verseListItems)
		.innerJoin(verseLists, eq(verseLists.id, verseListItems.listId))
		.leftJoin(
			verseListMembers,
			and(eq(verseListMembers.listId, verseLists.id), eq(verseListMembers.userId, userId))
		)
		.where(
			and(
				or(eq(verseLists.userId, userId), sql`${verseListMembers.id} is not null`),
				eq(verseListItems.bookId, book),
				eq(verseListItems.chapter, chapter)
			)
		);
}

async function touch(db: Database, listId: string): Promise<void> {
	await db.update(verseLists).set({ updatedAt: new Date() }).where(eq(verseLists.id, listId));
}
