<script lang="ts">
	import { bookShortName } from '$lib/bible/book-names';
	import { formatReference, type VerseRef } from '$lib/bible/reference';
	import type { VerseSegment } from '$lib/bible/segments';
	import { readerContentLinks } from '$lib/actions/reader-content-links';
	import { formatNumber } from '$lib/i18n';
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import type { StrongEntry } from '$lib/server/repositories/strong';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import BookDistribution from './BookDistribution.svelte';
	import GlossChart from './GlossChart.svelte';
	import Icon from './Icon.svelte';
	import MorphologyList from './MorphologyList.svelte';
	import VerseText from './VerseText.svelte';

	type StudyPayload = {
		strong: string;
		statistics: { occurrences: number; verseCount: number };
		bookCounts: { book: number; count: number }[];
		glosses: { display: string; occurrences: number }[];
		occurrences: {
			occurrences: {
				book: number;
				chapter: number;
				verse: number;
				segments: VerseSegment[];
				morph: string | null;
				lemma: string | null;
			}[];
			total: number;
			page: number;
			pageCount: number;
		};
		original: {
			word: string;
			morph: string | null;
			lemma: string | null;
			resourceId: string;
		} | null;
		morphology: {
			code: string;
			partOfSpeech: string;
			features: { feature: string; value: string }[];
			unknown: string[];
		};
	};

	let {
		lookup,
		entry,
		resourceTitle,
		lexiconId,
		sourceResource = null,
		studyReference = null,
		studyWord = null,
		onLookup,
		onOpenReference,
		lookupHref,
		referenceHref
	}: {
		lookup: string | null;
		entry: StrongEntry | null;
		resourceTitle: string;
		lexiconId: string;
		sourceResource?: ReadableResource | null;
		studyReference?: VerseRef | null;
		studyWord?: string | null;
		onLookup: (lookup: string) => void;
		onOpenReference: (reference: VerseRef) => void;
		lookupHref: (lookup: string) => string;
		referenceHref: (reference: VerseRef) => string;
	} = $props();

	let study = $state<StudyPayload | null>(null);
	let loading = $state(false);
	let loadError = $state(false);
	let page = $state(1);
	let activeBook = $state<number | null>(null);
	let baseKey = $state('');

	$effect(() => {
		const nextKey = `${entry?.strong ?? ''}:${lexiconId}:${sourceResource?.id ?? ''}:${studyReference?.book ?? ''}:${studyReference?.chapter ?? ''}:${studyReference?.verse ?? ''}`;
		if (nextKey !== baseKey) {
			baseKey = nextKey;
			page = 1;
			activeBook = null;
			study = null;
		}
	});

	$effect(() => {
		const strong = entry?.strong;
		const sourceId = sourceResource?.id;
		if (!strong || !sourceId) {
			study = null;
			loading = false;
			return;
		}

		const controller = new AbortController();
		const params = new SvelteURLSearchParams({
			resource: sourceId,
			lexicon: lexiconId,
			page: String(page)
		});
		if (studyReference) params.set('ref', formatReference(studyReference));
		if (activeBook !== null) params.set('book', String(activeBook));
		loading = true;
		loadError = false;
		fetch(`/api/strong/${encodeURIComponent(strong)}?${params}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(String(response.status));
				study = (await response.json()) as StudyPayload;
			})
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				loadError = true;
			})
			.finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	function filterBook(book: number): void {
		activeBook = activeBook === book ? null : book;
		page = 1;
	}

	function openOccurrence(event: MouseEvent | KeyboardEvent, reference: VerseRef): void {
		if ((event.target as Element).closest('button, a')) return;
		if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
		event.preventDefault();
		onOpenReference(reference);
	}
</script>

<section class="lexicon-tab" aria-label="Lexikoneintrag in {resourceTitle}" aria-live="polite">
	{#if !lookup}
		<p class="status">Gib oben eine Strong-Nummer oder ein Stichwort ein.</p>
	{:else if !entry}
		<p class="status">Kein Eintrag für „{lookup}“ in {resourceTitle}.</p>
	{:else}
		<article
			use:readerContentLinks={{
				onStrong: onLookup,
				onReference: onOpenReference,
				strongHref: lookupHref,
				referenceHref
			}}
		>
			<header class="headword">
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
				{#if studyWord || studyReference}
					<p class="source-context">
						{#if studyWord}<q>{studyWord}</q>{/if}
						{#if studyWord && studyReference}<span> · </span>{/if}
						{#if studyReference}<span>{formatReference(studyReference)}</span>{/if}
					</p>
				{/if}
			</header>

			{#if study?.original?.morph}
				<section>
					<h3>Grammatik</h3>
					{#if study.original.word}
						<p
							class="original-word"
							lang={entry.language}
							dir={entry.language === 'hbo' ? 'rtl' : 'ltr'}
						>
							{study.original.word}
						</p>
					{/if}
					<div class="grammar-details">
						<MorphologyList morphology={study.morphology} />
					</div>
				</section>
			{/if}

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

			{#if sourceResource}
				<section class="study-section">
					<div class="study-heading">
						<div>
							<h3>Vorkommen</h3>
							<p>in {sourceResource.selectionTitle}</p>
						</div>
						{#if study}
							<p class="study-total">
								<strong>{formatNumber(study.statistics.occurrences)}</strong> Vorkommen in
								{formatNumber(study.statistics.verseCount)} Versen
							</p>
						{/if}
					</div>
					{#if loading && !study}<p class="loading">Wortstudie wird geladen …</p>{/if}
					{#if loadError}<p class="error">Die Wortstudie konnte nicht geladen werden.</p>{/if}
				</section>

				{#if study?.glosses.length}
					<section>
						<h3>Übersetzt als</h3>
						<GlossChart
							glosses={study.glosses}
							occurrenceTotal={study.statistics.occurrences}
							centerLabel
							groupBelowPercent={2}
						/>
					</section>
				{/if}

				{#if study?.bookCounts.length}
					<section>
						<BookDistribution counts={study.bookCounts} onBook={filterBook} {activeBook} compact />
					</section>
				{/if}

				{#if study}
					<section class="occurrence-section">
						<div class="occurrence-heading">
							<h3>{activeBook ? `Vorkommen in ${bookShortName(activeBook)}` : 'Fundstellen'}</h3>
							{#if activeBook}
								<button
									type="button"
									onclick={() => {
										activeBook = null;
										page = 1;
									}}>Alle Bücher</button
								>
							{/if}
						</div>
						{#if study.occurrences.occurrences.length === 0 && !loading}
							<p class="empty">Keine Vorkommen in dieser Übersetzung.</p>
						{/if}
						<div class="occurrences">
							{#each study.occurrences.occurrences as occurrence (`${occurrence.book}:${occurrence.chapter}:${occurrence.verse}`)}
								<div
									class="occurrence"
									role="link"
									tabindex="0"
									onclick={(event) => openOccurrence(event, occurrence)}
									onkeydown={(event) => openOccurrence(event, occurrence)}
								>
									<strong class="occurrence-reference">{formatReference(occurrence)}</strong>
									<p lang={sourceResource.language} dir={sourceResource.direction}>
										<VerseText
											segments={occurrence.segments}
											activeStrong={entry.strong}
											onStrongClick={(strong) => onLookup(strong)}
										/>
									</p>
								</div>
							{/each}
						</div>
						{#if study.occurrences.pageCount > 1}
							<nav class="pagination" aria-label="Fundstellen-Seiten">
								<button
									type="button"
									aria-label="Vorherige Fundstellenseite"
									disabled={page <= 1 || loading}
									onclick={() => (page -= 1)}
								>
									<Icon name="chevron-left" class="size-4" />
								</button>
								<span>{page} / {study.occurrences.pageCount}</span>
								<button
									type="button"
									aria-label="Nächste Fundstellenseite"
									disabled={page >= study.occurrences.pageCount || loading}
									onclick={() => (page += 1)}
								>
									<Icon name="chevron-right" class="size-4" />
								</button>
							</nav>
						{/if}
					</section>
				{/if}
			{:else}
				<p class="missing-source">
					Öffne den Eintrag über ein Strong-markiertes Wort, um Grammatik und Vorkommen für diese
					Übersetzung zu sehen.
				</p>
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
		width: min(100%, 58rem);
		padding: 1rem clamp(0.85rem, 3vw, 1.5rem) 4rem;
		font-size: 0.82rem;
		line-height: 1.6;
	}
	.headword {
		padding-bottom: 0.85rem;
		border-bottom: 1px solid var(--line);
	}
	.headword strong {
		color: var(--color-accent-700);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.72rem;
		letter-spacing: 0.07em;
	}
	h2 {
		margin-top: 0.08rem;
		font-size: calc(1.45 * var(--reader-text-size, 1.08rem));
		font-weight: 500;
		line-height: 1.25;
	}
	.pronunciation,
	.source-context {
		margin-top: 0.2rem;
		color: var(--color-stone-500);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.78rem;
	}
	article > section {
		margin-top: 1.15rem;
	}
	h3 {
		margin-bottom: 0.3rem;
		color: var(--color-stone-500);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.lexicon-body {
		font-size: calc(0.95rem * var(--reader-font-scale, 1));
		line-height: 1.6;
		font-family: var(--reader-font-family, ui-serif, Georgia, serif);
	}
	.original-word {
		margin-bottom: 0.25rem;
		font-family: var(--font-greek), var(--font-hebrew), serif;
		font-size: var(--reader-text-size, 1.08rem);
	}
	.grammar-details {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.see-also {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.see-also button,
	.occurrence-heading button,
	.pagination button {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--color-accent-700);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.78rem;
	}
	.study-section {
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}
	.study-heading {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0 0.6rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.study-heading h3 {
		margin: 0;
	}
	.study-heading > div p {
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}
	.study-total {
		margin: 0;
		color: var(--color-stone-600);
		font-size: 0.74rem;
		font-weight: 500;
		white-space: nowrap;
	}
	.study-total strong {
		color: var(--text);
		font-size: 1em;
	}
	.occurrence-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	.occurrences {
		display: grid;
		gap: 0.65rem;
	}
	.occurrence {
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--surface-raised) 75%, transparent);
		font-size: var(--reader-text-size, 1.08rem);
		line-height: 1.55;
		text-align: left;
		cursor: pointer;
	}
	.occurrence:hover,
	.occurrence:focus-visible {
		border-color: var(--color-accent-400);
		background: var(--color-accent-50);
		outline: none;
	}
	.occurrence-reference {
		display: block;
		margin-bottom: 0.15rem;
		color: var(--color-accent-700);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.occurrence p {
		font-family: var(--reader-font-family, ui-serif, Georgia, serif);
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		margin-top: 0.9rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.72rem;
	}
	.pagination button:disabled {
		opacity: 0.4;
	}
	.status,
	.missing-source,
	.loading,
	.error,
	.empty {
		color: var(--color-stone-500);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.status {
		padding: 2rem 1rem;
		text-align: center;
	}
	.missing-source {
		margin-top: 1.25rem;
		padding: 0.75rem;
		border-radius: 0.55rem;
		background: var(--color-stone-100);
	}
	.error {
		color: var(--color-red-700, #b91c1c);
	}
	:global(.dark) .missing-source {
		background: var(--color-stone-900);
	}
	:global(.dark) .occurrence:hover,
	:global(.dark) .occurrence:focus-visible {
		background: var(--color-stone-900);
	}
</style>
