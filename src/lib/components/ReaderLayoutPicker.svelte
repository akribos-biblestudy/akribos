<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import {
		readerActionUrl,
		readerStateFromActionData,
		readerStateFromPage,
		readerUrl
	} from '$lib/reader/url-state';
	import { READER_LAYOUT_DEFINITIONS, type ReaderLayout } from '$lib/reader/workspace';
	import {
		readReaderNotesSidecarOpen,
		READER_NOTES_SIDECAR_EVENT,
		setReaderNotesSidecarOpen,
		type ReaderNotesSidecarEvent
	} from '$lib/reader/notes-sidecar';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';

	let { layout, notesAvailable = false }: { layout: ReaderLayout; notesAvailable?: boolean } =
		$props();
	let menu = $state<Menu>();
	let notesSidecarOpen = $state(false);

	onMount(() => {
		if (!notesAvailable) return;
		notesSidecarOpen = readReaderNotesSidecarOpen();
		const synchronize = (event: Event) => {
			notesSidecarOpen = (event as ReaderNotesSidecarEvent).detail.open;
		};
		window.addEventListener(READER_NOTES_SIDECAR_EVENT, synchronize);
		return () => window.removeEventListener(READER_NOTES_SIDECAR_EVENT, synchronize);
	});

	function toggleNotesSidecar(): void {
		setReaderNotesSidecarOpen(!notesSidecarOpen);
		menu?.close();
	}

	const submitEnhancement: SubmitFunction = () => {
		return async ({ result, update }) => {
			menu?.close();
			const state = result.type === 'success' ? readerStateFromActionData(result.data) : null;
			if (state) {
				await goto(readerUrl(page.url.pathname, state), {
					replaceState: true,
					invalidateAll: true,
					noScroll: true
				});
				return;
			}
			await update({ reset: false, invalidateAll: result.type !== 'success' });
		};
	};

	function actionUrl(): string {
		return readerActionUrl('setLayout', readerStateFromPage(page));
	}
</script>

<button
	type="button"
	class="layout-trigger icon-button"
	aria-label="Kachelanordnung wählen"
	title="Kachelanordnung"
	data-testid="layout-picker"
	onclick={(event) => menu?.openAt(event.currentTarget)}
>
	<Icon name="layout" />
</button>

<Menu bind:this={menu} label="Kachelanordnung">
	<p class="menu-title">Kachelanordnung</p>
	<div class="layout-options" role="none">
		{#each READER_LAYOUT_DEFINITIONS as definition (definition.id)}
			<form method="POST" action={actionUrl()} use:enhance={submitEnhancement} role="none">
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
	{#if notesAvailable}
		<hr />
		<button
			type="button"
			role="menuitemcheckbox"
			class="notes-sidecar-option"
			aria-checked={notesSidecarOpen}
			data-testid="reader-notes-sidecar-toggle"
			onclick={toggleNotesSidecar}
		>
			<Icon name="file-text" class="size-4" />
			<span>
				<strong>Notizbereich</strong>
				<small>{notesSidecarOpen ? 'Im Reader eingeblendet' : 'Neben dem Bibeltext öffnen'}</small>
			</span>
			<span class="toggle-indicator" aria-hidden="true"><i></i></span>
		</button>
	{/if}
</Menu>

<style>
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

	.notes-sidecar-option > span:nth-child(2) {
		display: grid;
		min-width: 0;
		flex: 1;
	}

	.notes-sidecar-option strong {
		font-size: 0.8rem;
	}

	.notes-sidecar-option small {
		margin-top: 0.1rem;
		color: var(--color-stone-500);
		font-size: 0.65rem;
	}

	.toggle-indicator {
		display: flex;
		width: 1.9rem;
		height: 1.05rem;
		flex: 0 0 auto;
		align-items: center;
		padding: 0.12rem;
		border-radius: 999px;
		background: var(--color-stone-300);
		transition: background 120ms ease;
	}

	.toggle-indicator i {
		display: block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 999px;
		background: white;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
		transition: transform 120ms ease;
	}

	.notes-sidecar-option[aria-checked='true'] .toggle-indicator {
		background: var(--color-accent-600);
	}

	.notes-sidecar-option[aria-checked='true'] .toggle-indicator i {
		transform: translateX(0.85rem);
	}
</style>
