<script lang="ts">
	import { formatReference } from '$lib/bible/reference';
	import { bookShortName } from '$lib/bible/book-names';
	import { formatNumber, t } from '$lib/i18n';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import MorphologyList from './MorphologyList.svelte';
	import BookDistribution from './BookDistribution.svelte';
	import GlossChart from './GlossChart.svelte';

	/**
	 * The study panel: dictionary entry, morphology, how the word is rendered, and every place it
	 * occurs.
	 *
	 * Loaded on demand from `/api/strong/…` rather than being rendered with the chapter, because a
	 * reader opens it for a handful of words out of a few hundred on the page.
	 */
	let {
		strong,
		word,
		reference,
		resourceIds,
		onClose
	}: {
		strong: string;
		word: string;
		/** Verse the word was clicked in, used to look up its original form. */
		reference: string;
		resourceIds: string[];
		onClose: () => void;
	} = $props();

	type Payload = {
		strong: string;
		found: boolean;
		entry: {
			lemma: string;
			transliteration: string | null;
			pronunciation: string | null;
			definitionHtml: string | null;
			derivationHtml: string | null;
			kjvDefinitionHtml: string | null;
			seeAlso: string[];
			language: 'grc' | 'hbo';
			licenseHtml: string | null;
			usageNotesHtml: string | null;
		} | null;
		alternative: string | null;
		statistics: { occurrences: number; verseCount: number };
		bookCounts: { book: number; count: number }[];
		glosses: { display: string; occurrences: number }[];
		occurrences: {
			occurrences: { book: number; chapter: number; verse: number; morph: string | null }[];
			total: number;
			page: number;
			pageCount: number;
		};
		original: { word: string; morph: string | null; lemma: string | null } | null;
		morphology: {
			code: string;
			partOfSpeech: string;
			features: { feature: string; value: string }[];
			unknown: string[];
		} | null;
	};

	let payload = $state<Payload | null>(null);
	let loading = $state(true);
	let failed = $state(false);
	let page = $state(1);
	let asideEl: HTMLElement | undefined = $state();

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') onClose();
	}

	// A click on another Strong's word must switch the lookup, not close the panel first — that
	// word is outside `asideEl`, so without this exclusion it would immediately reopen empty.
	function onWindowClick(event: MouseEvent): void {
		const target = event.target as HTMLElement | null;
		if (!asideEl || !target) return;
		if (asideEl.contains(target)) return;
		if (target.closest('.strong')) return;
		onClose();
	}

	$effect(() => {
		// Re-fetch whenever the word, the verse or the page changes.
		const url = `/api/strong/${encodeURIComponent(strong)}?ref=${encodeURIComponent(reference)}&resources=${encodeURIComponent(resourceIds.join(','))}&page=${page}`;
		const controller = new AbortController();
		loading = true;
		failed = false;

		fetch(url, { signal: controller.signal })
			.then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
			.then((data: Payload) => {
				payload = data;
				loading = false;
			})
			.catch((cause: unknown) => {
				if (cause instanceof DOMException && cause.name === 'AbortError') return;
				failed = true;
				loading = false;
			});

		return () => controller.abort();
	});

	// Reset to the first page when a different word is opened.
	let shownStrong = $state('');
	$effect(() => {
		if (shownStrong !== strong) {
			shownStrong = strong;
			page = 1;
		}
	});
</script>

<svelte:window onkeydown={onWindowKeydown} onclick={onWindowClick} />

<!--
  Two shapes for one panel, both overlays: on a phone it's a bottom sheet, so the verse that was
  tapped stays readable above it; from `sm` up it's a right-hand panel pinned under the site
  header. Neither shares a flex row with `main`, so opening or closing it never resizes the
  reading columns — that used to happen on every single word click.
-->
<div
	class="pointer-events-none fixed inset-x-0 top-[var(--header-height)] bottom-0 z-30 hidden
	       bg-stone-950/5 sm:block dark:bg-black/25"
	aria-hidden="true"
></div>

<aside
	bind:this={asideEl}
	class="panel fixed inset-x-0 bottom-0 z-40 flex max-h-[62dvh] flex-col rounded-t-xl border
	       border-stone-200 bg-white shadow-2xl sm:inset-x-auto sm:top-[var(--header-height)]
	       sm:right-[max(0px,calc((100vw-var(--content-max-width))/2-28rem))] sm:bottom-auto
	       sm:h-[calc(100dvh-var(--header-height))] sm:max-h-none
	       sm:w-[32rem]
	       sm:rounded-none sm:border-0 sm:border-l
	       sm:shadow-[-8px_0_24px_rgb(28_25_23/0.04)]
	       lg:right-[max(0px,calc((100vw-var(--content-max-width))/2-36rem))] lg:w-[36rem]
	       dark:border-stone-800 dark:bg-stone-900"
	aria-label={t('sidebar.tab.strong')}
