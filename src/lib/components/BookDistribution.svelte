<script lang="ts">
	import { bookShortName } from '$lib/bible/book-names';
	import { formatNumber, t } from '$lib/i18n';

	let {
		counts,
		label = t('statistics.byBook'),
		hrefForBook,
		onBook,
		activeBook = null,
		compact = false
	}: {
		counts: { book: number; count: number }[];
		label?: string;
		hrefForBook?: (book: number) => string;
		onBook?: (book: number) => void;
		activeBook?: number | null;
		compact?: boolean;
	} = $props();

	// Zero-count books stay in the chart — the server already scopes `counts` to whichever books are
	// relevant (a Strong's number's own testament, or the whole canon for a text search), so an empty
	// bar here means "no hits in this book", not "not applicable".
	const oldTestament = $derived(counts.filter((entry) => entry.book <= 39));
	const newTestament = $derived(counts.filter((entry) => entry.book >= 40));
	const testaments = $derived([
		{ label: t('search.help.oldTestament'), entries: oldTestament },
		{ label: t('search.help.newTestament'), entries: newTestament }
	]);

	function maxCount(entries: { count: number }[]): number {
		return entries.reduce((maximum, entry) => Math.max(maximum, entry.count), 1);
	}

	function hasOccurrences(entries: { count: number }[]): boolean {
		return entries.some((entry) => entry.count > 0);
	}

	function occurrenceTotal(entries: { count: number }[]): number {
		return entries.reduce((sum, entry) => sum + entry.count, 0);
	}

	function bookTooltip(entry: { book: number; count: number }): string {
		const occurrenceLabel = `${formatNumber(entry.count)} ${t('strong.occurrences')}`;
		return hrefForBook || onBook
			? `${bookShortName(entry.book)}: ${occurrenceLabel}. ${t('statistics.filterBook', {
					book: bookShortName(entry.book)
				})}`
			: `${bookShortName(entry.book)}: ${occurrenceLabel}`;
	}
</script>

{#if counts.length > 0}
	<figure class="book-distribution" aria-label={label}>
		<figcaption class="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase">
			{label}
		</figcaption>

		{#each testaments as testament (testament.label)}
			{#if testament.entries.length > 0}
				<div class="testament-summary">
					<span>{testament.label}</span>
					<strong
						>{formatNumber(occurrenceTotal(testament.entries))} {t('strong.occurrences')}</strong
					>
				</div>
				{#if !compact || hasOccurrences(testament.entries)}
					<div
						class:compact
						class="books"
						style="--book-count: {testament.entries.length}"
						aria-label={testament.label}
					>
						{#each testament.entries as entry (entry.book)}
							<svelte:element
								this={onBook ? 'button' : hrefForBook ? 'a' : 'div'}
								href={hrefForBook?.(entry.book)}
								type={onBook ? 'button' : undefined}
								role={onBook ? 'button' : undefined}
								onclick={onBook ? () => onBook(entry.book) : undefined}
								class="book"
								class:active={activeBook === entry.book}
								title={bookTooltip(entry)}
								aria-label={bookTooltip(entry)}
								aria-current={!onBook && activeBook === entry.book ? 'true' : undefined}
								aria-pressed={onBook ? activeBook === entry.book : undefined}
							>
								{#if !compact}<span class="count">{formatNumber(entry.count)}</span>{/if}
								<span
									class="bar"
									style="--height: {Math.max(
										5,
										(entry.count / maxCount(testament.entries)) * 100
									)}%;
								       --hue: {entry.book <= 39
										? 42 - (entry.book / 39) * 28
										: 105 + ((entry.book - 40) / 26) * 105}"
								></span>
								<span class="name">{bookShortName(entry.book)}</span>
							</svelte:element>
						{/each}
					</div>
				{/if}
			{/if}
		{/each}
	</figure>
{/if}

<style>
	.book-distribution {
		overflow-x: visible;
	}

	.books {
		display: grid;
		grid-template-columns: repeat(var(--book-count), minmax(1.4rem, 1fr));
		align-items: end;
		width: 100%;
		height: 7.5rem;
		margin-bottom: 0.75rem;
		overflow-x: hidden;
		border-bottom: 2px solid var(--color-stone-200);
	}

	:global(.dark) .books {
		border-color: var(--color-stone-700);
	}

	.book {
		display: grid;
		grid-template-rows: 1rem 4.5rem 1.5rem;
		align-items: end;
		min-width: 1.4rem;
		height: 100%;
		text-align: center;
		text-decoration: none;
		border-radius: 0.2rem 0.2rem 0 0;
		outline-offset: 1px;
	}

	a.book,
	button.book {
		cursor: pointer;
	}

	a.book:hover .bar,
	a.book:focus-visible .bar,
	button.book:hover .bar,
	button.book:focus-visible .bar,
	.book.active .bar {
		opacity: 1;
		box-shadow: 0 0 0 2px var(--color-accent-600);
	}

	.count {
		align-self: center;
		font-size: 0.65rem;
		color: var(--color-stone-500);
	}

	.bar {
		justify-self: stretch;
		height: var(--height);
		margin: 0 0.12rem;
		border-radius: 0.2rem 0.2rem 0 0;
		background: hsl(var(--hue) 34% 56%);
		opacity: 0.9;
		transition:
			opacity 120ms ease,
			box-shadow 120ms ease;
	}

	.name {
		align-self: center;
		padding: 0 0.1rem;
		font-size: 0.62rem;
		white-space: nowrap;
		color: var(--color-stone-600);
	}

	:global(.dark) .count,
	:global(.dark) .name {
		color: var(--color-stone-300);
	}

	.books.compact {
		grid-template-columns: repeat(var(--book-count), minmax(0, 1fr));
		align-items: end;
		min-width: 0;
		height: 4.7rem;
		margin-bottom: 0.4rem;
		gap: 0;
		overflow: visible;
		border-bottom: 2px solid var(--color-stone-200);
	}

	.books.compact .book {
		min-width: 0;
		height: 100%;
		grid-template-rows: 2.1rem 2.5rem;
	}

	.books.compact .name {
		justify-self: center;
		align-self: center;
		padding: 0;
		font-size: 0.58rem;
		line-height: 1;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}

	.testament-summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 0 0.15rem;
		font-size: 0.68rem;
		color: var(--color-stone-500);
	}

	.testament-summary strong {
		font-weight: 600;
	}

	:global(.dark) .testament-summary {
		color: var(--color-stone-400);
	}

	@media (max-width: 639px) {
		.books {
			min-width: max(100%, calc(var(--book-count) * 2rem));
			height: 6.5rem;
		}

		.book {
			grid-template-rows: 1rem 3.75rem 1.5rem;
			min-width: 2rem;
		}

		.count,
		.name {
			font-size: 0.7rem;
		}

		.books.compact {
			min-width: 0;
		}
	}
</style>
