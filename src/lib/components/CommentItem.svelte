<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { linkBibleReferences } from '$lib/bible/link-references';
	import { COMMENT_REACTION_EMOJIS } from '$lib/notes/reactions';
	import NoteEditor from './NoteEditor.svelte';
	import CommentItem from './CommentItem.svelte';

	type ReactionSummary = { emoji: string; count: number; reactedByMe: boolean };
	type CommentNode = {
		id: string;
		authorUserId: string;
		authorName: string;
		bodyHtml: string;
		createdAt: Date | string;
		reactions: ReactionSummary[];
		replies: CommentNode[];
	};

	/** One comment or reply in a verse-list thread, rendering its own replies recursively. */
	let {
		node,
		itemId,
		currentUserId,
		isOwner,
		depth = 0
	}: {
		node: CommentNode;
		itemId: string;
		/** `null` on the read-only public share page, where nothing here is interactive. */
		currentUserId: string | null;
		isOwner: boolean;
		depth?: number;
	} = $props();

	let replying = $state(false);

	const canDelete = $derived(
		currentUserId !== null && (currentUserId === node.authorUserId || isOwner)
	);

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

	function reactionCount(emoji: string): number {
		return node.reactions.find((reaction) => reaction.emoji === emoji)?.count ?? 0;
	}
	function reactedByMe(emoji: string): boolean {
		return node.reactions.find((reaction) => reaction.emoji === emoji)?.reactedByMe ?? false;
	}
</script>

<article class="comment-item" style:margin-left={depth > 0 ? '1.5rem' : '0'}>
	<div class="comment-meta">
		<span class="comment-author">{node.authorName}</span>
		<time datetime={new Date(node.createdAt).toISOString()}>
			{dateFormat.format(new Date(node.createdAt))}
		</time>
	</div>

	<!-- Sanitised server-side; see src/lib/notes/sanitize.ts. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class="comment-body">{@html linkBibleReferences(node.bodyHtml)}</div>

	<form
		method="POST"
		action="?/react"
		use:enhance
		class="reaction-picker"
		aria-label={t('comments.react')}
	>
		<input type="hidden" name="commentId" value={node.id} />
		{#each COMMENT_REACTION_EMOJIS as emoji (emoji)}
			{@const count = reactionCount(emoji)}
			<button
				type="submit"
				name="emoji"
				value={emoji}
				class="reaction"
				class:active={reactedByMe(emoji)}
				disabled={!currentUserId}
				aria-pressed={reactedByMe(emoji)}
			>
				<!-- Not aria-hidden: the emoji itself is the button's accessible name, not decoration. -->
				<span>{emoji}</span>
				{#if count > 0}<span class="reaction-count">{count}</span>{/if}
			</button>
		{/each}
	</form>

	{#if currentUserId}
		<div class="comment-actions">
			<button type="button" onclick={() => (replying = !replying)}>
				{t('comments.reply')}
			</button>
			{#if canDelete}
				<form method="POST" action="?/deleteComment" use:enhance>
					<input type="hidden" name="commentId" value={node.id} />
					<button type="submit" class="delete">{t('comments.deleteThread')}</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if replying}
		<div class="reply-editor">
			<NoteEditor
				action="?/comment"
				{itemId}
				parentCommentId={node.id}
				autofocus
				placeholder={t('comments.replyPlaceholder')}
				onSaved={() => (replying = false)}
				onCancel={() => (replying = false)}
			/>
		</div>
	{/if}

	{#each node.replies as reply (reply.id)}
		<CommentItem node={reply} {itemId} {currentUserId} {isOwner} depth={depth + 1} />
	{/each}
</article>

<style>
	.comment-item {
		margin-top: 0.75rem;
		border-left: 2px solid color-mix(in oklab, var(--color-accent-300) 55%, var(--color-stone-200));
		padding-left: 0.75rem;
	}
	.comment-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.75rem;
	}
	.comment-author {
		font-weight: 600;
		color: var(--color-stone-700);
	}
	.comment-meta time {
		color: var(--color-stone-500);
	}
	.comment-body {
		margin-top: 0.15rem;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: calc(1rem * var(--reader-font-scale, 1));
		line-height: 1.6;
	}
	.comment-body :global(p) {
		margin: 0 0 0.4em;
	}
	.comment-body :global(p:last-child) {
		margin-bottom: 0;
	}
	.reaction-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin-top: 0.35rem;
	}
	.reaction {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		border-radius: 999px;
		border: 1px solid var(--color-stone-300);
		padding: 0.05rem 0.4rem;
		font-size: 0.85rem;
		line-height: 1.6;
	}
	.reaction:hover:not(:disabled) {
		border-color: var(--color-accent-400);
	}
	.reaction:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.reaction.active {
		border-color: var(--color-accent-500);
		background: color-mix(in oklab, var(--color-accent-100) 60%, transparent);
	}
	.reaction-count {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.7rem;
		color: var(--color-stone-600);
	}
	.comment-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.3rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.75rem;
	}
	.comment-actions button {
		color: var(--color-stone-500);
	}
	.comment-actions button:hover {
		color: var(--color-accent-700);
	}
	.comment-actions .delete:hover {
		color: var(--color-red-700);
	}
	.reply-editor {
		margin-top: 0.4rem;
		margin-bottom: 0.4rem;
	}

	:global(.dark) .comment-item {
		border-color: color-mix(in oklab, var(--color-accent-700) 55%, var(--color-stone-700));
	}
	:global(.dark) .comment-author {
		color: var(--color-stone-200);
	}
	:global(.dark) .reaction {
		border-color: var(--color-stone-700);
	}
	:global(.dark) .reaction.active {
		border-color: var(--color-accent-400);
		background: color-mix(in oklab, var(--color-accent-900) 45%, transparent);
	}
</style>
