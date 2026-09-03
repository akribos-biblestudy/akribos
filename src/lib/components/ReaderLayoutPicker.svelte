<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { READER_LAYOUT_DEFINITIONS, type ReaderLayout } from '$lib/reader/workspace';
	import Menu from './Menu.svelte';

	let { layout }: { layout: ReaderLayout } = $props();
	let menu = $state<Menu>();

	const submitEnhancement: SubmitFunction = () => {
		return async ({ update }) => {
			menu?.close();
			await update({ reset: false });
		};
	};
</script>

<button
	type="button"
	class="layout-trigger icon-button"
	aria-label="Kachelanordnung wählen"
	title="Kachelanordnung"
	data-testid="layout-picker"
	onclick={(event) => menu?.openAt(event.currentTarget)}
>
	<svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" aria-hidden="true">
		<rect x="2.75" y="3" width="6" height="14" rx="1" />
		<rect x="11.25" y="3" width="6" height="6" rx="1" />
		<rect x="11.25" y="11" width="6" height="6" rx="1" />
	</svg>
</button>

<Menu bind:this={menu} label="Kachelanordnung">
	<p class="menu-title">Kachelanordnung</p>
	<div class="layout-options" role="none">
		{#each READER_LAYOUT_DEFINITIONS as definition (definition.id)}
			<form method="POST" action="?/setLayout" use:enhance={submitEnhancement} role="none">
				<input type="hidden" name="layout" value={definition.id} />
				<button
					type="submit"
					role="menuitemradio"
					class="layout-option"
					class:active={definition.id === layout}
					aria-checked={definition.id === layout}
					title={definition.description}
				>
					<span
						class="layout-preview"
						style:grid-template-columns={`repeat(${definition.columns}, minmax(0, 1fr))`}
						style:grid-template-rows={`repeat(${definition.rows}, minmax(0, 1fr))`}
						style:grid-template-areas={definition.areas}
						aria-hidden="true"
					>
						{#each ['a', 'b', 'c', 'd'].slice(0, definition.tileCount) as area (area)}
							<i style:grid-area={area}></i>
						{/each}
					</span>
					<span class="min-w-0 text-left">
						<strong class="block truncate text-xs">{definition.label}</strong>
						<small>{definition.tileCount} {definition.tileCount === 1 ? 'Kachel' : 'Kacheln'}</small
						>
					</span>
				</button>
			</form>
		{/each}
	</div>
</Menu>

<style>
	.layout-trigger {
		color: var(--color-stone-400);
	}

	.menu-title {
		padding: 0.35rem 0.55rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		color: var(--color-stone-500);
		text-transform: uppercase;
	}

	.layout-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
		width: 19rem;
		max-width: calc(100vw - 2rem);
	}

	.layout-option {
		display: grid !important;
		grid-template-columns: 2.7rem minmax(0, 1fr);
		gap: 0.55rem !important;
		min-height: 3.25rem;
	}

	.layout-option.active {
		background: color-mix(in oklab, var(--color-accent-500) 11%, transparent) !important;
		color: var(--color-accent-800) !important;
	}

	.layout-option small {
		display: block;
		margin-top: 0.1rem;
		font-size: 0.62rem;
		font-weight: 400;
		color: var(--color-stone-500);
	}

	.layout-preview {
		display: grid;
		width: 2.7rem;
		height: 1.9rem;
		gap: 2px;
		padding: 2px;
		border: 1px solid currentColor;
		border-radius: 0.22rem;
		opacity: 0.72;
	}

	.layout-preview i {
		display: block;
		min-width: 0;
		min-height: 0;
		border-radius: 1px;
		background: currentColor;
		opacity: 0.48;
	}
</style>
