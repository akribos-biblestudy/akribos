<script lang="ts">
	import { formatReference, referencePath } from '$lib/bible/reference';
	import { formatNumber, t } from '$lib/i18n';
	import HighlightedVerse from '$lib/components/HighlightedVerse.svelte';
	import BookDistribution from '$lib/components/BookDistribution.svelte';
	import Button from '$lib/components/Button.svelte';

	let { data } = $props();

	const countByResource = $derived(
		new Map((data.results?.counts ?? []).map((count) => [count.resourceId, count.count]))
	);

	function bookFilterHref(book: number): string {
		return `/search?q=${encodeURIComponent(data.query)}&book=${book}`;
	}
</script>

<svelte:head>
	<title>{data.query ? `${data.query} — Suche` : 'Suche'} — Akribos</title>
	<!-- Result pages are not useful in an index and change with the reader's column selection. -->
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<main class="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4">
	{#if !data.query}
		<h1 class="mb-2 text-xl font-semibold">{t('action.search')}</h1>
		<ul class="space-y-1 text-sm text-stone-600 dark:text-stone-300">
			<li>{t('search.hint.phrase')}</li>
			<li>{t('search.hint.strong')}</li>
			<li>{t('search.noResultsHint')}</li>
		</ul>
	{:else if !data.results || data.results.total === 0}
		<h1 class="mb-2 text-xl font-semibold">{t('search.noResults', { query: data.query })}</h1>
		{#if data.results?.suggestion}
			<p class="mb-3">
				<a
					class="text-accent-600 hover:underline dark:text-accent-400"
					href="/search?q={encodeURIComponent(data.results.suggestion)}"
				>
					{t('search.didYouMean', { suggestion: data.results.suggestion })}
				</a>
			</p>
		{/if}
		<p class="text-sm text-stone-600 dark:text-stone-300">{t('search.noResultsHint')}</p>
	{:else}
		<header class="mb-4">
			<h1 class="text-xl font-semibold">
				{t('search.results', { count: formatNumber(data.results.total), query: data.query })}
			</h1>
			<p class="mt-1 flex flex-wrap gap-x-3 text-xs text-stone-500 dark:text-stone-400">
				{#each data.columns as column (column.id)}
					<span>
						{t('search.inTranslation', {
							count: formatNumber(countByResource.get(column.id) ?? 0),
							translation: column.tabTitle
						})}
					</span>
				{/each}
			</p>
		</header>

		<BookDistribution
			counts={data.results.bookCounts}
			hrefForBook={bookFilterHref}
			activeBook={data.book}
		/>
		{#if data.book}
			<Button
				href="/search?q={encodeURIComponent(data.query)}"
				size="sm"
				variant="secondary"
				class="-mt-2 mb-4"
			>
				{t('statistics.clearFilter')}
			</Button>
		{/if}

		<ol class="space-y-4">
			{#each data.results.hits as hit (`${hit.book}-${hit.chapter}-${hit.verse}`)}
				<li class="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
					<a
						class="text-sm font-semibold text-accent-600 hover:underline dark:text-accent-400"
						href={referencePath({ book: hit.book, chapter: hit.chapter, verse: hit.verse })}
					>
						{formatReference(
							{ book: hit.book, chapter: hit.chapter, verse: hit.verse },
							{ style: 'full' }
						)}
					</a>

					<div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
						{#each hit.cells as cell, index (index)}
							{#if cell}
								<div>
									<p
										class="text-[0.65rem] font-semibold tracking-wide uppercase"
										class:text-accent-600={hit.matchedIn.includes(data.columns[index]?.id ?? '')}
										class:text-stone-400={!hit.matchedIn.includes(data.columns[index]?.id ?? '')}
									>
										{data.columns[index]?.tabTitle}
									</p>
									<p
										class="scripture-sized font-serif leading-relaxed"
										lang={data.columns[index]?.language}
										dir={data.columns[index]?.direction}
									>
										<HighlightedVerse
											segments={cell.segments}
											needles={data.results.query.highlight}
										/>
									</p>
								</div>
							{/if}
						{/each}
					</div>
				</li>
			{/each}
		</ol>

		{#if data.results.pageCount > 1}
			<nav class="mt-6 flex items-center gap-3 text-sm" aria-label="Seiten">
				{#if data.results.page > 1}
					<a
						class="rounded border border-stone-300 px-3 py-1 hover:border-accent-500 dark:border-stone-700"
						href="/search?q={encodeURIComponent(data.query)}&page={data.results.page - 1}{data.book
							? `&book=${data.book}`
							: ''}"
						rel="prev">←</a
					>
				{/if}
				<span class="text-stone-500 dark:text-stone-400">
					{t('search.page', { page: data.results.page, pages: data.results.pageCount })}
				</span>
				{#if data.results.page < data.results.pageCount}
					<a
						class="rounded border border-stone-300 px-3 py-1 hover:border-accent-500 dark:border-stone-700"
						href="/search?q={encodeURIComponent(data.query)}&page={data.results.page + 1}{data.book
							? `&book=${data.book}`
							: ''}"
						rel="next">→</a
					>
				{/if}
			</nav>
		{/if}
	{/if}
</main>
