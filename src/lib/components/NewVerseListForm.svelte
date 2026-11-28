<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { MAX_VERSE_LIST_TITLE_LENGTH, parseVerseListTitle } from '$lib/notes/verse-lists';
	import { onDestroy } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		reference,
		onCreated
	}: { reference: string; onCreated: (list: { id: string; title: string }) => void } = $props();
	let title = $state('');
	let pending = $state(false);
	let message = $state('');
	let destroyed = false;
	const validTitle = $derived(parseVerseListTitle(title));

	onDestroy(() => (destroyed = true));
</script>

<form
	method="POST"
	action="?/addToList"
	role="none"
	class="new-list"
	use:enhance={({ cancel }) => {
		const submittedTitle = validTitle;
		if (!submittedTitle || pending) {
			cancel();
			return;
		}
		pending = true;
		message = '';
		return async ({ result, update }) => {
			if (result.type === 'success') {
				if (!destroyed && typeof result.data?.listId === 'string') {
					onCreated({ id: result.data.listId, title: submittedTitle });
				}
			} else if (result.type === 'redirect') {
				await update({ reset: false });
			} else if (!destroyed) {
				pending = false;
				message =
					result.type === 'failure' && result.data?.error === 'title'
						? t('lists.titleInvalid', { max: MAX_VERSE_LIST_TITLE_LENGTH })
						: t('lists.createWithVerseFailed');
			}
		};
	}}
>
	<input type="hidden" name="listId" value="" />
	<input type="hidden" name="reference" value={reference} />
	<input
		type="text"
		name="title"
		required
		maxlength={MAX_VERSE_LIST_TITLE_LENGTH}
		aria-label={t('lists.titleLabel')}
		readonly={pending}
		placeholder={t('lists.new')}
		bind:value={title}
		oninput={() => (message = '')}
		onkeydown={(event) => {
			if (['Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.stopPropagation();
		}}
	/>
	<button
		type="submit"
		disabled={!validTitle || pending}
		aria-busy={pending}
		aria-label={t(pending ? 'lists.creatingWithVerse' : 'lists.createWithVerse')}
		title={t('lists.createWithVerse')}
	>
		<Icon name="plus" class="size-4" />
	</button>
	{#if message}<p class="new-list-error" role="alert">{message}</p>{/if}
</form>

<style>
	.new-list {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
		padding: 0.2rem 0.35rem 0.4rem;
	}

	.new-list input:not([type='hidden']),
	.new-list button {
		min-height: 2.5rem;
		border: 1px solid var(--line);
		border-radius: 0.45rem;
	}

	.new-list input:not([type='hidden']) {
		min-width: 0;
		background: var(--surface);
		padding: 0.3rem 0.55rem;
		font-size: 1rem;
	}

	.new-list button {
		display: grid;
		width: 2.5rem;
		place-items: center;
		color: white;
		background: var(--color-accent-700);
		border-color: transparent;
		cursor: pointer;
	}

	.new-list button:hover:not(:disabled) {
		background: var(--color-accent-800);
	}

	.new-list button:disabled {
		background: var(--surface);
		border-color: var(--line);
		color: var(--color-stone-500);
		cursor: default;
	}

	.new-list-error {
		grid-column: 1 / -1;
		color: var(--color-red-700);
	}

	:global(.dark) .new-list-error {
		color: var(--color-red-300);
	}
</style>
