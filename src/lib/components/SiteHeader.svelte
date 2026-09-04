<script lang="ts">
	import { goto } from '$app/navigation';
	import { allBookNames } from '$lib/bible/book-names';
	import { bookById } from '$lib/bible/books';
	import { parseReference, referencePath } from '$lib/bible/reference';
	import { jumpToVerse } from '$lib/reader-location.svelte';
	import { t } from '$lib/i18n';
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';
	import ProductTour from './ProductTour.svelte';
	import ReaderViewMenu from './ReaderViewMenu.svelte';
	import ReaderLayoutPicker from './ReaderLayoutPicker.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import type { ReaderLayout } from '$lib/reader/workspace';
	import { startTour } from '$lib/tour/tour-state.svelte';
	import { tourStepsFor, GUEST_TOUR_STEPS, MEMBER_TOUR_STEPS } from '$lib/tour/steps';

	/**
	 * Outside the reader, one global input accepts a reference, word or Strong's number. Reader pages
	 * deliberately replace it with the independent search/location field inside every resource tab.
	 */
	let {
		query = '',
		previous = null,
		next = null,
		user = null,
		readerPreferences = null,
		guestTourDone = false
	}: {
		query?: string;
		previous?: string | null;
		next?: string | null;
		user?: {
			displayName: string | null;
			email: string;
			role: string;
			tourCompletedAt: Date | string | null;
		} | null;
		readerPreferences?: { fontScale: number; layout: ReaderLayout } | null;
		/** Whether this device already finished (or dismissed) the tour while signed out. */
		guestTourDone?: boolean;
	} = $props();

	/**
	 * The tour only has something to point at in the reader, so it mounts and auto-starts only there
	 * (`readerPreferences` is the same "are we on the reader" signal `ReaderViewMenu` uses). A signed-in
	 * reader who never finished it sees the full sequence, unless this device already finished the
	 * signed-out part — then only the signed-in-only steps are new. `tourCompletedAt` is the durable,
	 * cross-device record; the cookie only ever shortens what a *first* sign-in shows.
	 */
	const autoStartTourSteps = $derived.by(() => {
		if (user)
			return user.tourCompletedAt ? [] : guestTourDone ? MEMBER_TOUR_STEPS : tourStepsFor(true);
		return guestTourDone ? [] : GUEST_TOUR_STEPS;
	});

	function restartTour(): void {
		userMenu?.close();
		startTour(tourStepsFor(!!user), !!user);
	}

	/**
	 * Follows `query` as the reader navigates or scrolls — but only while the field is not focused.
	 * `query` now also moves in the background as the reader scrolls the reader (see
	 * `reader-location.svelte.ts`), and a plain `$derived` would silently overwrite whatever the reader
	 * had just typed the moment that next scroll update landed, before they got to press Enter.
	 */
	let value = $state(untrack(() => query));
	let focused = $state(false);
	$effect(() => {
		if (!focused) value = query;
	});
	let input: HTMLInputElement | undefined = $state();
	let searchHelper: HTMLDivElement | undefined = $state();
	let selectedBookId: number | null = $state(null);
	let userMenu: Menu | undefined = $state();
	const userInitial = $derived(
		(user?.displayName?.trim() || user?.email || '').charAt(0).toLocaleUpperCase('de')
	);
	const books = allBookNames().map((book) => ({
		...book,
		chapters: bookById(book.book)?.chapters ?? 1
	}));
	const oldTestament = books.slice(0, 39);
	const newTestament = books.slice(39);
	const selectedBook = $derived(books.find((book) => book.book === selectedBookId) ?? null);
	type BookCategory = {
		label: string;
		tone: string;
	};

	const oldTestamentCategories: BookCategory[] = [
		{ label: 'Gesetz', tone: 'law' },
		{ label: 'Geschichte', tone: 'history' },
		{ label: 'Dichtung', tone: 'poetry' },
		{ label: 'Große Propheten', tone: 'major-prophets' },
		{ label: 'Kleine Propheten', tone: 'minor-prophets' }
	];
	const newTestamentCategories: BookCategory[] = [
		{ label: 'Evangelien', tone: 'gospels' },
		{ label: 'Geschichte', tone: 'acts' },
		{ label: 'Paulusbriefe', tone: 'pauline' },
		{ label: 'Allgemeine Briefe', tone: 'general' },
		{ label: 'Prophetie', tone: 'revelation' }
	];

	function bookCategory(book: number): string {
		if (book <= 5) return 'law';
		if (book <= 17) return 'history';
		if (book <= 22) return 'poetry';
		if (book <= 27) return 'major-prophets';
		if (book <= 39) return 'minor-prophets';
		if (book <= 43) return 'gospels';
		if (book === 44) return 'acts';
		if (book <= 57) return 'pauline';
		if (book <= 65) return 'general';
		return 'revelation';
	}

	async function keepSearchHelpFor(next: EventTarget | null): Promise<void> {
		// Switching from books to chapters replaces the focused button. Wait for that DOM update and the
		// new focus target before deciding whether focus really left the chooser.
		await tick();
		const active = document.activeElement;
		focused =
			active === input ||
			(active instanceof Node && searchHelper?.contains(active) === true) ||
			next === input ||
			(next instanceof Node && searchHelper?.contains(next) === true);
	}

	function openBookChooser(): void {
		focused = true;
		selectedBookId = null;
	}

	async function selectBook(book: (typeof books)[number]): Promise<void> {
		selectedBookId = book.book;
		value = book.names.short;
		focused = true;
		await tick();
		searchHelper?.querySelector<HTMLAnchorElement>('.chapter-link')?.focus();
	}

	async function showBookChooser(): Promise<void> {
		const bookId = selectedBookId;
		selectedBookId = null;
		value = query;
		focused = true;
		await tick();
		searchHelper?.querySelector<HTMLButtonElement>(`[data-book="${bookId}"]`)?.focus();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;

		// A reference already on screen — or already loaded via infinite scroll further up or down the
		// stream — would otherwise be a no-op: the URL `goto` below would navigate to is the one already
		// showing, and the reader may since have scrolled away from it. Scrolling there directly covers
		// that; anything not already loaded (a different chapter, a word, a Strong's number) falls
		// through to a real navigation exactly as before.
		const reference = parseReference(trimmed);
		if (reference && jumpToVerse?.(reference)) {
			input?.blur();
			return;
		}

		await goto(`/${encodeURIComponent(trimmed)}`, { noScroll: true });
		input?.blur();
	}

	/**
	 * Typing anywhere focuses the search box, as on the old site, and the arrow keys page through
	 * chapters. Both are skipped while a field or a modifier key is in play.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (readerPreferences) return;
		const target = event.target as HTMLElement | null;
		const typing =
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target?.isContentEditable === true;

		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (!typing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
			const destination = event.key === 'ArrowLeft' ? previous : next;
			if (destination) {
				event.preventDefault();
				void goto(destination);
			}
			return;
		}

		if (typing) return;

		if (event.key === '/' || (event.key.length === 1 && /\S/.test(event.key))) {
			event.preventDefault();
			value = event.key === '/' ? '' : event.key;
			input?.focus();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<header
	class="sticky top-0 z-30 border-b border-stone-200/70 bg-[color:var(--surface)]/92 shadow-[0_1px_12px_rgb(28_25_23/0.045)]
	       backdrop-blur-xl before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-accent-500
	       dark:border-white/8 dark:shadow-black/20"
>
	<div
		class="mx-auto flex h-[var(--header-height)] max-w-[var(--content-max-width)] items-center gap-2 px-3 pt-0.5 sm:gap-5 sm:px-5"
	>
		<a href="/" class="group shrink-0 focus-visible:rounded-sm" aria-label="Akribos – Startseite">
			{#if readerPreferences}
				<img src="/logo.png" alt="Akribos" class="h-8 w-auto sm:h-10" />
			{:else}
				<img src="/logo.png" alt="Akribos" class="hidden h-10 w-auto sm:block" />
				<img src="/icon.png" alt="" class="size-9 rounded-sm sm:hidden" />
			{/if}
		</a>

		<div class="flex min-w-0 flex-1 items-center justify-end gap-0.5">
			{#if readerPreferences}
				<ReaderLayoutPicker layout={readerPreferences.layout} />
			{:else}
				{#if previous}
					<a
						href={previous}
						rel="prev"
						title={t('nav.previousChapter')}
						aria-label={t('nav.previousChapter')}
						class="icon-button shrink-0"
					>
						<Icon name="chevron-left" />
					</a>
				{/if}

				<form class="relative w-full max-w-md min-w-0" onsubmit={submit} role="search">
					<label class="sr-only" for="site-search">{t('nav.search.placeholder')}</label>
					<div class="relative">
						<Icon
							name="search"
							class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
						/>
						<input
							bind:this={input}
							bind:value
							onfocus={openBookChooser}
							oninput={() => (selectedBookId = null)}
							onblur={(event) => keepSearchHelpFor(event.relatedTarget)}
							id="site-search"
							type="search"
							autocomplete="off"
							spellcheck="false"
							enterkeyhint="search"
							placeholder={t('nav.search.placeholder')}
							class="w-full rounded-xl border border-stone-300/90 bg-white/75 py-2.5 pr-9 pl-10 text-sm
						       shadow-sm placeholder:text-stone-400 focus:border-accent-500 focus:bg-white
						       focus:ring-3 focus:ring-accent-500/12 focus:outline-none dark:border-white/12
						       dark:bg-white/5 dark:placeholder:text-stone-500 dark:focus:bg-white/7"
						/>
						{#if value}
							<button
								type="button"
								aria-label={t('action.clear')}
								class="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 dark:hover:bg-white/8 dark:hover:text-stone-200"
								onclick={() => {
									value = '';
									selectedBookId = null;
									input?.focus();
								}}
							>
								<Icon name="x" class="size-4" />
							</button>
						{/if}
					</div>
					{#if focused}
						<div
							bind:this={searchHelper}
							data-tour-target="search-chooser"
							class="search-helper absolute top-[calc(100%+0.55rem)] left-1/2 z-50 w-[min(56rem,calc(100vw-1rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-stone-200/80 bg-[color:var(--surface-raised)] shadow-[0_18px_50px_rgb(28_25_23/0.16)] dark:border-white/10 dark:shadow-black/35"
							role="dialog"
							tabindex="-1"
							aria-label={t('search.help.title')}
							onfocusout={(event) => keepSearchHelpFor(event.relatedTarget)}
						>
							<div class="border-b border-stone-200/80 px-4 py-3.5 sm:px-5 dark:border-white/8">
								{#if selectedBook}
									<div class="flex items-center gap-3">
										<button
											type="button"
											class="back-to-books"
											aria-label={t('search.help.backToBooks')}
											onclick={showBookChooser}
										>
											<Icon name="chevron-left" class="size-4" />
										</button>
										<div>
											<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">
												{selectedBook.names.name}
											</h2>
											<p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
												{t('search.help.chooseChapter')}
											</p>
										</div>
									</div>
								{:else}
									<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">
										{t('search.help.title')}
									</h2>
									<p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
										{t('search.help.subtitle')}
									</p>
								{/if}
							</div>

							<div
								class="max-h-[calc(100dvh-var(--header-height)-1.25rem)] overflow-y-auto p-4 sm:p-5"
							>
								{#if selectedBook}
									<div
										class="chapter-picker grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10"
										data-category={bookCategory(selectedBook.book)}
										aria-label={t('search.help.chaptersFor', { book: selectedBook.names.name })}
									>
										{#each Array.from({ length: selectedBook.chapters }, (_, index) => index + 1) as chapter (chapter)}
											<a
												class="chapter-link"
												href={referencePath({ book: selectedBook.book, chapter })}
												aria-label={`${selectedBook.names.name} ${chapter}`}
												onclick={() => {
													focused = false;
													selectedBookId = null;
												}}
											>
												{chapter}
											</a>
										{/each}
									</div>
								{:else}
									<div class="grid gap-5 lg:grid-cols-2 lg:gap-8">
										<section>
											<h3 class="search-help-heading">{t('search.help.oldTestament')}</h3>
											<div class="book-legend" aria-label="Buchgruppen">
												{#each oldTestamentCategories as category (category.tone)}
													<span data-category={category.tone}>{category.label}</span>
												{/each}
											</div>
											<div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
												{#each oldTestament as book (book.book)}
													<button
														type="button"
														class="book-link"
														data-book={book.book}
														data-category={bookCategory(book.book)}
														aria-label={book.names.name}
														onclick={() => selectBook(book)}
													>
														<strong>{book.names.short}</strong>
														{#if book.names.name !== book.names.short}
															<small>{book.names.name}</small>
														{/if}
													</button>
												{/each}
											</div>
										</section>

										<section>
											<h3 class="search-help-heading">{t('search.help.newTestament')}</h3>
											<div class="book-legend" aria-label="Buchgruppen">
												{#each newTestamentCategories as category (category.tone)}
													<span data-category={category.tone}>{category.label}</span>
												{/each}
											</div>
											<div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
												{#each newTestament as book (book.book)}
													<button
														type="button"
														class="book-link"
														data-book={book.book}
														data-category={bookCategory(book.book)}
														aria-label={book.names.name}
														onclick={() => selectBook(book)}
													>
														<strong>{book.names.short}</strong>
														{#if book.names.name !== book.names.short}
															<small>{book.names.name}</small>
														{/if}
													</button>
												{/each}
											</div>
										</section>
									</div>

									<div
										data-tour-target="search-syntax"
										class="mt-5 grid gap-2 border-t border-stone-200/80 pt-4 text-xs sm:grid-cols-2 dark:border-white/8"
									>
										<p class="search-tip">
											<strong>G26 / H430</strong><span>{t('search.help.strong')}</span>
										</p>
										<p class="search-tip">
											<strong>„Gott liebt“</strong><span>{t('search.help.phrase')}</span>
										</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</form>

				{#if next}
					<a
						href={next}
						rel="next"
						title={t('nav.nextChapter')}
						aria-label={t('nav.nextChapter')}
						class="icon-button shrink-0"
					>
						<Icon name="chevron-right" />
					</a>
				{/if}
			{/if}
		</div>

		<nav class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			{#if readerPreferences}
				<ReaderViewMenu fontScale={readerPreferences.fontScale} />
				<ProductTour signedIn={!!user} autoStart={autoStartTourSteps} />
			{:else}
				<ThemeToggle />
			{/if}

			<button
				type="button"
				data-tour-target="user-menu"
				aria-label={t('nav.userMenu')}
				aria-haspopup="menu"
				class="group ml-3 flex min-h-9 items-center gap-2 rounded-lg p-1 text-stone-600 transition-colors hover:bg-stone-200/65
				       dark:text-stone-300 dark:hover:bg-white/8"
				onclick={(event) => userMenu?.openAt(event.currentTarget)}
			>
				{#if user}
					<span
						class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-800 ring-1 ring-accent-600/10 dark:bg-accent-900/45 dark:text-accent-200"
						aria-hidden="true"
					>
						{userInitial}
					</span>
					<span class="hidden max-w-32 truncate pr-1 text-sm font-medium sm:block">
						{user.displayName ?? user.email}
					</span>
				{:else}
					<span
						class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors group-hover:bg-white dark:bg-white/7 dark:text-stone-300 dark:group-hover:bg-white/10"
						aria-hidden="true"
					>
						<Icon name="user" class="size-4.5" />
					</span>
				{/if}
			</button>

			<Menu bind:this={userMenu} label={t('nav.userMenu')}>
				{#if user}
					<a href="/account" role="menuitem" data-sveltekit-preload-data="hover"
						>{t('nav.account')}</a
					>
					{#if user.role === 'admin'}
						<a href="/admin" role="menuitem" data-sveltekit-preload-data="hover">{t('nav.admin')}</a
						>
					{/if}
					<hr />
				{/if}
				{#if readerPreferences}
					<button type="button" role="menuitem" onclick={restartTour}>{t('nav.tour')}</button>
				{/if}
				<a href="/help" role="menuitem">{t('nav.help')}</a>
				<a href="/about" role="menuitem">{t('nav.about')}</a>
				{#if !user}
					<hr />
					<a href="/login" role="menuitem">{t('nav.login')}</a>
				{/if}
				<hr />
				<a href="/impressum" role="menuitem">{t('nav.impressum')}</a>
				<a href="/datenschutz" role="menuitem">{t('nav.datenschutz')}</a>
				{#if user}
					<hr />
					<form method="POST" action="/logout" role="none">
						<button type="submit" role="menuitem">{t('auth.logout.submit')}</button>
					</form>
				{/if}
			</Menu>
		</nav>
	</div>
</header>

<style>
	.search-help-heading {
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-stone-500);
	}

	.book-link {
		--book-tone: var(--color-stone-400);
		display: flex;
		min-width: 0;
		min-height: 2.65rem;
		flex-direction: column;
		justify-content: center;
		gap: 0.08rem;
		padding: 0.35rem 0.48rem 0.35rem 0.65rem;
		border: 1px solid color-mix(in oklab, var(--book-tone) 16%, var(--color-stone-200));
		border-left: 3px solid var(--book-tone);
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--book-tone) 4%, var(--surface-raised));
		color: var(--color-stone-700);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			background 120ms ease,
			border-color 120ms ease,
			transform 120ms ease;
	}

	.book-link strong,
	.book-link small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.book-link strong {
		font-size: 0.76rem;
		font-weight: 700;
		line-height: 1.1;
	}
	.book-link small {
		color: var(--color-stone-400);
		font-size: 0.62rem;
		line-height: 1.2;
	}
	.book-link:hover {
		border-color: color-mix(in oklab, var(--book-tone) 42%, var(--color-stone-200));
		background: color-mix(in oklab, var(--book-tone) 10%, var(--surface-raised));
		transform: translateY(-1px);
	}
	.book-link:focus-visible,
	.chapter-link:focus-visible,
	.back-to-books:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
	}

	.back-to-books {
		display: inline-flex;
		width: 2rem;
		height: 2rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		color: var(--color-stone-500);
		cursor: pointer;
	}
	.back-to-books:hover {
		background: var(--color-stone-100);
		color: var(--color-stone-800);
	}

	.chapter-picker {
		--book-tone: var(--color-stone-400);
	}
	.chapter-link {
		display: inline-flex;
		min-height: 2.65rem;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in oklab, var(--book-tone) 20%, var(--color-stone-200));
		border-radius: 0.55rem;
		background: color-mix(in oklab, var(--book-tone) 5%, var(--surface-raised));
		color: var(--color-stone-700);
		font-size: 0.78rem;
		font-weight: 700;
		text-decoration: none;
		transition:
			background 120ms ease,
			border-color 120ms ease,
			transform 120ms ease;
	}
	.chapter-link:hover {
		border-color: color-mix(in oklab, var(--book-tone) 48%, var(--color-stone-200));
		background: color-mix(in oklab, var(--book-tone) 12%, var(--surface-raised));
		transform: translateY(-1px);
	}

	.book-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.65rem;
		margin-top: 0.5rem;
		color: var(--color-stone-500);
		font-size: 0.6rem;
		line-height: 1.2;
	}
	.book-legend span {
		--book-tone: var(--color-stone-400);
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
	}
	.book-legend span::before {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 999px;
		background: var(--book-tone);
		content: '';
	}

	.book-link[data-category='law'],
	.chapter-picker[data-category='law'],
	.book-legend span[data-category='law'] {
		--book-tone: #b58a37;
	}
	.book-link[data-category='history'],
	.chapter-picker[data-category='history'],
	.book-legend span[data-category='history'] {
		--book-tone: #b97855;
	}
	.book-link[data-category='poetry'],
	.chapter-picker[data-category='poetry'],
	.book-legend span[data-category='poetry'] {
		--book-tone: #b65f70;
	}
	.book-link[data-category='major-prophets'],
	.chapter-picker[data-category='major-prophets'],
	.book-legend span[data-category='major-prophets'] {
		--book-tone: #9a6c91;
	}
	.book-link[data-category='minor-prophets'],
	.chapter-picker[data-category='minor-prophets'],
	.book-legend span[data-category='minor-prophets'] {
		--book-tone: #7669a4;
	}
	.book-link[data-category='gospels'],
	.chapter-picker[data-category='gospels'],
	.book-legend span[data-category='gospels'] {
		--book-tone: #668f70;
	}
	.book-link[data-category='acts'],
	.chapter-picker[data-category='acts'],
	.book-legend span[data-category='acts'] {
		--book-tone: #478d87;
	}
	.book-link[data-category='pauline'],
	.chapter-picker[data-category='pauline'],
	.book-legend span[data-category='pauline'] {
		--book-tone: #5d8796;
	}
	.book-link[data-category='general'],
	.chapter-picker[data-category='general'],
	.book-legend span[data-category='general'] {
		--book-tone: #5f7fa8;
	}
	.book-link[data-category='revelation'],
	.chapter-picker[data-category='revelation'],
	.book-legend span[data-category='revelation'] {
		--book-tone: #397fa4;
	}
	.search-tip {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		color: var(--color-stone-500);
	}
	.search-tip strong {
		flex: 0 0 auto;
		border-radius: 0.4rem;
		background: var(--color-stone-100);
		padding: 0.3rem 0.45rem;
		color: var(--color-stone-700);
		font-weight: 650;
	}

	:global(.dark) .book-link {
		border-color: color-mix(in oklab, var(--book-tone) 24%, rgb(255 255 255 / 0.08));
		background: color-mix(in oklab, var(--book-tone) 7%, var(--surface-raised));
		color: var(--color-stone-300);
	}
	:global(.dark) .chapter-link {
		border-color: color-mix(in oklab, var(--book-tone) 28%, rgb(255 255 255 / 0.08));
		background: color-mix(in oklab, var(--book-tone) 8%, var(--surface-raised));
		color: var(--color-stone-300);
	}
	:global(.dark) .chapter-link:hover {
		border-color: color-mix(in oklab, var(--book-tone) 55%, rgb(255 255 255 / 0.1));
		background: color-mix(in oklab, var(--book-tone) 18%, var(--surface-raised));
		color: var(--color-stone-100);
	}
	:global(.dark) .back-to-books:hover {
		background: rgb(255 255 255 / 0.08);
		color: var(--color-stone-100);
	}
	:global(.dark) .book-link small {
		color: var(--color-stone-500);
	}
	:global(.dark) .book-link:hover {
		border-color: color-mix(in oklab, var(--book-tone) 50%, rgb(255 255 255 / 0.1));
		background: color-mix(in oklab, var(--book-tone) 16%, var(--surface-raised));
		color: var(--color-stone-100);
	}
	:global(.dark) .search-tip strong {
		background: rgb(255 255 255 / 0.07);
		color: var(--color-stone-200);
	}

	@media (max-width: 639px) {
		.search-helper {
			display: none;
		}
	}

	/* Medium-width screens need generous targets, but the regular header controls remain visually
	   borderless. A viewport width alone does not mean that the device is an e-ink display. */
	@media (min-width: 640px) and (max-width: 1280px) {
		:global(.icon-button) {
			min-width: 2.75rem;
			min-height: 2.75rem;
		}
	}

	/* On actual e-ink/monochrome displays, subtle translucent controls and hover-only boundaries are
	   difficult to see, so those devices retain the deliberately stronger treatment. */
	@media (update: slow), (monochrome) {
		:global(.icon-button) {
			border: 1px solid var(--color-stone-400);
			background: var(--surface-raised);
			color: var(--color-stone-800);
		}

		.search-helper {
			border-color: var(--color-stone-400);
			backdrop-filter: none;
		}
	}
</style>
