<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	import { allBookNames } from '$lib/bible/book-names';
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

	let {
		tileId,
		tileIndex,
		tab,
		resource,
		reference,
		searchQuery = null,
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
		onOpenResource: (tileId: string, tabId: string) => void;
		onSearch: (query: string) => void;
		onClearSearch: () => void;
	} = $props();

	let value = $state('');
	let focused = $state(false);
	let valueTabId = $state('');
	let referenceForm = $state<HTMLFormElement>();
	let referenceDialog = $state<HTMLDialogElement>();
	let selectedBookId = $state<number | null>(null);
	let linkMenu = $state<Menu>();
	let infoMenu = $state<Menu>();

	const books = allBookNames().map((book) => ({
		...book,
		chapters: bookById(book.book)?.chapters ?? 1
	}));
	const selectedBook = $derived(books.find((book) => book.book === selectedBookId) ?? null);

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
		const parsed = parseReference(query);
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
				referenceDialog?.close();
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

	async function chooseChapter(book: number, chapter: number): Promise<void> {
		value = formatReference({ book, chapter });
		await tick();
		referenceForm?.requestSubmit();
	}

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
		<svg viewBox="0 0 20 20" aria-hidden="true">
			<path
				d="M3.5 3.75A1.75 1.75 0 0 1 5.25 2h2.5c.97 0 1.82.46 2.25 1.17A2.75 2.75 0 0 1 12.25 2h2.5a1.75 1.75 0 0 1 1.75 1.75v9.5A1.75 1.75 0 0 1 14.75 15h-2.19c-.7 0-1.37.29-1.85.8l-.34.36a.75.75 0 0 1-1.09 0l-.33-.36A2.5 2.5 0 0 0 7.1 15H5.25a1.75 1.75 0 0 1-1.75-1.75v-9.5Z"
			/>
		</svg>
		<span aria-hidden="true">⌄</span>
	</button>

	<form
		bind:this={referenceForm}
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
		{#if resource.kind !== 'lexicon'}
			<button
				type="button"
				class="reference-chooser"
				aria-label="Buch und Kapitel wählen"
				onclick={() => {
					selectedBookId = reference.book;
					referenceDialog?.showModal();
				}}
			>
				<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path d="m4 6 4 4 4-4H4Z" />
				</svg>
			</button>
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

<dialog
	bind:this={referenceDialog}
	class="reference-dialog"
	aria-label="Buch und Kapitel wählen"
	onclick={(event) => {
		if (event.target === referenceDialog) referenceDialog?.close();
	}}
>
	<div class="dialog-card">
		<header>
			<div>
				<strong>{selectedBook ? selectedBook.names.name : 'Buch wählen'}</strong>
				<small>{selectedBook ? 'Kapitel wählen' : 'Altes und Neues Testament'}</small>
			</div>
			<button type="button" aria-label="Schließen" onclick={() => referenceDialog?.close()}
				>×</button
			>
		</header>
		{#if selectedBook}
			<button type="button" class="back-button" onclick={() => (selectedBookId = null)}
				>← Bücher</button
			>
			<div class="chapter-grid">
				{#each Array.from({ length: selectedBook.chapters }, (_, index) => index + 1) as chapter (chapter)}
					<button type="button" onclick={() => chooseChapter(selectedBook.book, chapter)}
						>{chapter}</button
					>
				{/each}
			</div>
		{:else}
			<div class="book-grid">
				{#each books as book (book.book)}
					<button type="button" onclick={() => (selectedBookId = book.book)}>
						<strong>{book.names.short}</strong>
						{#if book.names.name !== book.names.short}<small>{book.names.name}</small>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</dialog>

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
	.resource-button svg {
		width: 1.15rem;
		height: 1.15rem;
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
	.reference-chooser {
		display: inline-flex;
		width: 1.8rem;
		height: 100%;
		flex: none;
		align-items: center;
		justify-content: center;
		color: var(--color-stone-400);
	}
	.reference-chooser svg {
		width: 0.8rem;
		height: 0.8rem;
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

	.reference-dialog {
		position: fixed;
		inset: auto;
		top: 50dvh;
		left: 50vw;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(48rem, calc(100vw - 1rem));
		max-height: min(42rem, calc(100dvh - 1rem));
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 0.85rem;
		background: var(--surface-raised);
		color: var(--color-stone-800);
		box-shadow: 0 20px 60px rgb(0 0 0 / 0.22);
	}
	.reference-dialog::backdrop {
		background: rgb(28 25 23 / 0.35);
		backdrop-filter: blur(2px);
	}
	.dialog-card {
		display: flex;
		max-height: inherit;
		flex-direction: column;
		padding: 1rem;
	}
	.dialog-card header {
		display: flex;
		flex: none;
		align-items: start;
		justify-content: space-between;
		padding: 0.15rem 0.2rem 0.8rem;
	}
	.dialog-card header strong,
	.dialog-card header small {
		display: block;
	}
	.dialog-card header small {
		margin-top: 0.15rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}
	.dialog-card header button {
		font-size: 1.45rem;
		line-height: 1;
		color: var(--color-stone-400);
	}
	.back-button {
		align-self: start;
		margin-bottom: 0.65rem;
		color: var(--color-accent-700);
		font-size: 0.76rem;
		font-weight: 650;
	}
	.book-grid,
	.chapter-grid {
		display: grid;
		min-height: 0;
		overflow-y: auto;
		gap: 0.35rem;
	}
	.book-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.chapter-grid {
		grid-template-columns: repeat(10, minmax(0, 1fr));
	}
	.book-grid button,
	.chapter-grid button {
		min-width: 0;
		min-height: 2.5rem;
		padding: 0.35rem;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		background: var(--surface);
		text-align: left;
	}
	.book-grid button:hover,
	.chapter-grid button:hover {
		border-color: var(--color-accent-400);
		background: var(--color-accent-50);
	}
	.book-grid strong,
	.book-grid small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.book-grid strong {
		font-size: 0.72rem;
	}
	.book-grid small {
		margin-top: 0.08rem;
		color: var(--color-stone-500);
		font-size: 0.58rem;
	}
	.chapter-grid button {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 700;
	}

	:global(.dark) .reference-form {
		background: var(--color-stone-900);
	}
	:global(.dark) .resource-button:hover,
	:global(.dark) .info-button:hover {
		background: var(--color-stone-800);
		color: var(--color-stone-100);
	}
	:global(.dark) .reference-dialog {
		color: var(--color-stone-100);
	}
	:global(.dark) .book-grid button:hover,
	:global(.dark) .chapter-grid button:hover {
		background: var(--color-stone-800);
	}

	@media (max-width: 639px) {
		.book-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.chapter-grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}
</style>
