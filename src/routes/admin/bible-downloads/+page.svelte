<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Bibel-Downloads – Verwaltung</title></svelte:head>

<header class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight">Bibel-Downloads</h1>
	<p class="mt-1 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
		Bibeln sichern, für den Austausch herunterladen und öffentliche Downloads verwalten.
	</p>
</header>

{#if form?.error}
	<p
		class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
		role="alert"
	>
		{form.error}
	</p>
{/if}
{#if form?.restored}
	<p
		class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
		role="status"
	>
		{form.restored} wurde wiederhergestellt.
		{#if form.statisticsRefreshed === false}Die Statistiken konnten nicht aktualisiert werden. Bitte
			in der Ressourcenverwaltung die Statistiken aktualisieren.{/if}
	</p>
{/if}
{#if form?.saved}
	<p
		class="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
		role="status"
	>
		Die Freigabe wurde gespeichert.
	</p>
{/if}

<div
	class="mb-6 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-sm leading-relaxed text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300"
>
	<div class="flex items-start gap-3">
		<Icon name="info" class="mt-0.5 size-4 shrink-0 text-stone-400" />
		<p>
			Die <strong class="font-semibold text-stone-800 dark:text-stone-200">Sicherung</strong>
			enthält die in Akribos gespeicherten Bibeldaten und Prüfungen.
			<strong class="font-semibold text-stone-800 dark:text-stone-200">USX</strong>
			dient dem Austausch und enthält nicht alle Sicherungsdaten. Bewahre auch die Originaldatei auf,
			da beim Import nicht alle Angaben übernommen werden.
		</p>
	</div>
</div>

<section aria-labelledby="bibles-heading">
	<div class="mb-3 flex items-baseline justify-between gap-3">
		<h2
			id="bibles-heading"
			class="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
		>
			Bibeln
		</h2>
		<span class="text-xs text-stone-500 dark:text-stone-400"
			>{data.bibles.length} {data.bibles.length === 1 ? 'Werk' : 'Werke'}</span
		>
	</div>
	{#if data.bibles.length === 0}
		<div
			class="rounded-xl border border-dashed border-stone-300 px-5 py-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400"
		>
			Es sind noch keine Bibeln vorhanden.
		</div>
	{:else}
		<ul class="space-y-3">
			{#each data.bibles as bible (bible.id)}
				<li
					class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900"
				>
					<div class="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
						<div class="flex min-w-0 items-start gap-3">
							<span
								class="dark:bg-accent-950/50 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700 dark:text-accent-300"
								aria-hidden="true"><Icon name="book-open" class="size-5" /></span
							>
							<div class="min-w-0">
								<h3 class="font-semibold text-stone-900 dark:text-stone-100">{bible.name}</h3>
								<p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{bible.id}</p>
							</div>
						</div>
						<span
							class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {bible.publicDownload &&
							bible.isPublic &&
							bible.status === 'ready'
								? 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300'
								: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'}"
						>
							<span
								class="size-1.5 rounded-full {bible.publicDownload &&
								bible.isPublic &&
								bible.status === 'ready'
									? 'bg-green-600 dark:bg-green-400'
									: 'bg-stone-400'}"
								aria-hidden="true"
							></span>
							{bible.publicDownload && bible.isPublic && bible.status === 'ready'
								? 'Öffentlicher Download freigegeben'
								: 'Nicht öffentlich herunterladbar'}
						</span>
					</div>
					<div
						class="grid border-t border-stone-100 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] dark:border-stone-800"
					>
						<div class="px-4 py-4 sm:px-5">
							<p
								class="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
							>
								Downloads
							</p>
							{#if bible.status === 'ready'}
								<div class="mt-3 flex flex-wrap gap-2">
									<a
										class="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 transition hover:border-accent-400 hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-accent-600 dark:hover:text-accent-300"
										href="/admin/bible-downloads/{encodeURIComponent(bible.id)}"
										><Icon name="download" class="size-4" />Sicherung herunterladen</a
									>
									<a
										class="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 transition hover:border-accent-400 hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-accent-600 dark:hover:text-accent-300"
										href="/admin/bible-downloads/{encodeURIComponent(bible.id)}?format=usx"
										><Icon name="download" class="size-4" />USX herunterladen</a
									>
								</div>
								<p class="mt-2 text-xs text-stone-500 dark:text-stone-400">
									Akribos-JSON zur Sicherung · USX für den Austausch
								</p>
							{:else}<p class="mt-2 text-sm text-stone-500 dark:text-stone-400">
									Downloads sind verfügbar, sobald der Import abgeschlossen ist.
								</p>{/if}
						</div>
						<div
							class="border-t border-stone-100 bg-stone-50/50 px-4 py-4 sm:px-5 md:border-t-0 md:border-l dark:border-stone-800 dark:bg-stone-950/20"
						>
							<p
								class="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400"
							>
								Öffentlicher Download
							</p>
							{#if bible.publicDownload}
								<form method="POST" action="?/visibility" class="mt-2">
									<input type="hidden" name="id" value={bible.id} />
									<input type="hidden" name="enable" value="no" />
									<p class="text-sm text-stone-600 dark:text-stone-300">
										{bible.isPublic && bible.status === 'ready'
											? 'Diese Bibel ist zum öffentlichen Download freigegeben.'
											: 'Der Download ist gesperrt, weil das Werk nicht öffentlich oder nicht bereit ist.'}
									</p>
									<button
										class="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
										>Freigabe aufheben</button
									>
								</form>
							{:else if bible.isPublic && bible.status === 'ready'}
								<form method="POST" action="?/visibility" class="mt-2">
									<input type="hidden" name="id" value={bible.id} />
									<input type="hidden" name="enable" value="yes" />
									<input type="hidden" name="resourceVersion" value={bible.version} />
									<label
										class="flex items-start gap-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300"
									>
										<input
											class="mt-1 size-4 shrink-0 accent-accent-600"
											type="checkbox"
											name="publicDomain"
											value="yes"
											required
										/>
										<span
											>Ich bestätige, dass dieses Werk gemeinfrei und zur Veröffentlichung
											freigegeben ist.</span
										>
									</label>
									<button
										class="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
										>Öffentlichen Download freigeben</button
									>
								</form>
							{:else}<p class="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
									Ein öffentlicher Download ist nur für öffentliche, fertig importierte Bibeln
									möglich.
								</p>{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
		Öffentliche Downloads enthalten nur freigegebene Prüfungen ohne personenbezogene Angaben. Gib
		nur gemeinfreie Bibeln frei, für die du die Veröffentlichung geprüft hast.
	</p>
</section>

<details
	class="group mt-8 rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
>
	<summary
		class="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden"
	>
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300"
			><Icon name="upload" class="size-4" /></span
		>
		<span class="min-w-0 flex-1"
			><span class="block text-sm font-semibold">Bibel aus Sicherung wiederherstellen</span><span
				class="mt-0.5 block text-xs font-normal text-stone-500 dark:text-stone-400"
				>Gespeicherte Akribos-JSON-Datei einlesen</span
			></span
		>
		<Icon
			name="chevron-down"
			class="size-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180"
		/>
	</summary>
	<div class="border-t border-stone-100 px-4 py-4 sm:px-5 dark:border-stone-800">
		<p class="max-w-3xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
			Der vorhandene Bibeltext und die Strong-Prüfungen mit derselben Kennung werden ersetzt. Die
			wiederhergestellte Bibel ist zunächst privat; eine öffentliche Downloadfreigabe wird
			aufgehoben. Eine bisher zugeordnete Quelldatei bleibt auf dem Server erhalten, ist danach aber
			nicht mehr mit dem Werk verknüpft. Andere Kontodaten und Rückmeldungen bleiben erhalten.
		</p>
		<form
			method="POST"
			action="?/restore"
			enctype="multipart/form-data"
			class="mt-4 flex flex-wrap items-end gap-3"
		>
			<label class="grid gap-1 text-sm font-medium"
				>Sicherungsdatei<input
					class="block max-w-full text-sm font-normal text-stone-600 file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium dark:text-stone-300 dark:file:border-stone-700 dark:file:bg-stone-900 dark:file:text-stone-100"
					type="file"
					name="file"
					accept=".json,application/json"
					required
				/></label
			>
			<label class="grid gap-1 text-sm font-medium"
				>Ressourcenkennung zur Bestätigung<input
					class="rounded-lg border border-stone-300 px-3 py-2 font-normal dark:border-stone-700 dark:bg-stone-950"
					type="text"
					name="confirm"
					required
				/></label
			>
			<button
				class="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
				>Wiederherstellen</button
			>
		</form>
	</div>
</details>
