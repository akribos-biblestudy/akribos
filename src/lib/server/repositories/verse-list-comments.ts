/**
 * Threaded comments and emoji reactions on verse-list items.
 *
 * Replaces the single `verse_list_items.note_html` field a list item used to carry: every comment —
 * the original note and every reply to it — is now a row of its own, nested through
 * `parent_comment_id`. A list's owner may delete any comment (light moderation, consistent with the
 * owner's ability to remove any collaborator's verse); anyone else may only delete their own.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { COMMENT_REACTION_EMOJIS, type CommentReactionEmoji } from '../../notes/reactions.ts';
import { sanitizeNoteHtml } from '../../notes/sanitize.ts';
import type { Database } from '../db/client.ts';
import {
	users,
	verseListItemCommentReactions,
	verseListItemComments,
	verseListItems
} from '../db/schema.ts';

export function isCommentReactionEmoji(value: string): value is CommentReactionEmoji {
	return (COMMENT_REACTION_EMOJIS as readonly string[]).includes(value);
}

export type CommentReactionSummary = {
	emoji: CommentReactionEmoji;
	count: number;
	reactedByMe: boolean;
};

export type CommentNode = {
	id: string;
	itemId: string;
	parentCommentId: string | null;
	authorUserId: string;
	authorName: string;
	bodyHtml: string;
	createdAt: Date;
	updatedAt: Date;
	reactions: CommentReactionSummary[];
	replies: CommentNode[];
};

/**
 * Every comment thread for a list's items, keyed by item id.
 *
 * `currentUserId` is `null` only for the public, unauthenticated `/l/{slug}` link — the one caller
 * that cannot prove who is asking. That both drops `reactedByMe` from every reaction (there is no one
 * to have reacted as) and swaps a commenter's email fallback for a generic placeholder: everywhere
 * else, "who wrote this" is shown to the list's owner or its invited collaborators, who already know
 * each other's addresses from the invite itself.
 */
export async function loadCommentsForList(
	db: Database,
	listId: string,
	currentUserId: string | null
): Promise<Record<string, CommentNode[]>> {
	const commentRows = await db
		.select({
			id: verseListItemComments.id,
			itemId: verseListItemComments.itemId,
			parentCommentId: verseListItemComments.parentCommentId,
			authorUserId: verseListItemComments.authorUserId,
			authorDisplayName: users.displayName,
			authorEmail: users.email,
			bodyHtml: verseListItemComments.bodyHtml,
			createdAt: verseListItemComments.createdAt,
			updatedAt: verseListItemComments.updatedAt
		})
		.from(verseListItemComments)
		.innerJoin(verseListItems, eq(verseListItems.id, verseListItemComments.itemId))
		.innerJoin(users, eq(users.id, verseListItemComments.authorUserId))
		.where(eq(verseListItems.listId, listId))
		.orderBy(asc(verseListItemComments.createdAt));

	if (commentRows.length === 0) return {};

	const reactionRows = await db
		.select({
			commentId: verseListItemCommentReactions.commentId,
			emoji: verseListItemCommentReactions.emoji,
			userId: verseListItemCommentReactions.userId
		})
		.from(verseListItemCommentReactions)
		.where(
			inArray(
				verseListItemCommentReactions.commentId,
				commentRows.map((row) => row.id)
			)
		);

	const reactionsByComment = new Map<
		string,
		Map<CommentReactionEmoji, { count: number; reactedByMe: boolean }>
	>();
	for (const row of reactionRows) {
		let byEmoji = reactionsByComment.get(row.commentId);
		if (!byEmoji) {
			byEmoji = new Map();
			reactionsByComment.set(row.commentId, byEmoji);
		}
		const existing = byEmoji.get(row.emoji) ?? { count: 0, reactedByMe: false };
		existing.count += 1;
		if (currentUserId && row.userId === currentUserId) existing.reactedByMe = true;
		byEmoji.set(row.emoji, existing);
	}

	const nodesById = new Map<string, CommentNode>();
	for (const row of commentRows) {
		const byEmoji = reactionsByComment.get(row.id);
		const reactions: CommentReactionSummary[] = COMMENT_REACTION_EMOJIS.filter(
			(emoji) => (byEmoji?.get(emoji)?.count ?? 0) > 0
		).map((emoji) => ({
			emoji,
			count: byEmoji!.get(emoji)!.count,
			reactedByMe: byEmoji!.get(emoji)!.reactedByMe
		}));

		nodesById.set(row.id, {
			id: row.id,
			itemId: row.itemId,
			parentCommentId: row.parentCommentId,
			authorUserId: row.authorUserId,
			authorName:
				row.authorDisplayName ??
				(currentUserId === null ? 'Ein Mitglied der Liste' : row.authorEmail),
			bodyHtml: row.bodyHtml,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			reactions,
			replies: []
		});
	}

	const byItem: Record<string, CommentNode[]> = {};
	for (const row of commentRows) {
		const node = nodesById.get(row.id)!;
		const parent = row.parentCommentId ? nodesById.get(row.parentCommentId) : undefined;
		if (parent) {
			parent.replies.push(node);
		} else {
			(byItem[row.itemId] ??= []).push(node);
		}
	}

	return byItem;
}

