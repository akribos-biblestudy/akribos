<script lang="ts">
	import { formatReference, referencePath } from '$lib/bible/reference';
	import { t } from '$lib/i18n';
	import VerseText from '$lib/components/VerseText.svelte';
	import Button from '$lib/components/Button.svelte';

	let { data } = $props();
	const styleName = $derived(data.style.name ?? t('highlights.unnamed'));
</script>

<svelte:head
	><title>{t('highlights.versesTitle', { name: styleName })} — Akribos</title></svelte:head
>

<main class="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
	<nav class="text-sm">
		<Button href="/account?tab=appearance" size="sm" variant="secondary">
			← {t('highlights.back')}
		</Button>
	</nav>

	<header>
		<div class="flex items-center gap-3">
			<span
				class="size-7 shrink-0 rounded-full border border-stone-300 dark:border-stone-600"
				style="background-color: {data.style.color}"
				aria-hidden="true"
			></span>
			<h1 class="text-2xl font-semibold tracking-tight">
				{t('highlights.versesTitle', { name: styleName })}
			</h1>
		</div>
		{#if data.resource}
			<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">{data.resource.tabTitle}</p>
		{/if}
	</header>

	{#if data.verses.length === 0}
		<p class="rounded-xl bg-stone-50 p-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
			{t('highlights.versesEmpty')}
		</p>
	{:else}
		<ol class="space-y-3">
			{#each data.verses as item (item.id)}
				<li
					class="rounded-lg border border-stone-200 p-4 dark:border-stone-800"
					style="border-left: 0.35rem solid {data.style.color}"
				>
					<a
						class="text-sm font-semibold text-accent-600 hover:underline dark:text-accent-400"
						href={referencePath({ book: item.book, chapter: item.chapter, verse: item.verse })}
					>
						{formatReference(
							{ book: item.book, chapter: item.chapter, verse: item.verse },
							{ style: 'full' }
						)}
					</a>
					{#if item.segments}
						<p class="scripture-sized mt-1 font-serif leading-relaxed">
							<VerseText segments={item.segments} />
						</p>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</main>
