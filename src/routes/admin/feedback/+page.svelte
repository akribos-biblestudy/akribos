<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		categories,
		statuses,
		type FeedbackCategory,
		type FeedbackStatus
	} from '$lib/feedback/model';
	import { feedbackLocationLinks } from '$lib/feedback/location-links';
	import Icon from '$lib/components/Icon.svelte';

	let { data, form } = $props();

	type SortColumn =
		'date' | 'category' | 'resource' | 'location' | 'description' | 'author' | 'status';
	const columns: { id: SortColumn; label: string }[] = [
		{ id: 'date', label: 'Datum' },
		{ id: 'category', label: 'Kategorie' },
		{ id: 'resource', label: 'Werk' },
		{ id: 'location', label: 'Stelle' },
		{ id: 'description', label: 'Feedback' },
		{ id: 'author', label: 'Person' },
		{ id: 'status', label: 'Status' }
	];

	function queryLink(changes: Record<string, string | null>) {
		const params = new SvelteURLSearchParams(data.query);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, value);
		}
		const query = params.toString();
		return `/admin/feedback${query ? `?${query}` : ''}`;
	}
	function sortLink(column: SortColumn) {
		return queryLink({
			sort: column,
			direction: data.sort === column && data.direction === 'asc' ? 'desc' : 'asc',
			page: null,
			detail: null
		});
	}
	function preview(text: string) {
		const compact = text.replace(/\s+/g, ' ').trim();
		return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
	}
</script>

<svelte:head><title>Feedback – Verwaltung – Akribos</title></svelte:head>
<h1 class="text-2xl font-semibold">Feedback</h1>
<p class="mt-2 text-sm text-stone-600 dark:text-stone-400">
	Rückmeldungen durchsuchen, bearbeiten und inhaltliche Fehler als Excel-Datei exportieren.
