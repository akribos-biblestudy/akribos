<script lang="ts">
	import { t } from '$lib/i18n';
	import CommentItem from './CommentItem.svelte';
	import NoteEditor from './NoteEditor.svelte';

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

	/**
	 * A verse-list item's whole comment thread: every top-level comment (each recursively rendering
	 * its own replies through `CommentItem`), plus the box for starting a new top-level comment.
	 *
	 * Read-only when `currentUserId` is `null` — the public share page renders the same threads for
	 * anyone with the link, but only a signed-in collaborator can add to them.
	 */
	let {
		itemId,
		comments,
		currentUserId,
		isOwner = false
	}: {
		itemId: string;
		comments: CommentNode[];
		currentUserId: string | null;
		isOwner?: boolean;
	} = $props();

	let addingComment = $state(false);
</script>

<div class="comment-thread">
	{#if comments.length === 0 && !currentUserId}
		<p class="thread-empty">{t('comments.threadEmpty')}</p>
	{/if}

	{#each comments as node (node.id)}
		<CommentItem {node} {itemId} {currentUserId} {isOwner} />
	{/each}

	{#if currentUserId}
		{#if addingComment}
			<div class="add-comment-editor">
				<NoteEditor
					action="?/comment"
					{itemId}
					autofocus
					placeholder={t('comments.placeholder')}
					onSaved={() => (addingComment = false)}
					onCancel={() => (addingComment = false)}
				/>
			</div>
		{:else}
			<button type="button" class="add-comment" onclick={() => (addingComment = true)}>
				{t('comments.add')}
			</button>
		{/if}
	{/if}
</div>

<style>
	.comment-thread {
		margin-top: 0.5rem;
	}
	.thread-empty {
		font-size: 0.8rem;
		color: var(--color-stone-500);
	}
	.add-comment {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-stone-500);
	}
	.add-comment:hover {
		color: var(--color-accent-700);
	}
	.add-comment-editor {
		margin-top: 0.5rem;
	}
</style>
