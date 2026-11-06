<script lang="ts">
	import { bookShortName } from '$lib/bible/book-names';
	import { segmentsToText } from '$lib/bible/segments';
	import StrongReviewVerse from '$lib/components/StrongReviewVerse.svelte';
	import StrongReviewLexicon from '$lib/components/StrongReviewLexicon.svelte';
	let { data, form } = $props();
	const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });
	let selectedId = $state<string | null>(null);
	let lexiconPane: HTMLElement | undefined = $state();
	const selected = $derived(
		data.reviews.find((row) => row.review.id === selectedId && row.current)
	);
	const selection = $derived(
		selected
			? {
					resourceId: selected.review.resourceId,
					bookId: selected.review.bookId,
					chapter: selected.review.chapter,
					verse: selected.review.verse,
					strong: selected.review.strong,
					word: selected.review.word,
					wordPosition: selected.review.wordPosition
				}
			: null
	);
	function selectReview(id: string) {
		selectedId = id;
		if (window.matchMedia('(max-width: 1023px)').matches)
			requestAnimationFrame(() =>
				lexiconPane?.scrollIntoView({ behavior: 'smooth', block: 'start' })
			);
	}
</script>

<header class="mb-5">
	<h1 class="text-2xl font-semibold">Strong-Prüfungen</h1>
	<p class="mt-1 text-sm text-stone-500">Einzelne Wortzuordnungen prüfen und freigeben.</p>
</header>
{#if form?.error}<p role="alert" class="mb-4 text-sm text-red-700">{form.error}</p>{/if}
<form method="GET" class="mb-4 flex items-end gap-3">
	<label class="block text-sm"
		>Anzeige
		<select
			name="filter"
			aria-label="Anzeige"
			class="rounded border border-stone-300 p-1 dark:bg-stone-900"
			onchange={(event) => event.currentTarget.form?.requestSubmit()}
		>
			<option value="pending" selected={data.filter === 'pending'}>Offene Prüfungen</option>
			<option value="approved" selected={data.filter === 'approved'}>Freigegeben</option>
			<option value="all" selected={data.filter === 'all'}>Alle</option>
		</select>
	</label>
	<noscript><button class="rounded border px-2 py-1 text-sm">Anzeigen</button></noscript>
</form>
<p class="mb-3 text-xs text-stone-500">
	{data.total} Prüfungen · Seite {data.page} von {data.pages}
</p>
<div class="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
	<div class="min-w-0 space-y-3">
		{#each data.reviews as row (row.review.id)}
			<article class="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
				<h2 class="font-semibold">
					{row.resource} · {bookShortName(row.review.bookId)}
					{row.review.chapter},{row.review.verse} · {row.review.strong}
				</h2>
				<p class="mt-1 text-sm">
					{row.review.decision === 'confirmed' ? 'Bestätigt' : 'Als fehlerhaft markiert'}
				</p>
				<p class="mt-1 text-xs text-stone-500">
					{row.author || row.email || 'Gelöschtes Konto'} · {date.format(
						new Date(row.review.updatedAt)
					)} · {row.review.approvedAt ? 'Freigegeben' : 'Wartet auf Freigabe'}
				</p>
				{#if !row.readable}
					<p class="mt-3 text-sm text-amber-700">
						Für diese Bibel ist eine Lesefreigabe erforderlich, um den Vers fachlich zu prüfen und
						freizugeben.
					</p>
				{:else if !row.current}
					<p class="mt-3 text-sm text-amber-700">
						Die zugrunde liegende Bibelstelle hat sich geändert; diese Prüfung gilt nicht mehr.
					</p>
					{#if row.segments}<p class="mt-2 text-sm">
							Aktueller Vers: {segmentsToText(row.segments)}
						</p>{/if}
				{:else if row.segments}
					<p class="mt-3 text-sm">
						<StrongReviewVerse
							segments={row.segments}
							wordPosition={row.review.wordPosition}
							strong={row.review.strong}
							selected={selectedId === row.review.id}
							onSelect={() => selectReview(row.review.id)}
						/>
					</p>
				{/if}
				{#if !row.review.approvedAt && row.current}
					<form method="POST" action="?/approve&filter={data.filter}&page={data.page}" class="mt-3">
						<input type="hidden" name="id" value={row.review.id} />
						<button class="rounded bg-accent-600 px-3 py-2 text-sm font-semibold text-white"
							>Freigeben</button
						>
					</form>
				{/if}
			</article>
		{:else}<p class="text-sm text-stone-500">Keine Prüfungen in dieser Ansicht.</p>{/each}
		<nav class="flex gap-4 text-sm" aria-label="Seiten der Strong-Prüfungen">
			{#if data.page > 1}<a class="underline" href="?filter={data.filter}&page={data.page - 1}"
					>Zurück</a
				>{/if}
			{#if data.page < data.pages}<a
					class="underline"
					href="?filter={data.filter}&page={data.page + 1}">Weiter</a
				>{/if}
		</nav>
	</div>
	<aside
		bind:this={lexiconPane}
		aria-label="Lexikon"
		class="min-w-0 self-start rounded-xl border border-stone-200 p-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] dark:border-stone-800"
	>
		<StrongReviewLexicon {selection} lexicons={data.lexicons} />
	</aside>
</div>