/**
 * Adds a comment or a reply.
 *
 * `listId` scopes both `itemId` and, when replying, `parentCommentId`: neither is trusted just
 * because the caller already has access to *some* list — the item has to belong to *this* list, and a
 * reply's parent has to belong to the *same item*, or nothing is inserted. An empty body (after
 * sanitising) likewise adds nothing. All of these return `null` rather than throwing, since the only
 * caller is a form action that treats "nothing happened" as the appropriate response to a tampered
 * request, not a hard error.
 */
export async function addComment(
	db: Database,
	listId: string,
	options: {
		itemId: string;
		parentCommentId: string | null;
		authorUserId: string;
		html: string;
	}
): Promise<{ id: string } | null> {
	const clean = sanitizeNoteHtml(options.html);
	if (!clean) return null;

	const [item] = await db
		.select({ id: verseListItems.id })
		.from(verseListItems)
		.where(and(eq(verseListItems.id, options.itemId), eq(verseListItems.listId, listId)))
		.limit(1);
	if (!item) return null;

	if (options.parentCommentId) {
		const [parent] = await db
			.select({ id: verseListItemComments.id })
			.from(verseListItemComments)
			.where(
				and(
					eq(verseListItemComments.id, options.parentCommentId),
					eq(verseListItemComments.itemId, options.itemId)
				)
			)
			.limit(1);
		if (!parent) return null;
	}

	const [row] = await db
		.insert(verseListItemComments)
		.values({
			itemId: options.itemId,
			parentCommentId: options.parentCommentId,
			authorUserId: options.authorUserId,
			bodyHtml: clean
		})
		.returning({ id: verseListItemComments.id });

	return row ?? null;
}

/**
 * Deletes a comment and, through the cascading self-referencing foreign key, every reply beneath it.
 * Only the comment's author or the list's owner may do this; anyone else's request — or a comment id
 * from a different list entirely — matches no row.
 */
export async function deleteComment(
	db: Database,
	listId: string,
	commentId: string,
	access: { userId: string; isOwner: boolean }
): Promise<void> {
	const inThisList = inArray(
		verseListItemComments.itemId,
		db
			.select({ id: verseListItems.id })
			.from(verseListItems)
			.where(eq(verseListItems.listId, listId))
	);
	const conditions = [eq(verseListItemComments.id, commentId), inThisList];
	if (!access.isOwner) conditions.push(eq(verseListItemComments.authorUserId, access.userId));

	await db.delete(verseListItemComments).where(and(...conditions));
}

/**
 * Reacting with the same emoji a second time removes it — a toggle, like GitHub's issue reactions.
 * `listId` confirms the comment actually belongs to a list the caller has access to before touching
 * anything; a comment id from elsewhere is reported as `notFound` rather than silently succeeding.
 */
export async function toggleCommentReaction(
	db: Database,
	listId: string,
	commentId: string,
	userId: string,
	emoji: CommentReactionEmoji
): Promise<'added' | 'removed' | 'notFound'> {
	const [comment] = await db
		.select({ id: verseListItemComments.id })
		.from(verseListItemComments)
		.innerJoin(verseListItems, eq(verseListItems.id, verseListItemComments.itemId))
		.where(and(eq(verseListItemComments.id, commentId), eq(verseListItems.listId, listId)))
		.limit(1);
	if (!comment) return 'notFound';

	const deleted = await db
		.delete(verseListItemCommentReactions)
		.where(
			and(
				eq(verseListItemCommentReactions.commentId, commentId),
				eq(verseListItemCommentReactions.userId, userId),
				eq(verseListItemCommentReactions.emoji, emoji)
			)
		)
		.returning({ commentId: verseListItemCommentReactions.commentId });

	if (deleted.length > 0) return 'removed';

	await db
		.insert(verseListItemCommentReactions)
		.values({ commentId, userId, emoji })
		.onConflictDoNothing();

	return 'added';
}
