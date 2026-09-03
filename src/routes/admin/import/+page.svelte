<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import JobList from '$lib/components/admin/JobList.svelte';
	import type { ImportJob } from '$lib/server/db/schema';

	let { data, form } = $props();

	/**
	 * While an import is running the page polls its own load function, which is enough for a job that
	 * takes half a minute and needs no socket to report progress.
	 */
	const running = $derived(
		data.running || data.jobs.some((job: ImportJob) => job.state === 'running')
	);

	let timer: ReturnType<typeof setInterval> | undefined;

	$effect(() => {
		if (running && !timer) {
			timer = setInterval(() => void invalidateAll(), 1500);
		} else if (!running && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	const formatLabels: Record<string, string> = {
		zefania: 'Zefania XML (Bibel)',
		'zefania-commentary': 'Zefania XML (Kommentar)',
		'sword-bible': 'SWORD-Modul (Bibel)',
		'sword-commentary': 'SWORD-Modul (Kommentar)',
		osis: 'OSIS XML (Bibel)',
		usfm: 'USFM (Bibel)',
		usx: 'USX (Bibel)',
		usfx: 'USFX (Bibel)',
		vpl: 'Ein Vers pro Zeile / CSV (Bibel)',
		'strongs-xml': "Strong's Wörterbuch (XML)",
		tsp: 'Robinson-Grammatik (TSP)',
		tsk: 'Parallelstellen (CSV/TSV)',
		'commentary-csv': 'Kommentar (CSV/Markdown)',
		'commentary-thml': 'Kommentar (ThML)'
	};

	let selectedFormat = $state('');
	const needsTarget = $derived(selectedFormat === 'tsp');
</script>

<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Ressource importieren</h1>
		<p class="mt-1 max-w-2xl text-sm text-stone-600 dark:text-stone-300">
			Neue Bibeln und Nachschlagewerke einlesen. Das Dateiformat wird normalerweise automatisch
			erkannt.
		</p>
	</div>
	<a
		href="/admin/resources"
		class="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
		>Ressourcen verwalten</a
	>
</header>

{#if form?.error}
	<p
		class="mb-4 max-w-2xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
		       dark:border-red-900 dark:bg-red-950 dark:text-red-200"
		role="alert"
	>
		{form.error}
	</p>
{/if}

{#if form?.started}
	<p
		class="mb-4 max-w-2xl rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm
		       dark:border-stone-800 dark:bg-stone-900"
	>
		Import gestartet ({form.format}). Der Fortschritt erscheint unten.
	</p>
{/if}

<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
	<div>
		<div
			class="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
		>
			Ein bereits vorhandener Bezeichner wird ersetzt. Darstellungstitel und Reihenfolge kannst du
			anschließend unter Ressourcen anpassen.
		</div>

		<form
			method="POST"
			enctype="multipart/form-data"
			class="space-y-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"
		>
			<div>
				<label class="mb-1 block text-sm font-medium" for="file">Datei</label>
				<input
					id="file"
					name="file"
					type="file"
					required
					accept=".xml,.usfm,.sfm,.usx,.txt,.csv,.tsv,.tsp,.thml,.osis,.zip"
					class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm file:mr-3 file:rounded
			       file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs
			       dark:border-stone-700 dark:file:bg-stone-800"
				/>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="mb-1 block text-sm font-medium" for="format">Format</label>
					<select
						id="format"
						name="format"
						bind:value={selectedFormat}
						class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
					>
						<option value="">automatisch erkennen</option>
						{#each data.formats as format (format.id)}
							<option value={format.id}>{formatLabels[format.id] ?? format.id}</option>
						{/each}
					</select>
				</div>

				{#if needsTarget}
					<div>
						<label class="mb-1 block text-sm font-medium" for="target">Grundtext ergänzen</label>
						<select
							id="target"
							name="target"
							class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
						>
							{#each data.morphologyTargets as target (target.id)}
								<option value={target.id}>{target.name}</option>
							{/each}
						</select>
						<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
							Grammatikdaten ergänzen eine vorhandene Übersetzung um Lemma und Wortform.
						</p>
					</div>
				{/if}
			</div>

			<details class="text-sm">
				<summary class="cursor-pointer text-stone-600 dark:text-stone-300">
					Angaben aus der Datei überschreiben
				</summary>
				<div class="mt-3 grid gap-3 sm:grid-cols-2">
					<div>
						<label class="mb-1 block text-xs font-medium" for="id">Bezeichner</label>
						<input
							id="id"
							name="id"
							placeholder="z.B. ELB1905STR"
							class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
						/>
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium" for="language">Sprache</label>
						<input
							id="language"
							name="language"
							placeholder="de, grc, hbo"
							class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
						/>
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium" for="name">Name</label>
						<input
							id="name"
							name="name"
							class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
						/>
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium" for="abbrev">Spaltentitel</label>
						<input
							id="abbrev"
							name="abbrev"
							class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
						/>
					</div>
				</div>
			</details>

			<button
				type="submit"
				disabled={running}
				class="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-accent-700
		       disabled:opacity-50"
			>
				{running ? 'Ein Import läuft …' : 'Importieren'}
			</button>
			{#if running}
				<span class="ml-2 text-xs text-stone-500 dark:text-stone-400">
					Importe laufen einzeln, damit sie sich nicht in die Quere kommen.
				</span>
			{/if}
		</form>
	</div>

	<section class="xl:sticky xl:top-[calc(var(--header-height)+1.5rem)]">
		<div class="mb-2 flex items-center justify-between gap-3">
			<h2 class="text-sm font-semibold tracking-wide text-stone-500 uppercase">Letzte Importe</h2>
			{#if running}<span
					class="rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-900 dark:text-accent-200"
					>läuft …</span
				>{/if}
		</div>
		<JobList jobs={data.jobs} />
	</section>
</div>