>
	<header
		class="flex items-center justify-between gap-2 border-b border-stone-200 bg-accent-50/70 px-4 py-3
		       dark:border-stone-800 dark:bg-accent-900/20"
	>
		<h2 class="text-sm font-semibold">
			{t('strong.title', { id: strong })}
		</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label={t('action.close')}
			class="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700
			       dark:hover:bg-stone-800 dark:hover:text-stone-200"
		>
			<svg viewBox="0 0 20 20" class="size-4" fill="currentColor" aria-hidden="true">
				<path
					d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
				/>
			</svg>
		</button>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
		{#if loading && !payload}
			<p class="text-stone-500 dark:text-stone-400">…</p>
		{:else if failed}
			<p class="text-stone-600 dark:text-stone-300">{t('error.server.body')}</p>
		{:else if payload}
			{#if !payload.found}
				<p class="mb-2 text-stone-600 dark:text-stone-300">{t('strong.notFound')}</p>
				{#if payload.alternative}
					<p>
						<a
							class="text-accent-600 hover:underline dark:text-accent-400"
							href="/{payload.alternative}"
						>
							{t('strong.tryOther', { id: payload.alternative })}
						</a>
					</p>
				{/if}
			{:else if payload.entry}
				<!-- Headword: the original word, its transliteration and pronunciation. -->
				<div class="mb-1 flex items-start justify-between gap-3">
					<p
						class="min-w-0 text-2xl leading-snug"
						lang={payload.entry.language}
						dir={payload.entry.language === 'hbo' ? 'rtl' : 'ltr'}
						style="font-family: var({payload.entry.language === 'hbo'
							? '--font-hebrew'
							: '--font-greek'})"
					>
						{payload.original?.word ?? payload.entry.lemma}
					</p>
					{#if payload.statistics.occurrences > 0}
						<a class="all-occurrences" href="/{strong}">
							{t('strong.showAll')}
							<svg
								viewBox="0 0 20 20"
								class="size-3.5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								aria-hidden="true"
							>
								<path d="m7 4 6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</a>
					{/if}
				</div>
				<p class="mb-3 text-xs text-stone-500 dark:text-stone-400">
					{#if payload.entry.transliteration}<span>{payload.entry.transliteration}</span>{/if}
					{#if payload.entry.pronunciation}
						<span class="mx-1">·</span><span>[{payload.entry.pronunciation}]</span>
					{/if}
					{#if payload.original?.lemma && payload.original.lemma !== payload.original.word}
						<span class="mx-1">·</span><span>{payload.original.lemma}</span>
					{/if}
				</p>

				{#if word}
					<p class="mb-3 text-stone-600 dark:text-stone-300">
						<span class="font-medium">{word}</span>
						<span class="text-stone-400"> — {reference}</span>
					</p>
				{/if}

				{#if payload.morphology}
					<section class="mb-4">
						<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
							{t('strong.grammar')}
						</h3>
						<MorphologyList morphology={payload.morphology} />
					</section>
				{/if}

				{#if payload.entry.definitionHtml}
					<section class="mb-4">
						<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
							{t('strong.definition')}
						</h3>
						<!-- Lexicon HTML is built by our own parser (src/lib/bible/parse/strongs-xml.ts): every
						     scrap of source text is escaped and only spans and internal Strong links are emitted. -->
						<div class="lexicon" use:verseHoverPopover={{ bibleId: resourceIds[0] ?? null }}>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html payload.entry.definitionHtml}
						</div>
					</section>
				{/if}

				{#if payload.entry.derivationHtml}
					<section class="mb-4">
						<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
							{t('strong.derivation')}
						</h3>
						<div class="lexicon" use:verseHoverPopover={{ bibleId: resourceIds[0] ?? null }}>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html payload.entry.derivationHtml}
						</div>
					</section>
				{/if}

				{#if payload.entry.licenseHtml}
					<section class="mb-4">
						<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
							{t('strong.license')}
						</h3>
						<p class="text-xs text-stone-500 dark:text-stone-400">{payload.entry.licenseHtml}</p>
					</section>
				{/if}

				{#if payload.entry.usageNotesHtml}
					<details class="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
						<summary
							class="cursor-pointer text-xs font-semibold tracking-wide text-stone-500 uppercase"
						>
							{t('strong.usageNotes')}
						</summary>
						<div
							class="lexicon mt-2 text-xs text-stone-500 dark:text-stone-400"
							use:verseHoverPopover={{ bibleId: resourceIds[0] ?? null }}
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html payload.entry.usageNotesHtml}
						</div>
					</details>
				{/if}

				{#if payload.glosses.length > 0}
					<section class="mb-4">
						<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
							{t('strong.translations')}
						</h3>
						<GlossChart glosses={payload.glosses} groupBelowPercent={3} centerLabel />
					</section>
				{/if}

				{#if payload.statistics.occurrences > 0}
					<section>
						<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
							{t('strong.occurrences')}
						</h3>
						<p class="mb-2 text-xs text-stone-500 dark:text-stone-400">
							{t('strong.occurrencesCount', {
								count: formatNumber(payload.statistics.occurrences),
								verses: formatNumber(payload.statistics.verseCount)
							})}
						</p>
						<div class="mb-3">
							<BookDistribution
								counts={payload.bookCounts}
								hrefForBook={(book) => `/${strong}?book=${book}`}
								compact
							/>
						</div>
						<ul class="flex flex-wrap gap-1">
							{#each payload.occurrences.occurrences as occurrence (`${occurrence.book}-${occurrence.chapter}-${occurrence.verse}`)}
								<li>
									<a
										class="inline-block rounded border border-stone-200 px-1.5 py-0.5 text-xs
										       hover:border-accent-500 hover:text-accent-700 dark:border-stone-700
										       dark:hover:text-accent-300"
										href="/{bookShortName(
											occurrence.book
										)}{occurrence.chapter},{occurrence.verse}#{encodeURIComponent(strong)}"
									>
										{formatReference({
											book: occurrence.book,
											chapter: occurrence.chapter,
											verse: occurrence.verse
										})}
									</a>
								</li>
							{/each}
						</ul>

						{#if payload.occurrences.pageCount > 1}
							<div class="mt-2 flex items-center gap-2 text-xs">
								<button
									type="button"
									class="rounded px-2 py-1 enabled:hover:bg-stone-200 disabled:opacity-40 dark:enabled:hover:bg-stone-800"
									disabled={page <= 1}
									onclick={() => (page -= 1)}
								>
									←
								</button>
								<span class="text-stone-500 dark:text-stone-400">
									{t('search.page', {
										page: payload.occurrences.page,
										pages: payload.occurrences.pageCount
									})}
								</span>
								<button
									type="button"
									class="rounded px-2 py-1 enabled:hover:bg-stone-200 disabled:opacity-40 dark:enabled:hover:bg-stone-800"
									disabled={page >= payload.occurrences.pageCount}
									onclick={() => (page += 1)}
								>
									→
								</button>
							</div>
						{/if}
					</section>
				{/if}
			{/if}
		{/if}
	</div>
</aside>

<style>
	/* The sheet slides up on a phone, in from the right on a wider screen; the reduced-motion block
	   in layout.css shortens both to nothing. */
	@media (max-width: 639px) {
		.panel {
			animation: slide-up 180ms ease-out;
		}
	}

	@media (min-width: 640px) {
		.panel {
			animation: slide-in-right 180ms ease-out;
		}
	}

	@keyframes slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@keyframes slide-in-right {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.lexicon :global(a) {
		color: var(--color-accent-600);
		text-decoration: none;
	}

	.lexicon :global(a:hover) {
		text-decoration: underline;
	}

	:global(.dark) .lexicon :global(a) {
		color: var(--color-accent-400);
	}

	.lexicon :global(.original) {
		font-family: var(--font-greek);
	}

	.lexicon :global(abbr) {
		cursor: help;
		text-decoration: underline dotted;
		text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
	}

	/* A real <a>, so it already gets the pointer cursor a link implies; only the underline needs to
	   read as distinct from the plain cross-reference links above. */
	.lexicon :global(.verse-ref) {
		text-decoration: underline dotted;
		text-decoration-color: color-mix(in oklab, var(--color-accent-500) 50%, transparent);
	}

	.lexicon :global(.verse-ref:hover) {
		text-decoration-style: solid;
	}

	.all-occurrences {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.1rem;
		padding: 0.38rem 0.55rem 0.38rem 0.7rem;
		border-radius: 0.5rem;
		background: var(--color-accent-100);
		color: var(--color-accent-800);
		font-family: var(--font-sans);
		font-size: 0.72rem;
		font-weight: 650;
		text-decoration: none;
		transition:
			background 130ms ease,
			transform 130ms ease;
	}

	.all-occurrences:hover {
		background: var(--color-accent-200);
		transform: translateY(-1px);
	}
	:global(.dark) .all-occurrences {
		background: color-mix(in oklab, var(--color-accent-800) 42%, transparent);
		color: var(--color-accent-200);
	}
	:global(.dark) .all-occurrences:hover {
		background: color-mix(in oklab, var(--color-accent-700) 52%, transparent);
	}

	/* Groups the related words listed under a "Wortfamilie:" heading, so they read as belonging to it
	   rather than continuing the entry's own numbered senses above. */
	.lexicon :global(.wf-entry) {
		display: block;
		margin-top: 0.35rem;
		margin-left: 0.9rem;
		padding-left: 0.6rem;
		border-left: 2px solid var(--color-stone-200);
	}

	:global(.dark) .lexicon :global(.wf-entry) {
		border-left-color: var(--color-stone-700);
	}
</style>
