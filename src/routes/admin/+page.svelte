<script lang="ts">
	import { formatNumber, t, type MessageKey } from '$lib/i18n';
	import JobList from '$lib/components/admin/JobList.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	function formatBytes(bytes: number): string {
		const units = ['B', 'kB', 'MB', 'GB'];
		let value = bytes;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit += 1;
		}
		return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
	}

	const kindLabel = (kind: string) => t(`resource.kind.${kind}` as MessageKey);
</script>

<header class="mb-6 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Übersicht</h1>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
			Systemstatus, Datenbestand und letzte Verwaltungsaktivitäten.
		</p>
	</div>
	<div class="flex gap-2">
		<a
			href="/admin/import"
			class="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700"
			>Importieren</a
		>
		<a
			href="/admin/backup"
			class="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
			>Backup</a
		>
	</div>
</header>

<section class="mb-8">
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Ressourcen</h2>
	{#if data.resources.length === 0}
		<p class="text-sm text-stone-600 dark:text-stone-300">
			Es ist noch nichts importiert. <a class="text-accent-600 hover:underline" href="/admin/import"
				>Jetzt importieren</a
			>
		</p>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each data.resources as row (row.kind)}
				<a
					href="/admin/resources"
					class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-accent-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-accent-800"
				>
					<div class="flex items-start justify-between gap-3">
						<p class="font-semibold">{kindLabel(row.kind)}</p>
						<span
							class="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold dark:bg-stone-800"
							>{row.count}</span
						>
					</div>
					<p class="mt-3 text-xs text-stone-500 dark:text-stone-400">
						{formatNumber(row.verseCount)} Verse · {formatNumber(row.wordCount)} Wörter/Einträge
					</p>
				</a>
			{/each}
		</div>
	{/if}
</section>

<details
	class="group mb-8 rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
>
	<summary
		class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"
	>
		<span>Datenbankdetails</span>
		<span class="flex items-center gap-2 text-xs font-normal text-stone-500"
			><span>{data.databaseSize}</span><Icon
				name="chevron-down"
				class="size-4 transition-transform group-open:rotate-180"
			/></span
		>
	</summary>
	<div class="overflow-x-auto border-t border-stone-200 px-4 py-3 dark:border-stone-800">
		<table class="w-full text-sm">
			<thead class="text-left text-xs text-stone-500 dark:text-stone-400">
				<tr>
					<th class="py-1">Tabelle</th>
					<th class="py-1 text-right">Zeilen</th>
					<th class="py-1 text-right">Größe mit Indizes</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-stone-200 dark:divide-stone-800">
				{#each data.tables as table (table.name)}
					<tr>
						<td class="py-1.5 font-mono text-xs">{table.name}</td>
						<td class="py-1.5 text-right tabular-nums">{formatNumber(table.rows)}</td>
						<td class="py-1.5 text-right tabular-nums">{formatBytes(table.bytes)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
			Zeilenzahlen sind Schätzungen des Planers und nach einem Import erst nach dem nächsten ANALYZE
			aktuell.
		</p>
	</div>
</details>

<section>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Letzte Importe</h2>
	<JobList jobs={data.jobs} />
</section>
