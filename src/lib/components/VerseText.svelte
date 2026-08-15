<script lang="ts">
	import type { VerseSegment } from '$lib/bible/segments';
	// Imported for the recursive case (words of Jesus can contain tagged words). Svelte 5 prefers a
	// self-import over <svelte:self>.
	import VerseText from './VerseText.svelte';
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
		hoverStrong = null
	}: {
		segments: VerseSegment[];
		/** Called when a tagged word is activated; the reader opens the study sidebar. */
		onStrongClick?: (strong: string, word: string) => void;
		/**
		 * Called with a Strong's number while the mouse hovers a tagged word, and with `null` once it
		 * leaves. Only real mouse hovers are reported (see `isMouseHover` below), so a tap on touch
		 * devices never leaves a highlight stuck on until something else is tapped.
		 */
		onStrongHover?: (strong: string | null) => void;
		/** Highlights every occurrence of the Strong's number currently shown in the sidebar. */
		activeStrong?: string | null;
		/** Highlights every occurrence of the Strong's number currently hovered, same as `activeStrong`. */
		hoverStrong?: string | null;
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
</script>

{#each renderParts as part, index (index)}
	{@const segment = part.segment}
	{#if typeof segment === 'string'}
		{segment}
	{:else if segment.kind === 'br'}
		<br />
	{:else}
		<span class:keep-punctuation={segment.kind === 'w' || segment.kind === 'em'}
			>{#if segment.kind === 'w'}<button
					type="button"
					class="strong"
					class:active={matchesStrong(segment, activeStrong) || matchesStrong(segment, hoverStrong)}
					data-strong={segment.strong}
					title={segment.morph ?? undefined}
					onclick={() => onStrongClick?.(segment.strong, segment.text)}
					onpointerenter={(event) => {
						if (isMouseHover(event)) onStrongHover?.(segment.strong);
					}}
					onpointerleave={(event) => {
						if (isMouseHover(event)) onStrongHover?.(null);
					}}>{segment.text}</button
				>{:else if segment.kind === 'em'}<em>{segment.text}</em
				>{:else if segment.kind === 'note'}<Footnote
					marker={segment.marker}
					text={segment.text}
				/>{:else if segment.kind === 'wj'}<span class="words-of-jesus"
					><VerseText
						segments={segment.children as VerseSegment[]}
						{onStrongClick}
						{onStrongHover}
						{activeStrong}
						{hoverStrong}
					/></span
				>{/if}{part.suffix}</span
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
</style>
