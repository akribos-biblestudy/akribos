<script lang="ts">
	import type { StrongEntry } from '$lib/server/repositories/strong';
	import { lexiconText } from '$lib/bible/lexicon';
	import { t } from '$lib/i18n';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { linkBibleReferences, rewriteBibleReferenceLinks } from '$lib/bible/link-references';

	let { entry, bibleId = null }: { entry: StrongEntry; bibleId?: string | null } = $props();
	const text = $derived(lexiconText(entry, 'de'));
</script>

{#snippet fields(value: ReturnType<typeof lexiconText>, language?: string)}
	<div class="fields" lang={language} use:verseHoverPopover={{ bibleId }}>
		{#each [{ title: t('strong.definition'), html: value.definitionHtml }, { title: t('strong.derivation'), html: value.derivationHtml }, { title: t(language === 'de' ? 'strong.kjvRenderingsGerman' : 'strong.kjvRenderings'), html: value.kjvDefinitionHtml }] as field (field.title)}
			{#if field.html}
				<section>
					<h3>{field.title}</h3>
					<!-- Both editions pass through the same escaping XML parser before persistence. -->
					<div class="lexicon-body">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html linkBibleReferences(rewriteBibleReferenceLinks(field.html))}
					</div>
				</section>
			{/if}
		{/each}
	</div>
{/snippet}

<div class="lexicon-definition" data-bible-id={bibleId ?? undefined}>
	{#if entry.germanTranslation?.machineTranslated}
		<p class="translation-note">{t('strong.machineTranslation')}</p>
	{/if}
	{@render fields(text, entry.germanTranslation ? 'de' : undefined)}
	{#if entry.germanTranslation}
		<details class="original-edition">
			<summary>{t('strong.englishOriginal')}</summary>
			{@render fields(entry, 'en')}
		</details>
	{/if}
</div>

<style>
	.lexicon-definition,
	.fields {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}
	h3 {
		margin: 0 0 0.35rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-stone-500);
	}
	.lexicon-body {
		font-size: var(--reader-prose-size);
		font-family: var(--font-serif);
		line-height: var(--reader-line-height);
		overflow-wrap: anywhere;
	}
	.lexicon-body :global(a) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	.lexicon-body :global(.original) {
		font-family: 'Akribos Text', 'Noto Sans Hebrew', serif;
	}
	.translation-note {
		margin: 0;
		color: var(--color-stone-500);
		font-size: 0.75rem;
	}
	.original-edition {
		border-top: 1px solid var(--line);
		padding-top: 0.75rem;
	}
	summary {
		cursor: pointer;
		color: var(--color-accent-700);
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.original-edition[open] summary {
		margin-bottom: 1rem;
	}
</style>
