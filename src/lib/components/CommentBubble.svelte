<script lang="ts">
	import { t } from '$lib/i18n';
	import { linkBibleReferences } from '$lib/bible/link-references';
	import NoteEditor from './NoteEditor.svelte';

	let {
		html = null,
		action = '?/saveNote',
		itemId,
		reference,
		resourceId,
		startEditing = false,
		onSaved,
		onClose
	}: {
		html?: string | null;
		action?: string;
		itemId?: string;
		reference?: string;
		resourceId?: string;
		startEditing?: boolean;
		onSaved?: (html: string) => void;
		onClose?: () => void;
	} = $props();

	let editing = $state(false);
	const linkedHtml = $derived(linkBibleReferences(html ?? ''));
	let initialized = false;
	$effect(() => {
		if (!initialized) {
			editing = startEditing || !html;
			initialized = true;
		}
		if (startEditing) editing = true;
	});

	function saved(next: string) {
		html = next || null;
		editing = !html;
		onSaved?.(next);
	}

	function closeEditor() {
		editing = false;
		onClose?.();
	}
</script>

<aside class="comment-bubble" aria-label={t('comments.comment')}>
	{#if editing}
		<NoteEditor
			{action}
			{itemId}
			{reference}
			{resourceId}
			{html}
			autofocus={startEditing}
			placeholder={t('comments.placeholder')}
			onSaved={saved}
			onCancel={closeEditor}
		/>
	{:else if html}
		<div class="comment-actions">
			<button type="button" onclick={() => (editing = true)} aria-label={t('comments.edit')}>
				{t('comments.edit')}
			</button>
		</div>
		<div class="comment-display">
			<!-- Saved comment HTML is sanitised by the server. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<div class="comment-html">{@html linkedHtml}</div>
		</div>
	{:else}
		<button type="button" class="add-comment" onclick={() => (editing = true)}>
			{t('comments.add')}
		</button>
	{/if}
</aside>

<style>
	.comment-bubble {
		position: relative;
		min-width: 0;
		border-radius: 0.6rem;
		border: 1px solid color-mix(in oklab, var(--color-accent-300) 48%, var(--color-stone-200));
		background: color-mix(in oklab, var(--color-accent-50) 72%, var(--surface));
		padding: 0.7rem 0.85rem 0.7rem 1rem;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: calc(1.08rem * var(--reader-font-scale, 1));
		line-height: 1.65;
	}
	.comment-display {
		min-width: 0;
	}
	.comment-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.2rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.comment-actions button {
		border-radius: 0.3rem;
		padding: 0.1rem 0.35rem;
		color: var(--color-stone-500);
		font-size: 0.7rem;
	}
	.comment-actions button:hover {
		color: var(--color-accent-700);
	}
	.add-comment {
		font-size: 0.8rem;
		color: var(--color-stone-500);
	}
	.add-comment:hover {
		color: var(--color-accent-700);
	}
	.comment-html :global(p) {
		margin: 0 0 0.5em;
	}
	.comment-html :global(p:last-child) {
		margin-bottom: 0;
	}
	.comment-html :global(h2),
	.comment-html :global(h3) {
		margin: 0.5em 0 0.25em;
		font-weight: 700;
	}
	.comment-html :global(h2) {
		font-size: 1.2em;
	}
	.comment-html :global(ul),
	.comment-html :global(ol) {
		padding-left: 1.25em;
	}
	.comment-html :global(ul) {
		list-style: disc;
	}
	.comment-html :global(ol) {
		list-style: decimal;
	}
	.comment-html :global(blockquote) {
		border-left: 3px solid var(--color-stone-300);
		padding-left: 0.7em;
	}
	.comment-html :global(.bible-reference) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-decoration-thickness: 0.08em;
		text-underline-offset: 0.12em;
	}

	:global(.dark) .comment-bubble {
		border-color: color-mix(in oklab, var(--color-accent-700) 55%, var(--color-stone-700));
		background: color-mix(in oklab, var(--color-accent-900) 32%, var(--surface));
	}
</style>
