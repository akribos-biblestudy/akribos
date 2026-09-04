<script lang="ts">
	import { formatPassage, passageFromDbEndpoints } from '$lib/bible/passage';
	import BibleReferenceProse from '$lib/components/documents/BibleReferenceProse.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { t } from '$lib/i18n';

	let { data } = $props();
	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });
	const passages = $derived.by(() =>
		data.article.passages.flatMap((row) => {
			const passage = passageFromDbEndpoints(row);
			const reference = passage ? formatPassage(passage) : null;
			return reference ? [{ ...row, reference }] : [];
		})
	);
</script>

<svelte:head>
	<meta name="description" content={data.article.excerpt} />
	{#if data.article.visibility === 'unlisted'}
		<meta name="robots" content="noindex, nofollow" />
	{/if}
	<meta property="og:type" content="article" />
	<meta property="og:title" content={data.article.title} />
	<meta property="og:description" content={data.article.excerpt} />
</svelte:head>

<main class="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6 sm:py-12" data-testid="public-article">
	<a
		href="/articles"
		class="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
	>
		<Icon name="chevron-left" class="size-4" />
		{t('articles.title')}
	</a>

	<article
		class="mt-8 overflow-hidden rounded-3xl border border-stone-200/80 bg-[color:var(--surface)] shadow-[var(--shadow-soft)] dark:border-white/8"
	>
		<header class="border-b border-stone-200/80 px-6 py-8 sm:px-12 sm:py-12 dark:border-white/8">
			{#if data.article.visibility === 'unlisted'}
				<p
					class="mb-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/55 dark:text-amber-200"
				>
					<Icon name="link" class="size-3.5" />
					{t('articles.unlisted')}
				</p>
			{/if}
			<h1
				class="max-w-3xl font-serif text-3xl leading-tight font-semibold tracking-tight sm:text-5xl"
			>
				{data.article.title}
			</h1>
			{#if data.article.excerpt}
				<p class="mt-5 max-w-2xl text-lg leading-relaxed text-stone-500 dark:text-stone-400">
					{data.article.excerpt}
				</p>
			{/if}
			<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-400">
				<span>{t('articles.by', { author: data.article.authorName })}</span>
				<time datetime={new Date(data.article.publishedAt).toISOString()}>
					{t('articles.published', {
						date: dateFormat.format(new Date(data.article.publishedAt))
					})}
				</time>
			</div>

			{#if data.article.tags.length > 0 || passages.length > 0}
				<div class="mt-6 flex flex-wrap gap-1.5">
					{#each passages as passage (`${passage.startKey}:${passage.endKey}:${passage.resourceId ?? ''}`)}
						<a
							href="/{encodeURIComponent(passage.reference)}"
							class="article-chip hover:border-accent-400"
						>
							<Icon name="book-open" class="size-3" />
							{passage.reference}
						</a>
					{/each}
					{#each data.article.tags as tag (tag)}
						<span class="article-chip"><Icon name="tag" class="size-3" />{tag}</span>
					{/each}
				</div>
			{/if}
		</header>

		<BibleReferenceProse
			html={data.article.bodyHtml}
			bibleId={data.bibles[0]?.id ?? null}
			tooltipId="public-article-bible-reference-preview"
			class="article-prose prose-like px-6 py-9 sm:px-12 sm:py-12"
		/>
	</article>
</main>

<style>
	.article-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 999px;
		background: var(--surface-raised);
		padding: 0.3rem 0.62rem;
		color: var(--color-stone-500);
		font-size: 0.68rem;
	}
	:global(.article-prose) {
		max-width: 52rem;
		margin: 0 auto;
	}
	:global(.article-prose > * + *) {
		margin-top: 1em;
	}
	:global(.article-prose h1),
	:global(.article-prose h2),
	:global(.article-prose h3) {
		margin-top: 2em;
		font-weight: 700;
	}
	:global(.article-prose h1) {
		font-size: 1.8rem;
	}
	:global(.article-prose h2) {
		font-size: 1.5rem;
	}
	:global(.article-prose h3) {
		font-size: 1.2rem;
	}
	:global(.article-prose ul),
	:global(.article-prose ol) {
		padding-left: 1.6rem;
	}
	:global(.article-prose ul) {
		list-style: disc;
	}
	:global(.article-prose ol) {
		list-style: decimal;
	}
	:global(.article-prose blockquote) {
		border-left: 3px solid var(--color-accent-400);
		padding-left: 1rem;
		color: var(--color-stone-600);
		font-style: italic;
	}
	:global(.article-prose a) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	:global(.article-prose pre) {
		overflow-x: auto;
		border-radius: 0.7rem;
		background: var(--color-stone-900);
		padding: 1rem;
		color: var(--color-stone-100);
	}
	:global(.dark) .article-chip {
		border-color: color-mix(in oklab, white 10%, transparent);
	}
	:global(.dark .article-prose blockquote) {
		color: var(--color-stone-300);
	}
	:global(.dark .article-prose a) {
		color: var(--color-accent-300);
	}
</style>
