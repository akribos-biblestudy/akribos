<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { bookById } from '$lib/bible/books';
	import {
		formatReference,
		parseReference,
		referencePath,
		type VerseRef
	} from '$lib/bible/reference';
	import { READER_LINK_SETS, type ReaderLinkSet, type ReaderTab } from '$lib/reader/workspace';
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import Menu from './Menu.svelte';
	import ResourceKindIcon from './ResourceKindIcon.svelte';

	let {
		tileId,
		tileIndex,
		tab,
		resource,
		reference,
		searchQuery = null,
		studyResourceTitle = null,
		onOpenResource,
		onSearch,
		onClearSearch
	}: {
		tileId: string;
		tileIndex: number;
		tab: ReaderTab;
		resource: ReadableResource;
		reference: VerseRef;
		searchQuery?: string | null;
		studyResourceTitle?: string | null;
		onOpenResource: (tileId: string, tabId: string) => void;
		onSearch: (query: string) => void;
		onClearSearch: () => void;
	} = $props();

	let value = $state('');
	let focused = $state(false);
	let valueTabId = $state('');
	let linkMenu = $state<Menu>();
	let infoMenu = $state<Menu>();

	$effect(() => {
		const tabChanged = valueTabId !== tab.id;
		valueTabId = tab.id;
		if (tabChanged) focused = false;
		if (tabChanged || !focused)
			value =
				resource.kind === 'lexicon'
					? (tab.lookup ?? '')
					: (searchQuery ?? formatReference(reference));
	});

	const referenceEnhancement: SubmitFunction = ({ formData, cancel }) => {
		const query = String(
			formData.get(resource.kind === 'lexicon' ? 'lookup' : 'reference') ?? ''
		).trim();
		if (resource.kind === 'lexicon') {
			cancel();
			if (!query) return;
			focused = false;
			onSearch(query);
			return;
		}
		// A bare book name is a perfectly valid word search. References therefore need an explicit
		// chapter number; quoting a term always keeps it in text-search mode.
		const parsed = /\d/.test(query) && !/^["“”]/.test(query) ? parseReference(query) : null;
		if (!parsed) {
			cancel();
			if (!query) return;
			focused = false;
			onSearch(query);
			return;
		}
		if (!bookById(parsed.book) || parsed.chapter > (bookById(parsed.book)?.chapters ?? 0)) {
			cancel();
			return;
		}
		return async ({ result, update }) => {
			await update({ reset: false, invalidateAll: result.type !== 'success' });
			if (result.type === 'success') {
				focused = false;
				onClearSearch();
				await goto(referencePath(parsed), {
					invalidateAll: true,
					noScroll: true
				});
			}
		};
	};

	const linkEnhancement: SubmitFunction = () => {
		return async ({ update }) => {
			linkMenu?.close();
			await update({ reset: false });
		};
	};

	function linkClass(linkSet: ReaderLinkSet): string {
		return linkSet ? `link-${linkSet.toLowerCase()}` : 'link-none';
	}
</script>

<div class="tab-toolbar" data-testid="tab-toolbar">
	<button
		type="button"
		class="resource-button"
		aria-label="{resource.selectionTitle} wechseln"
		title="Werk wechseln"
		data-tour-target={tileIndex === 0 ? 'resource-picker' : undefined}
		onclick={() => onOpenResource(tileId, tab.id)}
	>
		<ResourceKindIcon kind={resource.kind} class="resource-kind-icon kind-{resource.kind}" />
		<span aria-hidden="true">⌄</span>
	</button>

	<form
		method="POST"
		action={resource.kind === 'lexicon' ? '?/setTabLookup' : '?/setTabReference'}
		use:enhance={referenceEnhancement}
		class="reference-form"
		role="search"
	>
		<input type="hidden" name="tileId" value={tileId} />
		<input type="hidden" name="tabId" value={tab.id} />
		<label class="sr-only" for="tab-reference-{tab.id}">
			{resource.kind === 'lexicon'
				? `Strong-Nummer oder Wort in ${resource.abbrev}`
				: `Bibelstelle oder Suche in ${resource.abbrev}`}
		</label>
		<input
			id="tab-reference-{tab.id}"
			name={resource.kind === 'lexicon' ? 'lookup' : 'reference'}
			type="search"
			bind:value
			placeholder={resource.kind === 'lexicon' ? 'Strong-Nummer oder Wort' : undefined}
			autocomplete="off"
			spellcheck="false"
			data-tour-target={tileIndex === 0 ? 'search-chooser' : undefined}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
		/>
		{#if resource.kind === 'lexicon' && studyResourceTitle}
			<span class="study-source" title="Vorkommen aus {studyResourceTitle}">
				{studyResourceTitle}
			</span>
		{/if}
	</form>

	<button
		type="button"
		class="link-button {linkClass(tab.linkSet)}"
		aria-label="Link-Set für {resource.abbrev}: {tab.linkSet ?? 'Keine'}"
		title="Link-Set {tab.linkSet ?? 'Keine'}"
		data-tour-target={tileIndex === 0 ? 'column-link' : undefined}
		onclick={(event) => linkMenu?.openAt(event.currentTarget)}
	>
		{#if tab.linkSet}
			{tab.linkSet}
		{:else}
			<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
				<path
					d="M12.23 4.23a2.5 2.5 0 0 1 3.54 3.54l-1.23 1.22a.75.75 0 1 0 1.06 1.06l1.23-1.22a4 4 0 0 0-5.66-5.66l-3 3a4 4 0 0 0 .23 5.87.75.75 0 0 0 .97-1.14 2.5 2.5 0 0 1-.14-3.67l3-3ZM7.77 15.77a2.5 2.5 0 0 1-3.54-3.54l1.23-1.22a.75.75 0 1 0-1.06-1.06l-1.23 1.22a4 4 0 0 0 5.66 5.66l3-3a4 4 0 0 0-.23-5.87.75.75 0 0 0-.97 1.14 2.5 2.5 0 0 1 .14 3.67l-3 3Z"
				/>
			</svg>
		{/if}
	</button>

	<button
		type="button"
		class="info-button"
		aria-label="Informationen zu {resource.abbrev}"
		title="Werk-Informationen"
		onclick={(event) => infoMenu?.openAt(event.currentTarget)}
	>
		<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
			<path
				fill-rule="evenodd"
				d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9.25 9a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-1.5 0V9Z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>
</div>

<Menu bind:this={linkMenu} label="Link-Set wählen">
	<p class="menu-label">Link-Set</p>
	<div class="link-options" role="none">
		{#each READER_LINK_SETS as linkSet (linkSet)}
			<form method="POST" action="?/setTabLinkSet" use:enhance={linkEnhancement} role="none">
				<input type="hidden" name="tileId" value={tileId} />
				<input type="hidden" name="tabId" value={tab.id} />
				<input type="hidden" name="linkSet" value={linkSet} />
				<button
					type="submit"
					role="menuitemradio"
					class={linkClass(linkSet)}
					class:selected={tab.linkSet === linkSet}
					aria-checked={tab.linkSet === linkSet}>{linkSet}</button
				>
			</form>
		{/each}
		<form method="POST" action="?/setTabLinkSet" use:enhance={linkEnhancement} role="none">
			<input type="hidden" name="tileId" value={tileId} />
			<input type="hidden" name="tabId" value={tab.id} />
			<input type="hidden" name="linkSet" value="" />
			<button
				type="submit"
				role="menuitemradio"
				class="none-option"
				class:selected={tab.linkSet === null}
				aria-checked={tab.linkSet === null}>Keine</button
			>
		</form>
	</div>
</Menu>

<Menu bind:this={infoMenu} label="Werk-Informationen">
	<div class="resource-info">
		<strong>{resource.selectionTitle}</strong>
		{#if resource.selectionSubtitle}<span>{resource.selectionSubtitle}</span>{/if}
		{#if resource.licenseHtml}
			<hr />
			<p>{resource.licenseHtml}</p>
		{:else}
			<p>Für dieses Werk sind keine weiteren Copyright-Hinweise hinterlegt.</p>
		{/if}
		{#if resource.usageNotesHtml}
			<!-- Dictionary usage notes come from the escaping/allow-listing import parser. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<div class="resource-notes">{@html resource.usageNotesHtml}</div>
		{/if}
	</div>
</Menu>

<style>
	.tab-toolbar {
		display: flex;
		height: 2.7rem;
		flex: none;
		align-items: stretch;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}
	.resource-button,
	.link-button,
	.info-button {
		display: inline-flex;
		width: 2.55rem;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 0.08rem;
		color: var(--color-stone-500);
	}
	.resource-button:hover,
	.info-button:hover {
		background: var(--color-stone-100);
		color: var(--color-stone-800);
	}
	.resource-button :global(.resource-kind-icon) {
		width: 1.15rem;
		height: 1.15rem;
	}
	.resource-button :global(.kind-bible) {
		color: #39834b;
	}
	.resource-button :global(.kind-commentary) {
		color: #806640;
	}
	.resource-button :global(.kind-lexicon) {
		color: #2f70a7;
	}
	.resource-button :global(.kind-xrefs) {
		color: #526b78;
	}
	.resource-button span {
		font-size: 0.65rem;
	}
	.info-button {
		border-left: 1px solid var(--line);
	}
	.info-button svg {
		width: 1.1rem;
		height: 1.1rem;
	}

	.reference-form {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: center;
		margin: 0.3rem 0.15rem;
		border-radius: 0.4rem;
		background: var(--color-stone-100);
	}
	.reference-form:focus-within {
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-accent-500) 45%, transparent);
	}
	.reference-form input {
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.35rem 0.25rem 0.35rem 0.55rem;
		font-size: 0.78rem;
		outline: none;
	}
	.study-source {
		max-width: 6.5rem;
		flex: none;
		overflow: hidden;
		margin-right: 0.3rem;
		padding: 0.15rem 0.35rem;
		border: 1px solid color-mix(in oklab, #39834b 30%, var(--line));
		border-radius: 999px;
		background: color-mix(in oklab, #39834b 9%, transparent);
		color: color-mix(in oklab, #39834b 85%, var(--color-stone-800));
		font-size: 0.58rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.link-button {
		width: 1.7rem;
		height: 1.7rem;
		align-self: center;
		margin: 0 0.18rem;
		border-radius: 0.35rem;
		background: var(--link-color, transparent);
		font-size: 0.68rem;
		font-weight: 800;
		color: white;
	}
	.link-button svg {
		width: 1rem;
		height: 1rem;
	}
	.link-button.link-none {
		border: 1px solid var(--line);
		color: var(--color-stone-400);
	}
	.link-a {
		--link-color: #f97316;
	}
	.link-b {
		--link-color: #2563eb;
	}
	.link-c {
		--link-color: #16a34a;
	}
	.link-d {
		--link-color: #9333ea;
	}
	.link-e {
		--link-color: #e11d48;
	}

	.menu-label {
		padding: 0.35rem 0.55rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		color: var(--color-stone-500);
		text-transform: uppercase;
	}
	.link-options {
		display: flex;
		gap: 0.32rem;
		padding: 0.1rem;
	}
	.link-options form {
		flex: none;
	}
	.link-options button {
		width: 2.15rem !important;
		height: 2.15rem;
		justify-content: center;
		padding: 0 !important;
		border-radius: 0.4rem !important;
		background: color-mix(
			in oklab,
			var(--link-color, var(--color-stone-400)) 12%,
			transparent
		) !important;
		color: var(--link-color, var(--color-stone-700)) !important;
		font-weight: 700 !important;
	}
	.link-options button.selected {
		background: var(--link-color, var(--color-stone-600)) !important;
		box-shadow: 0 0 0 2px
			color-mix(in oklab, var(--link-color, var(--color-stone-600)) 25%, transparent);
		color: white !important;
	}
	.link-options .none-option {
		width: auto !important;
		padding-inline: 0.65rem !important;
	}

	.resource-info {
		width: 17rem;
		max-width: calc(100vw - 2rem);
		padding: 0.65rem;
	}
	.resource-info strong,
	.resource-info span {
		display: block;
	}
	.resource-info span,
	.resource-info p,
	.resource-info .resource-notes {
		margin-top: 0.25rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.resource-info hr {
		margin: 0.6rem 0;
		border-color: var(--line);
	}

	:global(.dark) .reference-form {
		background: var(--color-stone-900);
	}
	:global(.dark) .resource-button:hover,
	:global(.dark) .info-button:hover {
		background: var(--color-stone-800);
		color: var(--color-stone-100);
	}
</style>
