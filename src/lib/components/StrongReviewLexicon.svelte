<script lang="ts">
	import { formatReference } from '$lib/bible/reference';
	import type { StrongEntry } from '$lib/server/repositories/strong';
	import LexiconDefinition from './LexiconDefinition.svelte';

	type Selection = {
		resourceId: string;
		bookId: number;
		chapter: number;
		verse: number;
		strong: string;
		word: string;
		wordPosition: number;
	};
	let {
		selection,
		lexicons
	}: { selection: Selection | null; lexicons: { id: string; name: string }[] } = $props();
	let lexiconId = $state('');
	let entry = $state<StrongEntry | null>(null);
	let foundIn = $state('');
	let loading = $state(false);
	let failed = $state(false);

	$effect(() => {
		const current = selection;
		const available = lexicons;
		const chosen = lexiconId;
		entry = null;
		foundIn = '';
		failed = false;
		if (!current) {
			loading = false;
			return;
		}
		const controller = new AbortController();
		const candidates = chosen ? available.filter((item) => item.id === chosen) : available;
		loading = true;
		void (async () => {
			let hadError = false;
			for (const resource of candidates) {
				try {
					const query = new URLSearchParams({ resource: resource.id, q: current.strong });
					const response = await fetch(`/api/reader/lookup?${query}`, {
						signal: controller.signal
					});
					if (!response.ok) {
						hadError = true;
						continue;
					}
					const result = (await response.json()) as { entry: StrongEntry | null };
					if (controller.signal.aborted) return;
					if (result.entry) {
						entry = result.entry;
						foundIn = resource.name;
						return;
					}
				} catch {
					if (controller.signal.aborted) return;
					hadError = true;
				}
			}
			if (!controller.signal.aborted) failed = hadError;
		})().finally(() => {
			if (!controller.signal.aborted) loading = false;
		});
		return () => controller.abort();
	});
</script>

<section aria-label="Lexikon zur Strong-Prüfung" aria-live="polite">
	<h2 class="text-lg font-semibold">Lexikon</h2>
	{#if !selection}
		<p class="mt-2 text-sm text-stone-500">
			Wähle ein markiertes Wort aus, um den Lexikoneintrag zu öffnen.
		</p>
	{:else}
		<p class="mt-1 text-sm text-stone-500">
			„{selection.word}“ · {formatReference({
				book: selection.bookId,
				chapter: selection.chapter,
				verse: selection.verse
			})} · {selection.strong}
		</p>
		{#if lexicons.length}
			<label class="mt-4 grid gap-1 text-sm"
				>Lexikon
				<select
					bind:value={lexiconId}
					class="rounded border border-stone-300 px-2 py-1 dark:border-stone-700 dark:bg-stone-900"
				>
					<option value="">Automatisch</option>
					{#each lexicons as lexicon (lexicon.id)}<option value={lexicon.id}>{lexicon.name}</option
						>{/each}
				</select>
			</label>
		{/if}
		{#if loading}
			<p class="mt-4 text-sm text-stone-500">Lexikoneintrag wird geladen …</p>
		{:else if entry}
			<article class="mt-4">
				<p class="text-xs font-semibold text-accent-700 dark:text-accent-300">
					{foundIn} · {entry.strong}
				</p>
				<h3
					class="mt-1 text-xl font-semibold"
					lang={entry.language}
					dir={entry.language === 'hbo' ? 'rtl' : 'ltr'}
				>
					{entry.lemma}
				</h3>
				{#if entry.transliteration || entry.pronunciation}
					<p class="mt-1 text-sm text-stone-500">
						{entry.transliteration ?? ''}{entry.transliteration && entry.pronunciation
							? ' · '
							: ''}{entry.pronunciation ? `[${entry.pronunciation}]` : ''}
					</p>
				{/if}
				<div class="mt-4"><LexiconDefinition {entry} bibleId={selection.resourceId} /></div>
			</article>
		{:else if failed}
			<p class="mt-4 text-sm text-red-700">
				Der Lexikoneintrag konnte nicht geladen werden. Bitte versuche es erneut.
			</p>
		{:else}
			<p class="mt-4 text-sm text-stone-500">
				Für {selection.strong} ist in den verfügbaren Lexika kein Eintrag vorhanden.
			</p>
		{/if}
	{/if}
</section>
