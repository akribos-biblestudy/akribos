<script lang="ts">
	import { formatReference, type VerseRef } from '$lib/bible/reference';
	import { formatNumber } from '$lib/i18n';
	import type { ReaderTabSearchResponse } from '$lib/reader/tab-search';
	import BookDistribution from './BookDistribution.svelte';
	import GlossChart from './GlossChart.svelte';
	import HighlightedVerse from './HighlightedVerse.svelte';
	import Icon from './Icon.svelte';
	import VerseText from './VerseText.svelte';

	let {
		query,
		result = null,
		loading = false,
		error = null,
		resourceTitle,
		language,
		direction,
		onClose,
		onSearch,
		onOpenReference,
		onStrongClick
	}: {
		query: string;
		result?: ReaderTabSearchResponse | null;
		loading?: boolean;
		error?: string | null;
		resourceTitle: string;
		language: string;
		direction: 'ltr' | 'rtl';
		onClose: () => void;
		onSearch: (query: string, page?: number, book?: number | null) => void;
		onOpenReference: (reference: VerseRef) => void;
		onStrongClick: (strong: string, word: string, reference: VerseRef) => void;
	} = $props();

	function referenceFor(hit: {
		book: number;
		chapter: number;
		verse?: number;
		verseStart?: number | null;
	}): VerseRef {
		return {
			book: hit.book,
			chapter: hit.chapter,
			...(hit.verse ? { verse: hit.verse } : hit.verseStart ? { verse: hit.verseStart } : {})
		};
	}

	function referenceLabel(hit: {
		book: number;
		chapter: number;
		verse?: number;
		verseStart?: number | null;
		verseEnd?: number | null;
	}): string {
		const label = formatReference(referenceFor(hit), { style: 'full' });
		return hit.verseStart && hit.verseEnd && hit.verseEnd > hit.verseStart
			? `${label}–${hit.verseEnd}`
			: label;
	}

	function openResult(event: MouseEvent | KeyboardEvent, reference: VerseRef): void {
		if ((event.target as Element).closest('button, a')) return;
		if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
		event.preventDefault();
		onOpenReference(reference);
	}
</script>

<section
	class="tab-search-results"
	aria-label="Suchergebnisse in {resourceTitle}"
	aria-live="polite"
