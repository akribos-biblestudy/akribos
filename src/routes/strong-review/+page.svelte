<script lang="ts">
	import { bookShortName, GERMAN_BOOK_NAMES } from '$lib/bible/book-names';
	import { BOOKS } from '$lib/bible/books';
	import { formatReference } from '$lib/bible/reference';
	import { invalidateAll } from '$app/navigation';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import StrongReviewButtons from '$lib/components/StrongReviewButtons.svelte';
	import StrongReviewVerse from '$lib/components/StrongReviewVerse.svelte';
	import StrongReviewLexicon from '$lib/components/StrongReviewLexicon.svelte';
	let { data } = $props();
	let saving = $state(false);
	let issue = $state('');
	let selectedKey = $state('');
	let lexiconPanel: HTMLElement | undefined = $state();
	function itemKey(item: (typeof data.items)[number]): string {
		return `${item.resourceId}:${item.bookId}:${item.chapter}:${item.verse}:${item.wordPosition}:${item.strong}`;
	}
	const selection = $derived(data.items.find((item) => itemKey(item) === selectedKey) ?? null);
	function selectItem(item: (typeof data.items)[number]) {
		selectedKey = itemKey(item);
		if (window.matchMedia('(max-width: 1023px)').matches)
			lexiconPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	async function submit(
		item: (typeof data.items)[number],
		decision: 'confirmed' | 'incorrect' | 'withdraw'
	) {
		saving = true;
		issue = '';
		try {
			const response = await fetch('/api/strong-review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					resourceId: item.resourceId,
					bookId: item.bookId,
					chapter: item.chapter,
					verse: item.verse,
					word: item.word,
					wordPosition: item.wordPosition,
					strong: item.strong,
					decision
				})
			});
			if (!response.ok)
				throw new Error(
					'Die Prüfung konnte nicht gespeichert werden. Bitte lade die Übersicht neu.'
				);
			await invalidateAll();
		} catch (error) {
			issue =
				error instanceof Error ? error.message : 'Die Prüfung konnte nicht gespeichert werden.';
		} finally {
			saving = false;
		}
	}
	function pageLink(page: number) {
		const params = new SvelteURLSearchParams({
			resource: data.resourceId ?? '',
			page: String(page)
		});
		if (data.book) params.set('book', String(data.book));
		return `?${params}`;
	}
</script>

<div class="mx-auto max-w-screen-2xl px-4 py-6">
	<h1 class="text-2xl font-semibold">Strong-Zuordnungen prüfen</h1>
	<p class="mt-1 text-sm text-stone-500">
		Prüfe jedes Wort einzeln. Deine Einschätzung wird erst nach Freigabe durch die Verwaltung
		sichtbar.
	</p>
	<form method="GET" class="my-5 flex flex-wrap items-end gap-3">
		<label class="grid gap-1 text-sm"
			>Bibel <select
				name="resource"
				class="rounded border border-stone-300 px-2 py-1 dark:bg-stone-900"
				>{#each data.bibles as bible (bible.id)}<option
						value={bible.id}
						selected={bible.id === data.resourceId}>{bible.name}</option
					>{/each}</select
			></label
		>
		<label class="grid gap-1 text-sm"
			>Bibelbuch
			<select name="book" class="rounded border border-stone-300 px-2 py-1 dark:bg-stone-900">
				<option value="">Alle Bücher</option>
				{#each BOOKS as book (book.id)}<option value={book.id} selected={book.id === data.book}
						>{GERMAN_BOOK_NAMES[book.id]?.name ?? book.osisId}</option
					>{/each}
			</select>
		</label>
		<button class="rounded bg-accent-600 px-3 py-2 text-sm text-white">Anzeigen</button>
	</form>
	<p class="mb-3 text-sm text-stone-500">
		{data.total.toLocaleString('de-DE')} offene {data.total === 1 ? 'Zuordnung' : 'Zuordnungen'}
	</p>
	{#if issue}<p role="alert" class="mb-4 text-red-700">{issue}</p>{/if}
	<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
		<div class="min-w-0 space-y-3">
			{#each data.items as item (`${item.bookId}:${item.chapter}:${item.verse}:${item.wordPosition}:${item.strong}`)}
				<article class="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
					<p>
						<strong>{bookShortName(item.bookId)} {item.chapter},{item.verse}</strong> · {item.strong}
					</p>
					<p class="mt-2 text-sm leading-relaxed">
						<StrongReviewVerse
							segments={item.segments}
							wordPosition={item.wordPosition}
							strong={item.strong}
							selected={selectedKey === itemKey(item)}
							onSelect={() => selectItem(item)}
						/>
					</p>
					<a
						class="text-sm text-accent-600 underline"
						href={'/' +
							encodeURIComponent(
								formatReference({ book: item.bookId, chapter: item.chapter, verse: item.verse })
							)}>Bibelstelle in der aktuellen Leseansicht öffnen</a
					>
					{#if item.pendingByOther}<p class="mt-2 text-sm text-stone-500">
							Diese Zuordnung wartet bereits auf Freigabe.
						</p>{/if}
					<div class="mt-2">
						<StrongReviewButtons
							pending={item.pending}
							disabled={saving || item.pendingByOther}
							onDecision={(decision) => submit(item, decision)}
						/>
					</div>
				</article>
			{:else}<p class="text-sm text-stone-500">
					Keine offenen Zuordnungen für die gewählte Bibel und das gewählte Buch.
				</p>{/each}
			<nav class="mt-5 flex gap-4 text-sm" aria-label="Seiten">
				<span>Seite {data.page} von {data.pages}</span>{#if data.page > 1}<a
						href={pageLink(data.page - 1)}
						class="underline">Zurück</a
					>{/if}{#if data.page < data.pages}<a href={pageLink(data.page + 1)} class="underline"
						>Weiter</a
					>{/if}
			</nav>
		</div>
		<aside
			bind:this={lexiconPanel}
			class="min-w-0 rounded-xl border border-stone-200 p-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] dark:border-stone-800"
		>
			<StrongReviewLexicon {selection} lexicons={data.lexicons} />
		</aside>
	</div>
</div>
