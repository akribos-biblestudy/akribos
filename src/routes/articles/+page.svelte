<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { t } from '$lib/i18n';

	let { data } = $props();
	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });
</script>

<svelte:head>
	<meta name="description" content={t('articles.subtitle')} />
	<link
		rel="alternate"
		type="application/atom+xml"
		title={t('articles.title')}
		href="/articles/feed.xml"
	/>
</svelte:head>

<main class="mx-auto w-full max-w-5xl px-4 py-9 sm:px-6 sm:py-14" data-testid="public-articles">
	<header class="mx-auto max-w-3xl text-center">
		<p class="text-xs font-bold tracking-[0.17em] text-accent-700 uppercase dark:text-accent-300">
			{t('app.name')}
		</p>
		<h1 class="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
			{t('articles.title')}
		</h1>
		<p class="mt-3 text-stone-500 dark:text-stone-400">{t('articles.subtitle')}</p>
	</header>

	{#if data.articles.length === 0}
		<p
			class="mt-14 rounded-2xl border border-dashed border-stone-300 py-16 text-center text-stone-500 dark:border-stone-700 dark:text-stone-400"
		>
			{t('articles.empty')}
		</p>
	{:else}
		<div class="mt-12 grid gap-5 sm:grid-cols-2">
			{#each data.articles as article, index (article.slug)}
				<article
					class="group flex min-h-64 flex-col rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-6 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md {index ===
					0
						? 'sm:col-span-2 sm:min-h-72 sm:p-8'
						: ''} dark:border-white/8"
				>
					<div class="flex flex-wrap gap-1.5">
						{#each article.tags.slice(0, 4) as tag (tag)}
							<span
								class="rounded-full bg-accent-50 px-2.5 py-1 text-[0.68rem] font-semibold text-accent-700 dark:bg-accent-900/35 dark:text-accent-300"
							>
								{tag}
							</span>
						{/each}
					</div>
					<h2
						class="mt-4 font-serif text-2xl leading-tight font-semibold {index === 0
							? 'sm:text-3xl'
							: ''}"
					>
						<a href="/articles/{article.slug}" class="after:absolute after:inset-0">
							{article.title}
						</a>
					</h2>
					{#if article.excerpt}
						<p
							class="mt-3 line-clamp-3 max-w-3xl leading-relaxed text-stone-500 dark:text-stone-400"
						>
							{article.excerpt}
						</p>
					{/if}
					<footer
						class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-7 text-xs text-stone-400"
					>
						<span>{t('articles.by', { author: article.authorName })}</span>
						<span class="inline-flex items-center gap-1.5">
							{dateFormat.format(new Date(article.publishedAt))}
							<Icon
								name="arrow-right"
								class="size-3.5 transition-transform group-hover:translate-x-0.5"
							/>
						</span>
					</footer>
				</article>
			{/each}
		</div>
		{#if data.page > 1 || data.hasNext}
			<nav
				class="mt-8 flex items-center justify-center gap-3"
				aria-label={t('articles.pagination')}
			>
				{#if data.page > 1}
					<a
						class="article-page-link"
						href={data.page === 2 ? '/articles' : `/articles?page=${data.page - 1}`}
					>
						<Icon name="chevron-left" class="size-4" />
						{t('articles.previous')}
					</a>
				{/if}
				<span class="text-xs text-stone-400">{t('articles.page', { page: data.page })}</span>
				{#if data.hasNext}
					<a class="article-page-link" href={`/articles?page=${data.page + 1}`}>
						{t('articles.next')}
						<Icon name="chevron-right" class="size-4" />
					</a>
				{/if}
			</nav>
		{/if}
	{/if}
</main>

<style>
	article {
		position: relative;
	}
	.article-page-link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid var(--line);
		border-radius: 0.65rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
	}
</style>
