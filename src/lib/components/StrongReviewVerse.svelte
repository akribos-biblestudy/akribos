<script lang="ts">
	import type { VerseSegment } from '$lib/bible/segments';
	import { reviewVerseChunks } from '$lib/strong-review/verse-context';

	let {
		segments,
		wordPosition,
		strong,
		onSelect,
		selected = false
	}: {
		segments: VerseSegment[];
		wordPosition: number;
		strong: string;
		onSelect: () => void;
		selected?: boolean;
	} = $props();
	const chunks = $derived(reviewVerseChunks(segments, wordPosition));
</script>

<span class="verse-context">
	{#each chunks as chunk, index (index)}
		{#if chunk.target}
			<button
				type="button"
				class="review-word"
				class:selected
				aria-label="Lexikoneintrag für {chunk.text.trim()} ({strong}) öffnen"
				aria-pressed={selected}
				onclick={onSelect}>{chunk.text}</button
			>
		{:else}{chunk.text}{/if}
	{/each}
</span>

<style>
	.verse-context {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.review-word {
		border-radius: 0.2rem;
		background: color-mix(in oklab, var(--color-accent-500) 20%, transparent);
		color: inherit;
		font-weight: 700;
		text-decoration: underline;
		text-decoration-color: var(--color-accent-700);
		text-underline-offset: 0.15em;
	}
	.review-word.selected {
		background: color-mix(in oklab, var(--color-accent-500) 35%, transparent);
	}
	.review-word:focus-visible {
		outline: 2px solid var(--color-accent-700);
		outline-offset: 2px;
	}
</style>
