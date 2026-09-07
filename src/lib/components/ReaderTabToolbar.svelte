<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { bookById } from '$lib/bible/books';
	import {
		formatReference,
		parseReference,
		referencePath,
		type VerseRef
	} from '$lib/bible/reference';
	import { READER_LINK_SETS, type ReaderLinkSet, type ReaderTab } from '$lib/reader/workspace';
	import {
		readerActionUrl,
		readerStateFromActionData,
		readerStateFromPage,
		readerUrl
	} from '$lib/reader/url-state';
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import Icon from './Icon.svelte';
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
		onOpenResource: (tileId: string, tabId: string, anchor: HTMLElement) => void;
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
			if (result.type === 'success') {
				focused = false;
				onClearSearch();
				const state = readerStateFromActionData(result.data);
				if (!state) return;
				await goto(readerUrl(referencePath(parsed), state), {
					invalidateAll: true,
					noScroll: true
				});
				return;
			}
			await update({ reset: false, invalidateAll: true });
		};
	};

	const linkEnhancement: SubmitFunction = () => {
		return async ({ result, update }) => {
			linkMenu?.close();
			const state = result.type === 'success' ? readerStateFromActionData(result.data) : null;
			if (state) {
				await goto(readerUrl(page.url.pathname, state), {
					replaceState: true,
					invalidateAll: true,
					noScroll: true,
					keepFocus: true
				});
				return;
			}
			await update({ reset: false, invalidateAll: result.type !== 'success' });
		};
	};

	function linkClass(linkSet: ReaderLinkSet): string {
		return linkSet ? `link-${linkSet.toLowerCase()}` : 'link-none';
	}

	function actionUrl(action: string): string {
		return readerActionUrl(action, readerStateFromPage(page));
	}
</script>

<div class="tab-toolbar" data-testid="tab-toolbar">
	<button
		type="button"
		class="resource-button"
		aria-label="{resource.selectionTitle} wechseln"
		title="Werk wechseln"
		data-tour-target={tileIndex === 0 ? 'resource-picker' : undefined}
		onclick={(event) => onOpenResource(tileId, tab.id, event.currentTarget)}
	>
		<ResourceKindIcon kind={resource.kind} class="toolbar-resource-icon" />
		<Icon name="chevron-down" class="size-2.5" />
	</button>

	<form
		method="POST"
		action={actionUrl(resource.kind === 'lexicon' ? 'setTabLookup' : 'setTabReference')}
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
		aria-label="Tabgruppe für {resource.abbrev} wechseln; aktuell {tab.linkSet ?? 'Keine'}"
		title="Tabgruppe wechseln"
		data-tour-target={tileIndex === 0 ? 'column-link' : undefined}
		onclick={(event) => linkMenu?.openAt(event.currentTarget)}
	>
		<span class="link-badge">
			{#if tab.linkSet}
				{tab.linkSet}
			{:else}
				<Icon name="link" class="size-3" />
			{/if}
		</span>
		<span class="link-label">Tabgruppe wechseln</span>
		<Icon name="chevron-down" class="link-chevron" />
	</button>

	<button
		type="button"
		class="info-button"
		aria-label="Informationen zu {resource.abbrev}"
		title="Werk-Informationen"
		onclick={(event) => infoMenu?.openAt(event.currentTarget)}
	>
		<Icon name="info" class="size-4.5" />
	</button>
</div>

<Menu bind:this={linkMenu} label="Tabgruppe wechseln">
	<p class="menu-label">Tabgruppe wechseln</p>
	<div class="link-options" role="none">
		{#each READER_LINK_SETS as linkSet (linkSet)}
			<form
				method="POST"
				action={actionUrl('setTabLinkSet')}
				use:enhance={linkEnhancement}
				role="none"
			>
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
		<form
			method="POST"
			action={actionUrl('setTabLinkSet')}
			use:enhance={linkEnhancement}
			role="none"
		>
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
	.resource-button :global(.toolbar-resource-icon) {
		width: 1.15rem;
		height: 1.35rem;
	}
	.info-button {
		border-left: 1px solid var(--line);
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
		width: auto;
		height: 1.65rem;
		align-self: center;
		margin: 0 0.18rem;
		gap: 0.3rem;
		padding: 0.12rem 0.28rem 0.12rem 0.16rem;
		border: 1px solid transparent;
		border-radius: 0.35rem;
		color: var(--color-stone-600);
	}
	.link-button:hover {
		border-color: var(--line);
		background: var(--color-stone-100);
		color: var(--color-stone-900);
	}
	.link-badge {
		display: inline-flex;
		width: 1.28rem;
		height: 1.28rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 0.24rem;
		background: color-mix(in oklab, var(--link-color, var(--color-stone-500)) 76%, var(--surface));
		color: white;
		font-size: 0.61rem;
		font-weight: 750;
	}
	.link-none .link-badge {
		border: 1px solid var(--line);
		background: var(--surface-raised);
		color: var(--color-stone-400);
	}
	.link-label {
		font-size: 0.68rem;
		font-weight: 550;
		white-space: nowrap;
	}
	.link-chevron {
		width: 0.68rem;
		height: 0.68rem;
		flex: none;
		color: var(--color-stone-400);
	}
	.link-a {
		--link-color: #b9683f;
	}
	.link-b {
		--link-color: #55759b;
	}
	.link-c {
		--link-color: #60836d;
	}
	.link-d {
		--link-color: #776b91;
	}
	.link-e {
		--link-color: #9a6572;
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
		background: color-mix(
			in oklab,
			var(--link-color, var(--color-stone-600)) 78%,
			var(--surface)
		) !important;
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
	:global(.dark) .info-button:hover,
	:global(.dark) .link-button:hover {
		background: var(--color-stone-800);
		color: var(--color-stone-100);
	}
</style>
