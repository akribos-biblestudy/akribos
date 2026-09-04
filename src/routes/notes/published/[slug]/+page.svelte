<script lang="ts">
	import { formatPassage, passageFromDbEndpoints } from '$lib/bible/passage';
	import BibleReferenceProse from '$lib/components/documents/BibleReferenceProse.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { t } from '$lib/i18n';

	let { data } = $props();
	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });
	const passages = $derived.by(() =>
		data.publication.passages.flatMap((row) => {
			const passage = passageFromDbEndpoints(row);
			const reference = passage ? formatPassage(passage) : null;
			return reference ? [{ ...row, reference }] : [];
		})
	);
</script>

<svelte:head>
	<meta name="description" content={data.publication.excerpt} />
	{#if data.publication.visibility === 'unlisted'}
		<meta name="robots" content="noindex, nofollow" />
	{/if}
	<meta property="og:type" content="article" />
	<meta property="og:title" content={data.publication.title} />
	<meta property="og:description" content={data.publication.excerpt} />
</svelte:head>

<main class="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6 sm:py-12" data-testid="published-note">
	<a
		href="/notes/published"
		class="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
	>
		<Icon name="chevron-left" class="size-4" />
		{t('publishedNotes.title')}
	</a>

	<article
		class="mt-8 overflow-hidden rounded-3xl border border-stone-200/80 bg-[color:var(--surface)] shadow-[var(--shadow-soft)] dark:border-white/8"
	>
		<header class="border-b border-stone-200/80 px-6 py-8 sm:px-12 sm:py-12 dark:border-white/8">
			{#if data.publication.visibility === 'unlisted'}
				<p
					class="mb-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/55 dark:text-amber-200"
				>
					<Icon name="link" class="size-3.5" />
					{t('publishedNotes.unlisted')}
				</p>
			{/if}
			<h1
				class="max-w-3xl font-serif text-3xl leading-tight font-semibold tracking-tight sm:text-5xl"
			>
				{data.publication.title}
			</h1>
			{#if data.publication.excerpt}
				<p class="mt-5 max-w-2xl text-lg leading-relaxed text-stone-500 dark:text-stone-400">
					{data.publication.excerpt}
				</p>
			{/if}
			<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-400">
				<span>{t('publishedNotes.by', { author: data.publication.authorName })}</span>
				<time datetime={new Date(data.publication.publishedAt).toISOString()}>
					{t('publishedNotes.published', {
						date: dateFormat.format(new Date(data.publication.publishedAt))
					})}
				</time>
			</div>

			{#if data.publication.tags.length > 0 || passages.length > 0}
				<div class="mt-6 flex flex-wrap gap-1.5">
					{#each passages as passage (`${passage.startKey}:${passage.endKey}:${passage.resourceId ?? ''}`)}
						<a
							href="/{encodeURIComponent(passage.reference)}"
							class="publication-chip hover:border-accent-400"
						>
							<Icon name="book-open" class="size-3" />
							{passage.reference}
						</a>
					{/each}
					{#each data.publication.tags as tag (tag)}
						<span class="publication-chip"><Icon name="tag" class="size-3" />{tag}</span>
					{/each}
				</div>
			{/if}
		</header>

		<BibleReferenceProse
			html={data.publication.bodyHtml}
			bibleId={data.bibles[0]?.id ?? null}
			tooltipId="published-note-bible-reference-preview"
			class="publication-prose prose-like px-6 py-9 sm:px-12 sm:py-12"
		/>
	</article>
</main>

<style>
	.publication-chip {
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
	:global(.publication-prose) {
		max-width: 52rem;
		margin: 0 auto;
	}
	:global(.publication-prose > * + *) {
		margin-top: 1em;
	}
	:global(.publication-prose h1),
	:global(.publication-prose h2),
	:global(.publication-prose h3) {
		margin-top: 2em;
		font-weight: 700;
	}
	:global(.publication-prose h1) {
		font-size: 1.8rem;
	}
	:global(.publication-prose h2) {
		font-size: 1.5rem;
	}
	:global(.publication-prose h3) {
		font-size: 1.2rem;
	}
	:global(.publication-prose ul),
	:global(.publication-prose ol) {
		padding-left: 1.6rem;
	}
	:global(.publication-prose ul) {
		list-style: disc;
	}
	:global(.publication-prose ol) {
		list-style: decimal;
	}
	:global(.publication-prose blockquote) {
		border-left: 3px solid var(--color-accent-400);
		padding-left: 1rem;
		color: var(--color-stone-600);
		font-style: italic;
	}
	:global(.publication-prose a) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	:global(.publication-prose pre) {
		overflow-x: auto;
		border-radius: 0.7rem;
		background: var(--color-stone-900);
		padding: 1rem;
		color: var(--color-stone-100);
	}
	:global(.dark) .publication-chip {
		border-color: color-mix(in oklab, white 10%, transparent);
	}
	:global(.dark .publication-prose blockquote) {
		color: var(--color-stone-300);
	}
	:global(.dark .publication-prose a) {
		color: var(--color-accent-300);
	}
</style>
