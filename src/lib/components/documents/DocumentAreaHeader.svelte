<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import DocumentAreaNav from './DocumentAreaNav.svelte';

	let {
		active,
		actions
	}: {
		active: 'notes' | 'sermons' | 'lists';
		actions?: Snippet;
	} = $props();
	const title = $derived(
		t(
			active === 'notes'
				? 'documents.library.title'
				: active === 'sermons'
					? 'sermons.title'
					: 'lists.title'
		)
	);
	const subtitle = $derived(
		t(
			active === 'notes'
				? 'documents.library.subtitle'
				: active === 'sermons'
					? 'sermons.subtitle'
					: 'lists.subtitle'
		)
	);
</script>

<header class="document-area-header">
	<div>
		<p class="text-xs font-bold tracking-[0.16em] text-accent-700 uppercase dark:text-accent-300">
			{t('app.name')}
		</p>
		<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
		<p class="description mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
	</div>
	<div class="actions">{@render actions?.()}</div>
</header>
<DocumentAreaNav {active} />

<style>
	.document-area-header {
		display: grid;
		gap: 1rem;
	}
	.description {
		min-height: 3.75rem;
	}
	.actions {
		display: flex;
		align-content: start;
		align-items: start;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-height: 2.5rem;
	}
	.actions :global(a) {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.5rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.5rem;
		background: var(--surface-raised);
		padding: 0.5rem 0.25rem;
		font-size: 0.75rem;
		font-weight: 650;
	}
	.actions :global(a:hover) {
		border-color: var(--color-accent-400);
	}
	:global(.dark) .actions :global(a) {
		border-color: var(--color-stone-700);
	}
	@media (min-width: 640px) {
		.actions :global(a) {
			gap: 0.4rem;
			padding-inline: 0.5rem;
			font-size: 0.8125rem;
		}
		.description {
			min-height: 2.5rem;
		}
	}
	@media (min-width: 1024px) {
		.document-area-header {
			grid-template-columns: minmax(0, 1fr) 21rem;
		}
		.actions {
			justify-content: end;
		}
	}
</style>
