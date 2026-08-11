<script lang="ts">
	import { goto } from '$app/navigation';
	import { allBookNames } from '$lib/bible/book-names';
	import { parseReference, referencePath } from '$lib/bible/reference';
	import { jumpToVerse } from '$lib/reader-location.svelte';
	import { t } from '$lib/i18n';
	import Menu from './Menu.svelte';
	import ReaderViewMenu from './ReaderViewMenu.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	/**
	 * The single input that accepts everything: a reference, a word, or a Strong's number. Submitting
	 * navigates to `/<input>`, where the resolver decides what it was — the same idea as the old
	 * search box, minus the four different code paths behind it.
	 */
	let {
		query = '',
		previous = null,
		next = null,
		user = null,
		readerPreferences = null
	}: {
		query?: string;
		previous?: string | null;
		next?: string | null;
		user?: { displayName: string | null; email: string; role: string } | null;
		readerPreferences?: { fontScale: number } | null;
	} = $props();

	/**
	 * Follows `query` as the reader navigates or scrolls — but only while the field is not focused.
	 * `query` now also moves in the background as the reader scrolls the reader (see
	 * `reader-location.svelte.ts`), and a plain `$derived` would silently overwrite whatever the reader
	 * had just typed the moment that next scroll update landed, before they got to press Enter.
	 */
	let value = $state(query);
	let focused = $state(false);
	$effect(() => {
		if (!focused) value = query;
	});
	let input: HTMLInputElement | undefined = $state();
	let searchHelper: HTMLDivElement | undefined = $state();
	let userMenu: Menu | undefined = $state();
	const userInitial = $derived(
		(user?.displayName?.trim() || user?.email || '').charAt(0).toLocaleUpperCase('de')
	);
	const books = allBookNames();
	const oldTestament = books.slice(0, 39);
	const newTestament = books.slice(39);
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

	function keepSearchHelpFor(next: EventTarget | null): void {
		focused = next === input || (next instanceof Node && searchHelper?.contains(next) === true);
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
			<img src="/logo.png" alt="Akribos" class="hidden h-10 w-auto sm:block" />
			<img src="/icon.png" alt="" class="size-9 rounded-sm sm:hidden" />
		</a>

		<div class="flex min-w-0 flex-1 items-center justify-center gap-0.5">
			{#if previous}
				<a
					href={previous}
					rel="prev"
					title={t('nav.previousChapter')}
					aria-label={t('nav.previousChapter')}
					class="icon-button shrink-0"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						aria-hidden="true"
					>
						<path d="m14.5 6.5-5.5 5.5 5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</a>
			{/if}

			<form class="relative w-full max-w-md min-w-0" onsubmit={submit} role="search">
				<label class="sr-only" for="site-search">{t('nav.search.placeholder')}</label>
				<div class="relative">
					<svg
						viewBox="0 0 24 24"
						class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="6.5" />
						<path d="m16 16 4 4" stroke-linecap="round" />
					</svg>
					<input
						bind:this={input}
						bind:value
						onfocus={() => (focused = true)}
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
								input?.focus();
							}}
						>
							<svg
								viewBox="0 0 20 20"
								class="size-4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								aria-hidden="true"
							>
								<path d="m6 6 8 8M14 6l-8 8" stroke-linecap="round" />
							</svg>
						</button>
					{/if}
				</div>
				{#if focused}
					<div
						bind:this={searchHelper}
						class="search-helper absolute top-[calc(100%+0.55rem)] left-1/2 z-50 w-[min(56rem,calc(100vw-1rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-stone-200/80 bg-[color:var(--surface-raised)] shadow-[0_18px_50px_rgb(28_25_23/0.16)] dark:border-white/10 dark:shadow-black/35"
						role="dialog"
						tabindex="-1"
						aria-label={t('search.help.title')}
						onfocusout={(event) => keepSearchHelpFor(event.relatedTarget)}
					>
						<div class="border-b border-stone-200/80 px-4 py-3.5 sm:px-5 dark:border-white/8">
							<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">
								{t('search.help.title')}
							</h2>
							<p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
								{t('search.help.subtitle')}
							</p>
						</div>

						<div
							class="max-h-[calc(100dvh-var(--header-height)-1.25rem)] overflow-y-auto p-4 sm:p-5"
						>
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
											<a
												class="book-link"
												data-category={bookCategory(book.book)}
												href={referencePath({ book: book.book, chapter: 1 })}
											>
												<strong>{book.names.short}</strong>
												{#if book.names.name !== book.names.short}
													<small>{book.names.name}</small>
												{/if}
											</a>
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
											<a
												class="book-link"
												data-category={bookCategory(book.book)}
												href={referencePath({ book: book.book, chapter: 1 })}
											>
												<strong>{book.names.short}</strong>
												{#if book.names.name !== book.names.short}
													<small>{book.names.name}</small>
												{/if}
											</a>
										{/each}
									</div>
								</section>
							</div>

							<div
								class="mt-5 grid gap-2 border-t border-stone-200/80 pt-4 text-xs sm:grid-cols-2 dark:border-white/8"
							>
								<p class="search-tip">
									<strong>G26 / H430</strong><span>{t('search.help.strong')}</span>
								</p>
								<p class="search-tip">
									<strong>„Gott liebt“</strong><span>{t('search.help.phrase')}</span>
								</p>
							</div>
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
					<svg
						viewBox="0 0 24 24"
						class="size-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						aria-hidden="true"
					>
						<path d="m9.5 6.5 5.5 5.5-5.5 5.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</a>
			{/if}
		</div>

		<nav class="flex shrink-0 items-center gap-0.5 sm:gap-1">
			{#if readerPreferences}
				<ReaderViewMenu fontScale={readerPreferences.fontScale} />
			{:else}
				<ThemeToggle />
			{/if}

			<button
				type="button"
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
						<svg
							viewBox="0 0 24 24"
							class="size-4.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<circle cx="12" cy="8.25" r="3.1" />
							<path d="M6.25 19c.65-3.2 2.75-5 5.75-5s5.1 1.8 5.75 5" stroke-linecap="round" />
						</svg>
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
		text-decoration: none;
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
	.book-legend span[data-category='law'] {
		--book-tone: #b58a37;
	}
	.book-link[data-category='history'],
	.book-legend span[data-category='history'] {
		--book-tone: #b97855;
	}
	.book-link[data-category='poetry'],
	.book-legend span[data-category='poetry'] {
		--book-tone: #b65f70;
	}
	.book-link[data-category='major-prophets'],
	.book-legend span[data-category='major-prophets'] {
		--book-tone: #9a6c91;
	}
	.book-link[data-category='minor-prophets'],
	.book-legend span[data-category='minor-prophets'] {
		--book-tone: #7669a4;
	}
	.book-link[data-category='gospels'],
	.book-legend span[data-category='gospels'] {
		--book-tone: #668f70;
	}
	.book-link[data-category='acts'],
	.book-legend span[data-category='acts'] {
		--book-tone: #478d87;
	}
	.book-link[data-category='pauline'],
	.book-legend span[data-category='pauline'] {
		--book-tone: #5d8796;
	}
	.book-link[data-category='general'],
	.book-legend span[data-category='general'] {
		--book-tone: #5f7fa8;
	}
	.book-link[data-category='revelation'],
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
