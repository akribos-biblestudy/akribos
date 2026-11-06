<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Bibeln herunterladen – Akribos</title></svelte:head>
<main class="mx-auto max-w-4xl px-4 py-8">
	<h1 class="text-2xl font-semibold">Bibeln herunterladen</h1>
	<p class="mt-2 text-sm text-stone-600 dark:text-stone-400">
		Hier stehen ausdrücklich freigegebene Bibeln als Akribos-JSON und als USX-Archiv bereit.
		Akribos-JSON enthält den gespeicherten Bibeltext und freigegebene Prüfungen; USX eignet sich zum
		Austausch und enthält nicht alle Zusatzdaten.
	</p>
	{#if data.bibles.length === 0}<p class="mt-6">
			Zurzeit sind keine Bibeln zum Download freigegeben.
		</p>{:else}
		<ul class="mt-6 space-y-3">
			{#each data.bibles as bible (bible.id)}
				<li
					class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-700"
				>
					<div>
						<p class="font-semibold">{bible.name}</p>
						<p class="text-sm text-stone-500">
							{bible.abbrev}{bible.sourceRevision ? ` · ${bible.sourceRevision}` : ''}
						</p>
					</div>
					<a
						class="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white"
						href="/downloads/{encodeURIComponent(bible.id)}">Akribos-JSON</a
					>
					<a
						class="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium dark:border-stone-700"
						href="/downloads/{encodeURIComponent(bible.id)}?format=usx">USX herunterladen</a
					>
				</li>
			{/each}
		</ul>
	{/if}
</main>
