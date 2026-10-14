<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { BOOKS, bookById, type Testament } from '$lib/bible/books';
	import { bookName, bookShortName } from '$lib/bible/book-names';
	import { BOOK_GROUPS, bookGroup } from '$lib/bible/book-groups';
	import type { VerseRef } from '$lib/bible/reference';
	import {
		BOOK_PICKER_COLUMNS,
		BOOK_PICKER_PAGE_SIZE,
		type ReaderBookNavigation
	} from '$lib/reader/book-navigation';
	import Icon from './Icon.svelte';

	let {
		resourceId,
		resourceTitle,
		tabId,
		reference,
		disabled = false,
		onSelect
	}: {
		resourceId: string;
		resourceTitle: string;
		tabId: string;
		reference: VerseRef;
		disabled?: boolean;
		onSelect: (reference: VerseRef) => void;
	} = $props();

	const id = $props.id();
	let trigger: HTMLButtonElement;
	let dialog: HTMLDialogElement;
	let grid = $state<HTMLDivElement>();
	let opened = $state(false);
	let loading = $state(false);
	let failed = $state(false);
	let books = $state<ReaderBookNavigation[]>([]);
	let testament = $state<Testament>('nt');
	let selectedBook = $state<number | null>(null);
	let chapterPage = $state(0);
	let focusedCell = $state(0);
	let openedContext = '';
	let request: AbortController | undefined;
	let frame: number | undefined;

	const visibleBooks = $derived(
		BOOKS.filter(
			(book) => book.testament === testament && books.some((row) => row.book === book.id)
		)
	);
	const chapters = $derived(books.find((row) => row.book === selectedBook)?.chapters ?? []);
	const visibleChapters = $derived(
		chapters.slice(chapterPage * BOOK_PICKER_PAGE_SIZE, (chapterPage + 1) * BOOK_PICKER_PAGE_SIZE)
	);
	const hasTestament = (value: Testament) =>
		books.some((row) => bookById(row.book)?.testament === value);
	const shortName = (book: number) => (book === 8 ? 'Rt' : bookShortName(book));

	function place(): void {
		if (!dialog?.open || !trigger?.isConnected) return;
		const viewport = window.visualViewport;
		const x = viewport?.offsetLeft ?? 0;
		const y = viewport?.offsetTop ?? 0;
		const width = Math.min(
			viewport?.width ?? window.innerWidth,
			document.documentElement.getBoundingClientRect().width - x
		);
		const height = viewport?.height ?? window.innerHeight;
		// 6 * 44px squares, 5 * 4px gaps, 2 * 10px padding, and a 1px border.
		const margin = Math.max(0, Math.min(8, (width - 306) / 2));
		const panelWidth = Math.min(306, width - margin * 2);
		const anchor = trigger.getBoundingClientRect();
		dialog.style.setProperty('--picker-width', `${panelWidth}px`);
		dialog.style.setProperty('--picker-max-height', `${Math.max(0, height - 16)}px`);
		const panelHeight = dialog.getBoundingClientRect().height;
		const below = y + height - 8 - anchor.bottom - 6;
		const above = anchor.top - 6 - y - 8;
		const top =
			panelHeight <= below || below >= above ? anchor.bottom + 6 : anchor.top - panelHeight - 6;
		dialog.style.left = `${Math.max(x + margin, Math.min(anchor.right - panelWidth, x + width - panelWidth - margin))}px`;
		dialog.style.top = `${Math.max(y + 8, Math.min(top, y + height - panelHeight - 8))}px`;
	}

	function schedulePlacement(): void {
		if (!opened) return;
		if (frame !== undefined) cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = undefined;
			place();
		});
	}

	$effect(() => {
		if (opened && (openedContext !== `${tabId}:${resourceId}` || disabled)) close();
	});
	$effect(() => {
		void visibleBooks.length;
		void visibleChapters.length;
		void loading;
		void failed;
		schedulePlacement();
	});

	onMount(() => {
		const viewport = window.visualViewport;
		viewport?.addEventListener('resize', schedulePlacement);
		viewport?.addEventListener('scroll', schedulePlacement);
		return () => {
			viewport?.removeEventListener('resize', schedulePlacement);
			viewport?.removeEventListener('scroll', schedulePlacement);
		};
	});
	onDestroy(() => {
		opened = false;
		request?.abort();
		if (frame !== undefined) cancelAnimationFrame(frame);
	});

	async function focusCell(index = 0): Promise<void> {
		focusedCell = Math.max(0, index);
		await tick();
		if (!opened) return;
		place();
		const cell = grid?.querySelectorAll<HTMLButtonElement>('button')[focusedCell];
		cell?.focus({ preventScroll: true });
		if (cell && grid) {
			const target = cell.getBoundingClientRect();
			const viewport = grid.getBoundingClientRect();
			if (target.top < viewport.top) grid.scrollTop -= viewport.top - target.top;
			else if (target.bottom > viewport.bottom) grid.scrollTop += target.bottom - viewport.bottom;
		}
	}

	async function loadBooks(): Promise<void> {
		request?.abort();
		const controller = new AbortController();
		request = controller;
		const context = openedContext;
		loading = true;
		failed = false;
		books = [];
		try {
			const response = await fetch(
				`/api/reader/resources/${encodeURIComponent(resourceId)}/navigation`,
				{
					signal: controller.signal
				}
			);
			if (!response.ok) throw new Error('navigation');
			const data: { books: ReaderBookNavigation[] } = await response.json();
			if (controller.signal.aborted || !opened || context !== `${tabId}:${resourceId}`) return;
			books = data.books;
			if (!hasTestament(testament)) testament = hasTestament('ot') ? 'ot' : 'nt';
			loading = false;
			// Do not steal focus if the reader already moved to the close button while loading.
			if (document.activeElement === dialog)
				await focusCell(
					Math.max(
						0,
						visibleBooks.findIndex((book) => book.id === reference.book)
					)
				);
		} catch {
			if (!controller.signal.aborted && opened && context === `${tabId}:${resourceId}`)
				failed = true;
		} finally {
			if (request === controller) loading = false;
		}
	}

	async function open(): Promise<void> {
		if (disabled) return;
		if (opened) return close();
		openedContext = `${tabId}:${resourceId}`;
		books = [];
		testament = bookById(reference.book)?.testament ?? 'nt';
		selectedBook = null;
		chapterPage = 0;
		focusedCell = 0;
		loading = true;
		failed = false;
		opened = true;
		await tick();
		if (!opened || openedContext !== `${tabId}:${resourceId}`) return;
		dialog.showModal();
		place();
		dialog.focus({ preventScroll: true });
		await loadBooks();
	}

	function close(): void {
		request?.abort();
		opened = false;
		dialog?.close();
	}

	function afterClose(): void {
		// A queued close event from a previous opening must not cancel a new request.
		if (dialog.open) return;
		request?.abort();
		opened = false;
		trigger?.focus({ preventScroll: true });
	}

	function chooseBook(book: number): void {
		selectedBook = book;
		const index = book === reference.book ? chapters.indexOf(reference.chapter) : 0;
		chapterPage = Math.floor(Math.max(0, index) / BOOK_PICKER_PAGE_SIZE);
		void focusCell(Math.max(0, index) % BOOK_PICKER_PAGE_SIZE);
	}

	function chooseChapter(chapter: number): void {
		if (
			selectedBook === null ||
			!chapters.includes(chapter) ||
			openedContext !== `${tabId}:${resourceId}`
		)
			return;
		const next = { book: selectedBook, chapter };
		close();
		onSelect(next);
	}

	function back(): void {
		const book = selectedBook;
		selectedBook = null;
		void focusCell(
			Math.max(
				0,
				visibleBooks.findIndex((row) => row.id === book)
			)
		);
	}

	function switchTestament(next: Testament): void {
		testament = next;
		focusedCell = 0;
		grid?.scrollTo(0, 0);
	}

	function tabKeydown(event: KeyboardEvent): void {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const next =
			event.key === 'Home' ? 'ot' : event.key === 'End' ? 'nt' : testament === 'ot' ? 'nt' : 'ot';
		if (!hasTestament(next)) return;
		switchTestament(next);
		dialog.querySelector<HTMLButtonElement>(`[data-testament="${next}"]`)?.focus();
	}

	function gridKeydown(event: KeyboardEvent): void {
		const cells = [...(grid?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
		const index = cells.indexOf(document.activeElement as HTMLButtonElement);
		if (index < 0) return;
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
				next = index + 1;
				break;
			case 'ArrowLeft':
				next = index - 1;
				break;
			case 'ArrowDown':
				next = index + BOOK_PICKER_COLUMNS;
				break;
			case 'ArrowUp':
				next = index - BOOK_PICKER_COLUMNS;
				break;
			case 'Home':
				next = event.ctrlKey ? 0 : Math.floor(index / BOOK_PICKER_COLUMNS) * BOOK_PICKER_COLUMNS;
				break;
			case 'End':
				next = event.ctrlKey
					? cells.length - 1
					: Math.floor(index / BOOK_PICKER_COLUMNS) * BOOK_PICKER_COLUMNS + BOOK_PICKER_COLUMNS - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		focusedCell = Math.max(0, Math.min(cells.length - 1, next));
		cells[focusedCell]?.focus();
	}
</script>

<svelte:window onresize={schedulePlacement} onscroll={schedulePlacement} />

<button
	bind:this={trigger}
	type="button"
	class="book-picker-trigger"
	aria-label="Buch und Kapitel in {resourceTitle} wählen"
	aria-haspopup="dialog"
	aria-expanded={opened}
	aria-controls="book-picker-{id}"
	title="Buch und Kapitel wählen"
	{disabled}
	onclick={() => void open()}
>
	<Icon name="book-open" class="size-4" />
</button>

<dialog
	bind:this={dialog}
	id="book-picker-{id}"
	class="book-picker"
	aria-label="Buch und Kapitel wählen"
	tabindex="-1"
	onclose={afterClose}
	oncancel={() => (opened = false)}
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
>
	<div class="picker-shell">
		<div class="picker-header">
			{#if selectedBook === null}
				<div class="testaments" role="tablist" aria-label="Testament">
					{#each ['ot', 'nt'] as const as value (value)}
						<button
							type="button"
							role="tab"
							onkeydown={tabKeydown}
							data-testament={value}
							id="testament-{id}-{value}"
							aria-controls="books-{id}"
							aria-selected={testament === value}
							tabindex={testament === value ? 0 : -1}
							aria-label={value === 'ot' ? 'Altes Testament' : 'Neues Testament'}
							title={value === 'ot' ? 'Altes Testament' : 'Neues Testament'}
							disabled={!hasTestament(value)}
							onclick={() => switchTestament(value)}>{value === 'ot' ? 'AT' : 'NT'}</button
						>
					{/each}
				</div>
			{:else}
				<button
					type="button"
					class="back-button"
					aria-label="Zur Buchauswahl"
					title="Zur Buchauswahl"
					onclick={back}
				>
					<Icon name="chevron-left" class="size-4" />{shortName(selectedBook)}
				</button>
				<span class="chapter-label" title={bookName(selectedBook)}>Kapitel wählen</span>
			{/if}
			<button type="button" class="close-button" aria-label="Buchauswahl schließen" onclick={close}>
				<Icon name="x" class="size-4" />
			</button>
		</div>
		{#if loading}
			<p class="picker-message" role="status">Bücher werden geladen …</p>
		{:else if failed}
			<div class="picker-message">
				<p role="alert">Die Buchauswahl konnte nicht geladen werden.</p>
				<button type="button" class="retry" onclick={() => void loadBooks()}
					>Erneut versuchen</button
				>
			</div>
		{:else if books.length === 0}
			<p class="picker-message" role="status">Dieses Werk enthält keine auswählbaren Kapitel.</p>
		{:else}
			<!-- The native buttons retain their semantics; arrows additionally follow the visual grid. -->
			<div
				bind:this={grid}
				class="book-grid"
				id="books-{id}"
				role={selectedBook === null ? 'tabpanel' : 'group'}
				aria-labelledby={selectedBook === null ? `testament-${id}-${testament}` : undefined}
				aria-label={selectedBook !== null ? `Kapitel in ${bookName(selectedBook)}` : undefined}
				onkeydown={gridKeydown}
			>
				{#if selectedBook === null}
					{#each visibleBooks as book, index (book.id)}
						{@const group = bookGroup(book.id)!}
						<button
							type="button"
							class="book-cell group-{group}"
							data-book={book.id}
							data-book-group={group}
							class:current={reference.book === book.id}
							aria-current={reference.book === book.id ? 'true' : undefined}
							title="{bookName(book.id)} · {BOOK_GROUPS[group]}"
							aria-label={bookName(book.id)}
							tabindex={index === focusedCell ? 0 : -1}
							onfocus={() => (focusedCell = index)}
							onclick={() => chooseBook(book.id)}>{shortName(book.id)}</button
						>
					{/each}
				{:else}
					{#each visibleChapters as chapter, index (chapter)}
						{@const current = reference.book === selectedBook && reference.chapter === chapter}
						<button
							type="button"
							class="chapter-cell"
							data-chapter={chapter}
							class:current
							aria-current={current ? 'true' : undefined}
							aria-label="{bookName(selectedBook)} {chapter}"
							tabindex={index === focusedCell ? 0 : -1}
							onfocus={() => (focusedCell = index)}
							onclick={() => chooseChapter(chapter)}>{chapter}</button
						>
					{/each}
				{/if}
			</div>
		{/if}
		{#if selectedBook !== null && chapters.length > BOOK_PICKER_PAGE_SIZE}
			<div class="chapter-pages">
				<button
					type="button"
					aria-label="Vorherige Kapitel"
					disabled={chapterPage === 0}
					onclick={() => {
						chapterPage -= 1;
						grid?.scrollTo(0, 0);
						void focusCell(0);
					}}><Icon name="chevron-left" class="size-4" /></button
				>
				<span role="status">{visibleChapters[0]}–{visibleChapters.at(-1)} / {chapters.at(-1)}</span>
				<button
					type="button"
					aria-label="Nächste Kapitel"
					disabled={(chapterPage + 1) * BOOK_PICKER_PAGE_SIZE >= chapters.length}
					onclick={() => {
						chapterPage += 1;
						grid?.scrollTo(0, 0);
						void focusCell(0);
					}}><Icon name="chevron-right" class="size-4" /></button
				>
			</div>
		{/if}
	</div>
</dialog>

<style>
	.book-picker-trigger {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 28px;
		margin-right: 3px;
		border: 0;
		border-left: 1px solid var(--line);
		border-radius: 0 5px 5px 0;
		background: color-mix(in oklab, var(--color-accent-500) 9%, var(--surface));
		color: var(--color-accent-700);
		cursor: pointer;
	}
	.book-picker-trigger:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.book-picker-trigger:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-accent-500) 18%, var(--surface));
	}
	.book-picker {
		position: fixed;
		inset: auto;
		box-sizing: border-box;
		width: var(--picker-width, 306px);
		max-width: none;
		max-height: var(--picker-max-height, calc(100dvh - 16px));
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-raised);
		color: var(--color-stone-800);
		box-shadow: 0 12px 36px rgb(28 25 23 / 0.16);
		font-family: var(--font-sans);
		font-size: 12px;
		overflow: hidden;
	}
	.book-picker::backdrop {
		background: transparent;
	}
	.picker-shell {
		display: flex;
		flex-direction: column;
		max-height: calc(var(--picker-max-height, 100dvh - 16px) - 2px);
	}
	.picker-header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		min-height: 46px;
		flex: none;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}
	.book-picker button {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: -2px;
	}
	.book-picker button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.testaments {
		display: flex;
		flex: 1;
		gap: 4px;
	}
	.testaments button {
		flex: 1;
		height: 38px;
		border-radius: 6px;
		background: transparent;
		font-size: 13px;
		font-weight: 650;
	}
	.testaments button[aria-selected='true'] {
		background: color-mix(in oklab, var(--color-accent-500) 12%, var(--surface-raised));
		color: var(--color-accent-700);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-accent-500) 28%, var(--line));
	}
	.close-button {
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 6px;
		background: transparent;
	}
	.back-button {
		height: 38px;
		gap: 5px;
		padding: 0 5px !important;
		background: transparent;
		font-weight: 650 !important;
	}
	.chapter-label {
		flex: 1;
		margin-right: 5px;
		text-align: right;
		font-size: 11px;
		color: var(--color-stone-500);
	}
	.book-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		grid-auto-rows: max-content;
		gap: 4px;
		padding: 10px;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
	}
	.book-grid::-webkit-scrollbar {
		display: none;
	}
	.book-grid button {
		position: relative;
		aspect-ratio: 1;
		width: 100%;
		min-width: 0;
		padding: 0 2px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface);
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.book-cell::after {
		content: '';
		position: absolute;
		bottom: -1px;
		left: -1px;
		right: -1px;
		height: 3px;
		border-radius: 0 0 4px 4px;
		background: var(--book-group-tone);
	}
	.book-grid button.current {
		background: color-mix(in oklab, var(--color-accent-500) 16%, var(--surface));
		border-color: color-mix(in oklab, var(--color-accent-500) 50%, var(--line));
	}
	.book-grid .chapter-cell {
		font-size: 13px;
		font-weight: 500;
	}
	.book-grid .chapter-cell.current {
		background: var(--color-accent-700);
		border-color: var(--color-accent-700);
		color: white;
		font-weight: 650;
	}
	.book-grid button:hover {
		background: color-mix(in oklab, var(--color-accent-500) 20%, var(--surface));
	}
	.book-grid .chapter-cell.current:hover {
		background: var(--color-accent-800);
	}
	.chapter-pages {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: space-between;
		min-height: 44px;
		padding: 0 5px;
		border-top: 1px solid var(--line);
		background: var(--surface);
		color: var(--color-stone-500);
		font-size: 11px;
	}
	.chapter-pages button {
		width: 44px;
		height: 44px;
		background: transparent;
	}
	.picker-message {
		margin: 0;
		padding: 18px 12px;
		font-size: 12px;
	}
	.book-picker .retry {
		margin-top: 10px;
		min-height: 38px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface);
	}
	.group-law {
		--book-group-tone: #b49a59;
	}
	.group-history {
		--book-group-tone: #bd8863;
	}
	.group-poetry {
		--book-group-tone: #b77b83;
	}
	.group-major {
		--book-group-tone: #a1809e;
	}
	.group-minor {
		--book-group-tone: #9283ae;
	}
	.group-gospels {
		--book-group-tone: #819d69;
	}
	.group-acts {
		--book-group-tone: #548154;
	}
	.group-pauline {
		--book-group-tone: #7b9fa0;
	}
	.group-general {
		--book-group-tone: #7896ba;
	}
	.group-revelation {
		--book-group-tone: #456e91;
	}
	:global(.dark) .book-picker {
		color: var(--color-stone-100);
	}
	:global(.dark) .book-cell::after {
		background: color-mix(in oklab, var(--book-group-tone) 85%, white);
	}
	:global(.dark) .book-picker-trigger,
	:global(.dark) .testaments button[aria-selected='true'] {
		color: var(--color-accent-300);
	}
	@media (max-width: 767px) {
		.book-picker-trigger {
			width: 38px;
			height: 32px;
		}
	}
</style>
