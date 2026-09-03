<script lang="ts">
	import type { StrongEntry } from '$lib/server/repositories/strong';

	let {
		lookup,
		entry,
		resourceTitle,
		onLookup
	}: {
		lookup: string | null;
		entry: StrongEntry | null;
		resourceTitle: string;
		onLookup: (lookup: string) => void;
	} = $props();
</script>

<section class="lexicon-tab" aria-label="Lexikoneintrag in {resourceTitle}" aria-live="polite">
	{#if !lookup}
		<p class="status">Gib oben eine Strong-Nummer oder ein Stichwort ein.</p>
	{:else if !entry}
		<p class="status">Kein Eintrag für „{lookup}“ in {resourceTitle}.</p>
	{:else}
		<article>
			<header>
				<div>
					<strong>{entry.strong}</strong>
					<h2
						lang={entry.language}
						dir={entry.language === 'hbo' ? 'rtl' : 'ltr'}
						style="font-family: var({entry.language === 'hbo' ? '--font-hebrew' : '--font-greek'})"
					>
						{entry.lemma}
					</h2>
				</div>
				{#if entry.transliteration || entry.pronunciation}
					<p class="pronunciation">
						{#if entry.transliteration}<span>{entry.transliteration}</span>{/if}
						{#if entry.transliteration && entry.pronunciation}<span> · </span>{/if}
						{#if entry.pronunciation}<span>[{entry.pronunciation}]</span>{/if}
					</p>
				{/if}
			</header>

			{#if entry.definitionHtml}
				<section>
					<h3>Definition</h3>
					<!-- Lexicon imports sanitize their supported source format before persistence. -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="lexicon-body">{@html entry.definitionHtml}</div>
				</section>
			{/if}
			{#if entry.derivationHtml}
				<section>
					<h3>Herkunft</h3>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="lexicon-body">{@html entry.derivationHtml}</div>
				</section>
			{/if}
			{#if entry.kjvDefinitionHtml}
				<section>
					<h3>King-James-Wiedergaben</h3>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="lexicon-body">{@html entry.kjvDefinitionHtml}</div>
				</section>
			{/if}
			{#if entry.seeAlso.length > 0}
				<section>
					<h3>Siehe auch</h3>
					<div class="see-also">
						{#each entry.seeAlso as strong (strong)}
							<button type="button" onclick={() => onLookup(strong)}>{strong}</button>
						{/each}
					</div>
				</section>
			{/if}
		</article>
	{/if}
</section>

<style>
	.lexicon-tab {
		position: absolute;
		z-index: 4;
		inset: 0;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		scrollbar-width: thin;
		background: var(--surface);
	}
	article {
		max-width: 46rem;
		padding: 1rem clamp(0.85rem, 3vw, 1.5rem) 4rem;
		font-size: calc(0.95rem * var(--reader-font-scale));
		line-height: 1.6;
	}
	header {
		padding-bottom: 0.85rem;
		border-bottom: 1px solid var(--line);
	}
	header strong {
		color: var(--color-accent-700);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.72em;
		letter-spacing: 0.07em;
	}
	h2 {
		margin-top: 0.08rem;
		font-size: 1.75em;
		font-weight: 500;
		line-height: 1.25;
	}
	.pronunciation {
		margin-top: 0.2rem;
		color: var(--color-stone-500);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.75em;
	}
	article > section {
		margin-top: 1rem;
	}
	h3 {
		margin-bottom: 0.25rem;
		color: var(--color-stone-500);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.68em;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.lexicon-body {
		font-family: var(--reader-font-family, ui-serif, Georgia, serif);
	}
	.see-also {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.see-also button {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--color-accent-700);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.75em;
	}
	.status {
		padding: 2rem 1rem;
		color: var(--color-stone-500);
		font-size: calc(0.85rem * var(--reader-font-scale));
		line-height: 1.5;
		text-align: center;
	}
</style>
