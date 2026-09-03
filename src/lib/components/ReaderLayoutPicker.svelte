<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { READER_LAYOUT_DEFINITIONS, type ReaderLayout } from '$lib/reader/workspace';

	let {
		layout,
		readerUrl
	}: {
		layout: ReaderLayout;
		readerUrl: () => string;
	} = $props();

	let picker = $state<HTMLDetailsElement>();

	const submitEnhancement: SubmitFunction = () => {
		const url = readerUrl();
		return async ({ result, update }) => {
			picker?.removeAttribute('open');
			await update({ reset: false, invalidateAll: result.type !== 'success' });
			if (result.type === 'success') {
				await goto(url, {
					replaceState: true,
					invalidateAll: true,
					noScroll: true,
					keepFocus: true
				});
			}
		};
	};
</script>

<details bind:this={picker} class="layout-picker relative">
	<summary
		class="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-stone-200
		       bg-[color:var(--surface)] px-3 text-sm font-semibold text-stone-700 shadow-sm hover:border-accent-300
		       hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-none
		       dark:border-white/10 dark:text-stone-200"
		aria-label="Kachelanordnung wählen"
		data-testid="layout-picker"
	>
		<svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" aria-hidden="true">
			<rect x="2.75" y="3" width="6" height="14" rx="1" />
			<rect x="11.25" y="3" width="6" height="6" rx="1" />
			<rect x="11.25" y="11" width="6" height="6" rx="1" />
		</svg>
		<span class="hidden sm:inline">Anordnung</span>
		<svg viewBox="0 0 16 16" class="size-3" fill="currentColor" aria-hidden="true">
			<path d="m4 6 4 4 4-4H4Z" />
		</svg>
	</summary>

	<div
		class="absolute top-full right-0 z-30 mt-2 w-[min(23rem,calc(100vw-1.5rem))] rounded-xl border
		       border-stone-200 bg-[color:var(--surface-raised)] p-3 shadow-xl dark:border-white/10"
	>
		<p class="px-1 pb-2 text-xs font-bold tracking-[0.1em] text-stone-500 uppercase">
			Kachelanordnung
		</p>
		<div class="grid grid-cols-2 gap-2">
			{#each READER_LAYOUT_DEFINITIONS as definition (definition.id)}
				<form method="POST" action="?/setLayout" use:enhance={submitEnhancement}>
					<input type="hidden" name="layout" value={definition.id} />
					<button
						type="submit"
						class="layout-option"
						class:active={definition.id === layout}
						aria-pressed={definition.id === layout}
						title={definition.description}
					>
						<span
							class="layout-preview"
							style:grid-template-columns={`repeat(${definition.columns}, minmax(0, 1fr))`}
							style:grid-template-rows={`repeat(${definition.rows}, minmax(0, 1fr))`}
							style:grid-template-areas={definition.areas}
							aria-hidden="true"
						>
							{#each ['a', 'b', 'c', 'd'].slice(0, definition.tileCount) as area}
								<i style:grid-area={area}></i>
							{/each}
						</span>
						<span class="min-w-0 text-left">
							<strong class="block truncate text-xs">{definition.label}</strong>
							<small
								class="mt-0.5 block text-[0.65rem] font-normal text-stone-500 dark:text-stone-400"
							>
								{definition.tileCount}
								{definition.tileCount === 1 ? 'Kachel' : 'Kacheln'}
							</small>
						</span>
					</button>
				</form>
			{/each}
		</div>
	</div>
</details>

<style>
	.layout-picker > summary::-webkit-details-marker {
		display: none;
	}

	.layout-option {
		display: grid;
		width: 100%;
		grid-template-columns: 3.25rem minmax(0, 1fr);
		align-items: center;
		gap: 0.65rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.625rem;
		padding: 0.55rem;
		color: var(--color-stone-700);
	}

	.layout-option:hover,
	.layout-option.active {
		border-color: var(--color-accent-400);
		background: color-mix(in oklab, var(--color-accent-500) 8%, transparent);
		color: var(--color-accent-800);
	}

	.layout-option:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 1px;
	}

	.layout-preview {
		display: grid;
		width: 3.25rem;
		height: 2.35rem;
		gap: 2px;
		padding: 2px;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		opacity: 0.75;
	}

	.layout-preview i {
		display: block;
		min-width: 0;
		min-height: 0;
		border-radius: 1px;
		background: currentColor;
		opacity: 0.45;
	}

	:global(.dark) .layout-option {
		border-color: var(--color-stone-700);
		color: var(--color-stone-200);
	}

	:global(.dark) .layout-option:hover,
	:global(.dark) .layout-option.active {
		border-color: var(--color-accent-500);
		color: var(--color-accent-300);
	}
</style>