>
	<header>
		<div class="result-heading">
			<strong>
				{#if result}{formatNumber(result.total)} Treffer{:else}Suche{/if}
			</strong>
			<span>„{query}“ in {resourceTitle}</span>
		</div>
		<button
			type="button"
			class="close-results"
			aria-label="Suchergebnisse schließen"
			onclick={onClose}
		>
			<Icon name="x" class="size-3.5" />
		</button>
	</header>

	<div class="result-scroll">
		{#if result && result.kind !== 'unsupported' && result.bookCounts.length > 0}
			<div class="search-analytics">
				<BookDistribution
					counts={result.bookCounts}
					activeBook={result.book}
					compact
					onBook={(book) => onSearch(query, 1, result.book === book ? null : book)}
				/>
				{#if result.book !== null}
					<button type="button" class="clear-filter" onclick={() => onSearch(query, 1, null)}>
						Buchfilter aufheben
					</button>
				{/if}
			</div>
		{/if}
		{#if result?.kind === 'strong' && result.glosses.length > 0}
			<section class="gloss-summary">
				<h3>Übersetzt als</h3>
				<p>
					{formatNumber(result.statistics.occurrences)} Vorkommen in
					{formatNumber(result.statistics.verseCount)} Versen
				</p>
				<GlossChart
					glosses={result.glosses}
					occurrenceTotal={result.statistics.occurrences}
					groupBelowPercent={3}
					centerLabel
				/>
			</section>
		{/if}
		{#if loading && !result}
			<p class="status">Suche läuft …</p>
		{:else if error}
			<p class="status error">{error}</p>
		{:else if result?.kind === 'unsupported'}
			<p class="status">
				Dieses Werk enthält keine durchsuchbaren Textinhalte. Bibelstellen kannst du weiterhin
				direkt im Feld eingeben.
			</p>
		{:else if result && result.total === 0}
			<p class="status">Keine Treffer für „{query}“.</p>
			{#if 'suggestion' in result && result.suggestion}
				<button
					type="button"
					class="suggestion"
					onclick={() => onSearch(result.suggestion ?? '', 1)}
				>
					Meintest du „{result.suggestion}“?
				</button>
			{/if}
		{:else if result?.kind === 'scripture'}
			<ol>
				{#each result.hits as hit (`${hit.book}:${hit.chapter}:${hit.verse}`)}
					<li>
						<div
							class="result-card"
							role="link"
							tabindex="0"
							onclick={(event) => openResult(event, referenceFor(hit))}
							onkeydown={(event) => openResult(event, referenceFor(hit))}
						>
							<strong>{referenceLabel(hit)}</strong>
							<span class="result-text" lang={language} dir={direction}>
								<HighlightedVerse segments={hit.segments} needles={result.needles} />
							</span>
						</div>
					</li>
				{/each}
			</ol>
		{:else if result?.kind === 'strong'}
			<ol>
				{#each result.hits as hit (`${hit.book}:${hit.chapter}:${hit.verse}`)}
					<li>
						<div
							class="result-card strong-result"
							role="link"
							tabindex="0"
							onclick={(event) => openResult(event, referenceFor(hit))}
							onkeydown={(event) => openResult(event, referenceFor(hit))}
						>
							<strong>{referenceLabel(hit)}</strong>
							<p class="result-text" lang={language} dir={direction}>
								<VerseText
									segments={hit.segments}
									activeStrong={result.strong}
									onStrongClick={(strong, word) => onStrongClick(strong, word, referenceFor(hit))}
								/>
							</p>
						</div>
					</li>
				{/each}
			</ol>
		{:else if result?.kind === 'commentary'}
			<ol>
				{#each result.hits as hit (hit.id)}
					<li>
						<div
							class="result-card commentary-result"
							role="link"
							tabindex="0"
							onclick={(event) => openResult(event, referenceFor(hit))}
							onkeydown={(event) => openResult(event, referenceFor(hit))}
						>
							<strong>{referenceLabel(hit)}</strong>
							{#if hit.title}<h3>{hit.title}</h3>{/if}
							<!-- Commentary HTML is sanitized by every importer before it reaches the database. -->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<div class="commentary-body">{@html hit.bodyHtml}</div>
						</div>
					</li>
				{/each}
			</ol>
		{/if}

		{#if result && result.pageCount > 1}
			<nav aria-label="Suchergebnisseiten">
				<button
					type="button"
					aria-label="Vorherige Ergebnisseite"
					disabled={loading || result.page <= 1}
					onclick={() => onSearch(query, result.page - 1)}
					><Icon name="chevron-left" class="mx-auto size-4" /></button
				>
				<span>{result.page} / {result.pageCount}</span>
				<button
					type="button"
					aria-label="Nächste Ergebnisseite"
					disabled={loading || result.page >= result.pageCount}
					onclick={() => onSearch(query, result.page + 1)}
					><Icon name="chevron-right" class="mx-auto size-4" /></button
				>
			</nav>
		{/if}
	</div>

	{#if loading && result}<div
			class="updating"
			aria-label="Suchergebnisse werden geladen"
		></div>{/if}
</section>

<style>
	.tab-search-results {
		position: absolute;
		z-index: 4;
		inset: 0;
		display: flex;
		min-height: 0;
		flex-direction: column;
		background: var(--surface);
	}
	header {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid var(--line);
	}
	.result-heading {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}
	.result-heading strong {
		font-size: 0.78rem;
	}
	.result-heading span {
		overflow: hidden;
		margin-top: 0.08rem;
		color: var(--color-stone-500);
		font-size: 0.67rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.close-results {
		display: inline-flex;
		width: 1.7rem;
		height: 1.7rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 0.35rem;
		color: var(--color-stone-400);
	}
	.close-results:hover {
		background: var(--color-stone-100);
		color: var(--color-stone-700);
	}
	.result-scroll {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		padding: 0.65rem;
	}
	.search-analytics,
	.gloss-summary {
		margin-bottom: 0.8rem;
		padding: 0.65rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
	}
	.clear-filter {
		margin-top: 0.15rem;
		color: var(--color-accent-700);
		font-size: 0.7rem;
	}
	.gloss-summary h3 {
		color: var(--color-stone-600);
		font-size: 0.72rem;
		font-weight: 700;
	}
	.gloss-summary > p {
		margin-top: 0.08rem;
		color: var(--color-stone-500);
		font-size: 0.67rem;
	}
	.gloss-summary :global(.canvas-wrap) {
		height: min(15rem, 42vh);
	}
	ol {
		display: grid;
		gap: 0.55rem;
		list-style: none;
	}
	.result-card {
		display: block;
		width: 100%;
		padding: 0.65rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--surface-raised) 75%, transparent);
		font-family: var(--reader-font-family, ui-serif, Georgia, serif);
		font-size: var(--reader-text-size, 1.08rem);
		line-height: 1.55;
		text-align: left;
		cursor: pointer;
	}
	.result-card:hover,
	.result-card:focus-visible {
		border-color: var(--color-accent-400);
		background: var(--color-accent-50);
		outline: none;
	}
	.result-card > strong {
		display: block;
		color: var(--color-accent-700);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.67em;
		font-weight: 700;
	}
	.result-text,
	.commentary-body {
		display: block;
		margin-top: 0.35rem;
		font: inherit;
	}
	.commentary-result h3 {
		margin-top: 0.35rem;
		font-size: 0.76rem;
		font-weight: 700;
	}
	.status {
		padding: 1.25rem 0.65rem;
		color: var(--color-stone-500);
		font-size: 0.78rem;
		line-height: 1.5;
		text-align: center;
	}
	.status.error {
		color: var(--color-red-700);
	}
	.suggestion {
		display: block;
		margin: -0.65rem auto 0;
		color: var(--color-accent-700);
		font-size: 0.75rem;
	}
	nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		padding: 0.8rem 0 0.2rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}
	nav button {
		width: 2rem;
		height: 1.75rem;
		border: 1px solid var(--line);
		border-radius: 0.35rem;
	}
	nav button:disabled {
		opacity: 0.35;
	}
	.updating {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		height: 2px;
		background: var(--color-accent-500);
		animation: pulse 800ms ease-in-out infinite alternate;
	}
	:global(.dark) .result-card:hover,
	:global(.dark) .result-card:focus-visible {
		background: var(--color-stone-900);
	}
	:global(.dark) .close-results:hover {
		background: var(--color-stone-800);
		color: var(--color-stone-100);
	}
	@keyframes pulse {
		from {
			opacity: 0.3;
		}
		to {
			opacity: 1;
		}
	}
</style>
