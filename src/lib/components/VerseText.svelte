<script lang="ts">
	import {
		highlightSegment,
		initHighlightCursor,
		type DisplayChunk,
		type HighlightRange,
		type VerseSegment
	} from '$lib/bible/segments';
	import Footnote from './Footnote.svelte';

	/**
	 * Renders a verse from its stored segments.
	 *
	 * Structure comes from the database, so there is no HTML parsing, no `{@html}` and no way for
	 * imported text to inject markup — the reason verse content is stored as segments rather than as
	 * the HTML soup the previous version rebuilt on every request.
	 */
	let {
		segments,
		onStrongClick,
		onStrongHover,
		activeStrong = null,
		hoverStrong = null,
		highlights = [],
		wordOffset = 0
	}: {
		segments: VerseSegment[];
		/** Called when a tagged word is activated; the reader opens its linked lexicon tab. */
		onStrongClick?: (strong: string, word: string) => void;
		/**
		 * Called with a Strong's number while the mouse hovers a tagged word, and with `null` once it
		 * leaves. Only real mouse hovers are reported (see `isMouseHover` below), so a tap on touch
		 * devices never leaves a highlight stuck on until something else is tapped.
		 */
		onStrongHover?: (strong: string | null) => void;
		/** Highlights a selected Strong's number, e.g. inside a result or occurrence list. */
		activeStrong?: string | null;
		/** Highlights every occurrence of the Strong's number currently hovered, same as `activeStrong`. */
		hoverStrong?: string | null;
		/** Translation-specific highlighted word ranges to paint within `segments`, if any. */
		highlights?: HighlightRange[];
		/** Global word index of `segments[0]`, so a verse split into a lead and a remainder (see
		 *  `splitVerseLead`) keeps `highlights` ranges aligned across both calls. */
		wordOffset?: number;
	} = $props();

	/**
	 * Pointer events (not `mouseenter`/`mouseleave`) carry `pointerType`, which is what lets a tap on
	 * touch devices be told apart from an actual mouse hover. Without this check a tap would set the
	 * hover highlight and nothing would ever clear it, since there is no "leave" for a tap.
	 */
	function isMouseHover(event: PointerEvent) {
		return event.pointerType === 'mouse';
	}

	function matchesStrong(segment: Extract<VerseSegment, { kind: 'w' }>, strong: string | null) {
		return (
			strong !== null && (segment.strong === strong || (segment.strongs?.includes(strong) ?? false))
		);
	}

	type RenderPart = { segment: VerseSegment; suffix: string };

	function keepClosingPunctuation(list: VerseSegment[]): RenderPart[] {
		const parts: RenderPart[] = [];
		for (const original of list) {
			let segment = original;
			const previous = parts.at(-1);
			if (
				typeof segment === 'string' &&
				previous &&
				typeof previous.segment !== 'string' &&
				previous.segment.kind !== 'br'
			) {
				const punctuation = /^[,.;:!?…)\]}»”’]+/.exec(segment);
				if (punctuation) {
					previous.suffix += punctuation[0];
					segment = segment.slice(punctuation[0].length);
				}
			}
			if (segment !== '') parts.push({ segment, suffix: '' });
		}
		return parts;
	}

	const renderParts = $derived(keepClosingPunctuation(segments));

	/**
	 * Per part: its own chunks, plus the (rare) glued-punctuation suffix's own chunks. Threaded
	 * through one shared cursor, in the same order the parts render, so word indices line up exactly
	 * as they would if `highlights` were applied to the original, unsplit `segments`.
	 */
	const displayParts = $derived.by(() => {
		const cursor = initHighlightCursor(wordOffset);
		return renderParts.map((part) => ({
			main: highlightSegment(part.segment, highlights, cursor),
			suffix: part.suffix ? highlightSegment(part.suffix, highlights, cursor) : []
		}));
	});
</script>

{#snippet chunk(item: DisplayChunk)}
	{#if item.kind === 'text'}
		{#if item.color}<span class="partial-highlight" style:background-color={item.color}
				>{item.text}</span
			>{:else}{item.text}{/if}
	{:else if item.kind === 'br'}
		<br />
	{:else if item.kind === 'w'}
		<button
			type="button"
			class="strong"
			class:active={matchesStrong(item.segment, activeStrong) ||
				matchesStrong(item.segment, hoverStrong)}
			class:has-highlight={item.color}
			data-strong={item.segment.strong}
			title={item.segment.morph ?? undefined}
			style:background-color={item.color}
			onclick={() => onStrongClick?.(item.segment.strong, item.segment.text)}
			onpointerenter={(event) => {
				if (isMouseHover(event)) onStrongHover?.(item.segment.strong);
			}}
			onpointerleave={(event) => {
				if (isMouseHover(event)) onStrongHover?.(null);
			}}>{item.segment.text}</button
		>
	{:else if item.kind === 'em'}
		<em class:has-highlight={item.color} style:background-color={item.color}>{item.text}</em>
	{:else if item.kind === 'note'}
		<Footnote marker={item.segment.marker} text={item.segment.text} />
	{:else if item.kind === 'wj'}
		<span class="words-of-jesus"
			>{#each item.children as child, index (index)}{@render chunk(child)}{/each}</span
		>
	{/if}
{/snippet}

{#each renderParts as part, index (index)}
	{@const segment = part.segment}
	{@const display = displayParts[index]!}
	{#if typeof segment === 'string'}
		{#each display.main as item, itemIndex (itemIndex)}{@render chunk(item)}{/each}
	{:else if segment.kind === 'br'}
		<br />
	{:else}
		<span class:keep-punctuation={segment.kind === 'w' || segment.kind === 'em'}
			>{#each display.main as item, itemIndex (itemIndex)}{@render chunk(
					item
				)}{/each}{#each display.suffix as item, itemIndex (itemIndex)}{@render chunk(
					item
				)}{/each}</span
		>
	{/if}
{/each}

<style>
	.keep-punctuation {
		white-space: nowrap;
	}

	/* Tagged words are darker and get an underline on hover, the affordance the old site used too. */
	.strong {
		display: inline;
		padding: 0;
		border: 0;
		border-radius: 0.2rem;
		background: none;
		font: inherit;
		color: inherit;
		text-align: inherit;
		cursor: pointer;
		text-decoration-line: underline;
		text-decoration-style: dotted;
		text-decoration-color: color-mix(in oklab, currentColor 30%, transparent);
		text-underline-offset: 0.2em;
	}

	.strong:hover,
	.strong:focus-visible {
		text-decoration-style: solid;
		text-decoration-color: var(--color-accent-500);
	}

	.strong.active {
		background-color: color-mix(in oklab, var(--color-accent-500) 22%, transparent);
		border-radius: 0.2rem;
	}

	.words-of-jesus {
		color: oklch(0.5 0.17 25);
	}

	:global(.dark) .words-of-jesus {
		color: oklch(0.72 0.15 25);
	}

	/* A translation-specific highlight, painted directly on the run of text it covers rather than the
	   whole `.flow-verse`, which is what a whole-verse highlight still uses. The highlighter palette is
	   made of light pastel backgrounds, so the text on top must stay dark ink in both themes — it must
	   not follow the dark-mode body text color, which would turn light-on-light and unreadable. */
	.partial-highlight,
	.strong.has-highlight,
	em.has-highlight {
		/* Rounded whitespace-only spans pinch into narrow pills between words; square adjacent runs keep
		   one continuous, level highlighter stroke across the complete selected phrase. */
		border-radius: 0;
		color: oklch(0.28 0.02 90);
	}
</style>