</p>
{#if form?.saved}<p role="status" class="mt-4 text-green-700">Änderungen gespeichert.</p>{/if}
{#if form?.deleted}<p role="status" class="mt-4 text-green-700">Meldung gelöscht.</p>{/if}
{#if form?.error}<p role="alert" class="mt-4 text-red-700">{form.error}</p>{/if}

<form id="feedback-filters" method="GET" class="mt-5 flex flex-wrap items-center gap-3">
	<input type="hidden" name="sort" value={data.sort} />
	<input type="hidden" name="direction" value={data.direction} />
	{#if data.filters.q}<input type="hidden" name="q" value={data.filters.q} />{/if}
	<button class="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white"
		>Filter anwenden</button
	>
	<a class="text-sm underline" href="/admin/feedback">Filter zurücksetzen</a>
	<a class="text-sm underline" href="/admin/feedback/export?{data.query}"
		>Inhaltliche Fehler als Excel exportieren</a
	>
</form>
<p class="mt-3 text-xs text-stone-500">
	{data.total}
	{data.total === 1 ? 'Meldung' : 'Meldungen'} gefunden. Der Excel-Export enthält keine Kontodaten oder
	internen Notizen. Prüfe vor der Weitergabe, ob Freitexte persönliche Angaben enthalten.
</p>
<div class="mt-4 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700">
	<table class="w-full min-w-[1100px] table-auto text-left text-sm" aria-label="Feedbackmeldungen">
		<thead class="bg-stone-50 dark:bg-stone-900">
			<tr>
				<th class="relative w-10 px-2 py-2" scope="col"><span class="sr-only">Details</span></th>
				{#each columns as column (column.id)}
					<th
						class="px-3 py-2 font-semibold"
						scope="col"
						aria-sort={data.sort === column.id
							? data.direction === 'asc'
								? 'ascending'
								: 'descending'
							: 'none'}
					>
						<a
							href={sortLink(column.id)}
							aria-label="{column.label} sortieren"
							class="whitespace-nowrap hover:underline"
						>
							{column.label}{#if data.sort === column.id}<span aria-hidden="true">
									{data.direction === 'asc' ? '↑' : '↓'}</span
								>{/if}
						</a>
					</th>
				{/each}
			</tr>
			<tr class="border-t border-stone-200 dark:border-stone-700">
				<td></td>
				<td class="px-2 py-2"
					><input
						form="feedback-filters"
						name="date"
						type="date"
						aria-label="Datum filtern"
						value={data.filters.date}
						class="w-36 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
					/></td
				>
				<td class="px-2 py-2"
					><select
						form="feedback-filters"
						name="category"
						aria-label="Kategorie filtern"
						class="w-32 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
						><option value="">Alle</option
						>{#each Object.entries(categories) as [value, label] (value)}<option
								{value}
								selected={data.filters.category === value}>{label}</option
							>{/each}</select
					></td
				>
				<td class="px-2 py-2"
					><select
						form="feedback-filters"
						name="resource"
						aria-label="Werk filtern"
						class="w-32 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
						><option value="">Alle</option>{#each data.works as work (work.id)}<option
								value={work.id}
								selected={data.filters.resource === work.id}>{work.name}</option
							>{/each}</select
					></td
				>
				<td class="px-2 py-2"
					><input
						form="feedback-filters"
						name="location"
						aria-label="Stelle filtern"
						value={data.filters.location}
						placeholder="Stelle"
						class="w-28 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
					/></td
				>
				<td class="px-2 py-2"
					><input
						form="feedback-filters"
						name="description"
						aria-label="Feedback filtern"
						value={data.filters.description}
						placeholder="Feedbacktext"
						class="w-full min-w-36 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
					/></td
				>
				<td class="px-2 py-2"
					><input
						form="feedback-filters"
						name="author"
						aria-label="Person filtern"
						value={data.filters.author}
						placeholder="Name oder E-Mail"
						class="w-32 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
					/></td
				>
				<td class="px-2 py-2"
					><select
						form="feedback-filters"
						name="status"
						aria-label="Status filtern"
						class="w-28 rounded border border-stone-300 px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-950"
						><option value="">Alle</option
						>{#each Object.entries(statuses) as [value, label] (value)}<option
								{value}
								selected={data.filters.status === value}>{label}</option
							>{/each}</select
					></td
				>
			</tr>
		</thead>
		<tbody class="divide-y divide-stone-200 dark:divide-stone-800">
			{#each data.reports as report (report.id)}
				<tr class="align-top">
					<td class="px-2 py-1">
						<a
							class="inline-flex size-8 items-center justify-center rounded text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-accent-600 dark:text-stone-300 dark:hover:bg-stone-800"
							href={queryLink({ detail: data.selectedId === report.id ? null : report.id })}
							aria-label={data.selectedId === report.id ? 'Meldung schließen' : 'Meldung öffnen'}
							aria-expanded={data.selectedId === report.id}
							aria-controls={data.selectedId === report.id
								? `feedback-details-${report.id}`
								: undefined}
							title={data.selectedId === report.id ? 'Meldung schließen' : 'Meldung öffnen'}
						>
							<Icon
								name={data.selectedId === report.id ? 'chevron-down' : 'chevron-right'}
								class="size-4"
							/>
						</a>
					</td>
					<td class="px-3 py-2 whitespace-nowrap"
						>{new Date(report.createdAt).toLocaleDateString('de-DE', {
							timeZone: 'Europe/Berlin'
						})}</td
					>
					<td class="px-3 py-2"
						>{categories[report.category as FeedbackCategory] ?? report.category}</td
					>
					<td class="px-3 py-2">{report.resourceName || '–'}</td>
					<td class="max-w-48 px-3 py-2">
						{#if report.location}
							{@const links = feedbackLocationLinks(
								report.location,
								report.resourceId && report.resourceKind
									? {
											id: report.resourceId,
											kind: report.resourceKind,
											language: report.resourceLanguage ?? undefined
										}
									: null
							)}
							<span class="break-words whitespace-pre-wrap"
								>{#each links as link, index (index)}{report.location.slice(
										index ? (links[index - 1]?.to ?? 0) : 0,
										link.from
									)}<a class="text-accent-600 underline dark:text-accent-400" href={link.href}
										>{report.location.slice(link.from, link.to)}</a
									>{/each}{report.location.slice(links.at(-1)?.to ?? 0)}</span
							>
						{:else}–{/if}
					</td>
					<td class="max-w-80 min-w-48 px-3 py-2">{preview(report.description)}</td>
					<td class="max-w-40 px-3 py-2 break-words"
						>{report.displayName || report.email || 'Konto gelöscht'}</td
					>
					<td class="px-3 py-2 whitespace-nowrap"
						>{statuses[report.status as FeedbackStatus] ?? report.status}</td
					>
				</tr>
				{#if data.selectedId === report.id}
					<tr
						><td colspan="8" class="bg-stone-50 px-4 py-4 dark:bg-stone-900">
							<article id="feedback-details-{report.id}" aria-label="Meldungsdetails">
								<h2 class="font-semibold">Meldungsdetails</h2>
								<p class="mt-2 text-sm whitespace-pre-wrap">{report.description}</p>
								{#if report.suggestion}<p class="mt-2 text-sm whitespace-pre-wrap">
										<strong>Korrekturvorschlag:</strong>
										{report.suggestion}
									</p>{/if}
								<dl class="mt-3 grid gap-1 text-sm text-stone-600 dark:text-stone-400">
									<div>
										<dt class="inline font-medium">Meldende Person:</dt>
										<dd class="inline">
											{report.displayName || report.email || 'Konto gelöscht'}{report.displayName &&
											report.email
												? ` (${report.email})`
												: ''}
										</dd>
									</div>
									<div>
										<dt class="inline font-medium">Seite:</dt>
										<dd class="inline break-all">{report.page || '–'}</dd>
									</div>
									<div>
										<dt class="inline font-medium">Browser:</dt>
										<dd class="inline break-all">{report.browser || '–'}</dd>
									</div>
									<div>
										<dt class="inline font-medium">Gerät:</dt>
										<dd class="inline">{report.device || '–'}</dd>
									</div>
								</dl>
								{#if report.attachmentName}<a
										class="mt-2 inline-block text-sm underline"
										href="/admin/feedback/{report.id}/attachment"
										>Anhang herunterladen: {report.attachmentName}</a
									>{/if}
								<form
									method="POST"
									action="?/update&{data.query}"
									class="mt-4 grid max-w-xl gap-3 border-t border-stone-200 pt-4 dark:border-stone-700"
								>
									<input type="hidden" name="id" value={report.id} />
									<label class="grid gap-1 text-sm"
										>Status<select
											name="status"
											class="max-w-xs rounded-lg border border-stone-300 px-2 py-2 dark:border-stone-700 dark:bg-stone-950"
											>{#each Object.entries(statuses) as [value, label] (value)}<option
													{value}
													selected={report.status === value}>{label}</option
												>{/each}</select
										></label
									>
									<label class="grid gap-1 text-sm"
										>Interne Notiz<textarea
											name="adminNote"
											rows="2"
											maxlength="10000"
											class="rounded-lg border border-stone-300 px-2 py-2 dark:border-stone-700 dark:bg-stone-950"
											>{report.adminNote ?? ''}</textarea
										></label
									>
									<button
										class="justify-self-start rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white"
										>Speichern</button
									>
								</form>
								<form
									method="POST"
									action="?/delete&{data.query}"
									onsubmit={(event) => {
										if (!confirm('Diese Meldung und ihren Anhang endgültig löschen?'))
											event.preventDefault();
									}}
									class="mt-3"
								>
									<input type="hidden" name="id" value={report.id} /><button
										class="text-sm text-red-700 underline">Meldung löschen</button
									>
								</form>
							</article>
						</td></tr
					>
				{/if}
			{:else}<tr
					><td colspan="8" class="px-3 py-6 text-sm text-stone-500">Keine Meldungen gefunden.</td
					></tr
				>{/each}
		</tbody>
	</table>
</div>
{#if data.pages > 1}
	<nav class="mt-4 flex flex-wrap items-center gap-4 text-sm" aria-label="Feedbackseiten">
		{#if data.page > 1}
			<a class="underline" href={queryLink({ page: String(data.page - 1), detail: null })}>Zurück</a
			>
		{/if}
		<span>Seite {data.page} von {data.pages}</span>
		{#if data.page < data.pages}
			<a class="underline" href={queryLink({ page: String(data.page + 1), detail: null })}>Weiter</a
			>
		{/if}
	</nav>
{/if}
