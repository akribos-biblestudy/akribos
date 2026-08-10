<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { formatNumber, t, type MessageKey } from '$lib/i18n';

	let { data, form } = $props();

	const CATEGORY_ORDER = ['bible', 'commentary', 'xrefs', 'lexicon', 'morphology'] as const;
	const GROUP_LABELS: Record<string, string> = {
		bible: 'Bibeln',
		commentary: 'Kommentare',
		xrefs: 'Parallelstellen',
		lexicon: 'Lexika',
		morphology: 'Morphologie'
	};

	let query = $state('');
	let activeKind = $state<string>('all');
	let selectedId = $state<string | null>(page.url.searchParams.get('resource'));
	let deleting = $state(false);

	const selectedResource = $derived(
		data.resources.find((resource) => resource.id === selectedId) ?? data.resources[0] ?? null
	);
	const bibles = $derived(data.resources.filter((resource) => resource.kind === 'bible'));
	const counts = $derived(
		new Map(
			CATEGORY_ORDER.map((kind) => [
				kind,
				data.resources.filter((resource) => resource.kind === kind).length
			])
		)
	);
	const visibleResources = $derived.by(() => {
		const needle = query.trim().toLocaleLowerCase('de');
		return data.resources.filter((resource) => {
			if (activeKind !== 'all' && resource.kind !== activeKind) return false;
			if (!needle) return true;
			return [
				resource.id,
				resource.name,
				resource.abbrev,
				resource.coverTitle,
				resource.tabTitle,
				resource.selectionTitle,
				resource.selectionSubtitle,
				resource.language
			].some((value) => value?.toLocaleLowerCase('de').includes(needle));
		});
	});

	const kindLabel = (kind: string) => t(`resource.kind.${kind}` as MessageKey);

	async function selectResource(id: string): Promise<void> {
		selectedId = id;
		deleting = false;
		const url = new URL(page.url);
		url.searchParams.set('resource', id);
		replaceState(url, page.state);
		await tick();
		if (window.matchMedia('(max-width: 1023px)').matches) {
			document
				.getElementById('resource-editor')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}
</script>

<svelte:head><title>Ressourcen — Akribos</title></svelte:head>

<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Ressourcen</h1>
		<p class="mt-1 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
			Werke finden, anordnen und ihre Darstellung im Reader festlegen.
		</p>
	</div>
	<div class="flex gap-2">
		<a
			href="/admin/import"
			class="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-700"
		>
			Ressource importieren
		</a>
		<form method="POST" action="?/refresh">
			<button
				type="submit"
				class="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
				title="Statistiken und Suchwortliste neu berechnen"
			>
				Statistiken aktualisieren
			</button>
		</form>
	</div>
</header>

{#if form?.refreshed || form?.deleted || form?.saved}
	<div
		class="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
		role="status"
	>
		{#if form.refreshed}
			Statistiken wurden neu berechnet.
		{:else if form.deleted}
			{form.deleted} wurde gelöscht.{#if form.transferredComments}
				{formatNumber(form.transferredComments)} Kommentare wurden übertragen.
			{/if}
		{:else}
			{form.saved} wurde gespeichert.
		{/if}
	</div>
{/if}
{#if form?.error === 'replacement'}
	<p
		class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
		role="alert"
	>
		Bitte eine andere Bibelübersetzung als Ziel für die Kommentare auswählen.
	</p>
{/if}

{#if data.resources.length === 0}
	<div
		class="rounded-xl border border-dashed border-stone-300 p-8 text-center dark:border-stone-700"
	>
		<p class="font-medium">Noch keine Ressourcen</p>
		<p class="mt-1 text-sm text-stone-500">
			Importiere zuerst eine Bibel oder ein Nachschlagewerk.
		</p>
		<a
			class="mt-4 inline-block rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white"
			href="/admin/import">Jetzt importieren</a
		>
	</div>
{:else}
	<div class="grid items-start gap-5 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
		<aside
			class="rounded-xl border border-stone-200 bg-stone-50/60 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] dark:border-stone-800 dark:bg-stone-900/40"
		>
			<div class="border-b border-stone-200 p-3 dark:border-stone-800">
				<label class="sr-only" for="resource-search">Ressourcen durchsuchen</label>
				<div class="relative">
					<svg
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
						class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
					>
						<path
							fill-rule="evenodd"
							d="M9 3.5a5.5 5.5 0 1 0 3.66 9.605l3.617 3.618a.75.75 0 1 0 1.06-1.06l-3.617-3.618A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
							clip-rule="evenodd"
						/>
					</svg>
					<input
						id="resource-search"
						type="search"
						bind:value={query}
						placeholder="Titel, Kürzel oder Sprache …"
						class="w-full rounded-lg border border-stone-300 bg-white py-2 pr-3 pl-9 text-sm focus:border-accent-500 focus:ring-3 focus:ring-accent-500/10 focus:outline-none dark:border-stone-700 dark:bg-stone-950"
					/>
				</div>
				<div class="mt-2 flex gap-1 overflow-x-auto pb-1">
					<button
						type="button"
						onclick={() => (activeKind = 'all')}
						class="shrink-0 rounded-full px-2.5 py-1 text-xs"
						class:bg-accent-600={activeKind === 'all'}
						class:text-white={activeKind === 'all'}
						class:bg-stone-200={activeKind !== 'all'}
						class:dark:bg-stone-800={activeKind !== 'all'}
					>
						Alle <span class="opacity-70">{data.resources.length}</span>
					</button>
					{#each CATEGORY_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0) as kind (kind)}
						<button
							type="button"
							onclick={() => (activeKind = kind)}
							class="shrink-0 rounded-full px-2.5 py-1 text-xs"
							class:bg-accent-600={activeKind === kind}
							class:text-white={activeKind === kind}
							class:bg-stone-200={activeKind !== kind}
							class:dark:bg-stone-800={activeKind !== kind}
						>
							{GROUP_LABELS[kind]} <span class="opacity-70">{counts.get(kind)}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="max-h-[24rem] overflow-y-auto lg:max-h-[calc(100dvh-var(--header-height)-13rem)]">
				{#if visibleResources.length === 0}
					<p class="p-5 text-center text-sm text-stone-500">Keine passende Ressource.</p>
				{:else}
					<ul class="divide-y divide-stone-200 dark:divide-stone-800">
						{#each visibleResources as resource (resource.id)}
							{@const peers = data.resources.filter((item) => item.kind === resource.kind)}
							{@const position = peers.findIndex((item) => item.id === resource.id)}
							<li
								class="flex items-stretch"
								class:bg-white={selectedResource?.id === resource.id}
								class:dark:bg-stone-950={selectedResource?.id === resource.id}
							>
								<button
									type="button"
									aria-label="{resource.id} bearbeiten"
									aria-pressed={selectedResource?.id === resource.id}
									onclick={() => selectResource(resource.id)}
									class="min-w-0 flex-1 px-3 py-3 text-left hover:bg-stone-100 dark:hover:bg-stone-800/70"
								>
									<span class="flex items-center gap-2">
										<span class="truncate text-sm font-semibold"
											>{resource.selectionTitle ?? resource.name}</span
										>
										{#if !resource.isPublic}<span
												class="rounded bg-stone-200 px-1.5 py-0.5 text-[0.62rem] text-stone-600 dark:bg-stone-800 dark:text-stone-300"
												>privat</span
											>{/if}
									</span>
									<span
										class="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"
									>
										<span class="font-mono">{resource.id}</span><span>·</span><span
											>{GROUP_LABELS[resource.kind]}</span
										>
									</span>
								</button>
								<div class="flex w-8 shrink-0 flex-col justify-center gap-0.5 pr-1">
									<form method="POST" action="?/move">
										<input type="hidden" name="id" value={resource.id} /><input
											type="hidden"
											name="direction"
											value="up"
										/>
										<button
											type="submit"
											disabled={position === 0}
											aria-label="{resource.id} nach oben"
											class="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-200 disabled:opacity-20 dark:hover:bg-stone-800"
											>↑</button
										>
									</form>
									<form method="POST" action="?/move">
										<input type="hidden" name="id" value={resource.id} /><input
											type="hidden"
											name="direction"
											value="down"
										/>
										<button
											type="submit"
											disabled={position === peers.length - 1}
											aria-label="{resource.id} nach unten"
											class="flex size-7 items-center justify-center rounded text-stone-500 hover:bg-stone-200 disabled:opacity-20 dark:hover:bg-stone-800"
											>↓</button
										>
									</form>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</aside>

		{#if selectedResource}
			<section
				id="resource-editor"
				class="scroll-mt-24 rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900"
			>
				<div
					class="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-4 sm:px-5 dark:border-stone-800"
				>
					<div class="min-w-0">
						<p
							class="text-xs font-semibold tracking-wide text-accent-700 uppercase dark:text-accent-300"
						>
							{GROUP_LABELS[selectedResource.kind]}
						</p>
						<h2 class="mt-0.5 truncate text-xl font-semibold">
							{selectedResource.selectionTitle ?? selectedResource.name}
						</h2>
						<p class="mt-1 font-mono text-xs text-stone-500">{selectedResource.id}</p>
					</div>
					<div class="text-right text-xs text-stone-500 dark:text-stone-400">
						<p>{kindLabel(selectedResource.kind)} · {selectedResource.language}</p>
						{#if selectedResource.kind === 'bible'}
							<p class="mt-1">
								{formatNumber(selectedResource.verseCount)} Verse{#if selectedResource.hasStrongs}
									· {formatNumber(selectedResource.wordCount)} Strong-Wörter{/if}
							</p>
						{:else}<p class="mt-1">{formatNumber(selectedResource.wordCount)} Einträge</p>{/if}
					</div>
				</div>

				<form method="POST" action="?/save" class="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
					<input type="hidden" name="id" value={selectedResource.id} />
					<div>
						<label class="mb-1 block text-xs font-medium" for="cover-{selectedResource.id}"
							>Cover-Titel</label
						>
						<input
							id="cover-{selectedResource.id}"
							name="coverTitle"
							value={selectedResource.coverTitle ?? selectedResource.abbrev}
							class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
						/>
						<p class="mt-1 text-xs text-stone-500">Auf dem Buchcover in der Werkauswahl.</p>
					</div>
					<div>
						<label class="mb-1 block text-xs font-medium" for="tab-{selectedResource.id}"
							>Tab-Titel</label
						>
						<input
							id="tab-{selectedResource.id}"
							name="tabTitle"
							value={selectedResource.tabTitle ?? selectedResource.abbrev}
							class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
						/>
						<p class="mt-1 text-xs text-stone-500">Kurzer Name über der Reader-Spalte.</p>
					</div>
					<div>
						<label
							class="mb-1 block text-xs font-medium"
							for="selection-title-{selectedResource.id}">Titel in der Auswahl</label
						>
						<input
							id="selection-title-{selectedResource.id}"
							name="selectionTitle"
							value={selectedResource.selectionTitle ?? selectedResource.name}
							class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
						/>
					</div>
					<div>
						<label
							class="mb-1 block text-xs font-medium"
							for="selection-subtitle-{selectedResource.id}">Untertitel in der Auswahl</label
						>
						<input
							id="selection-subtitle-{selectedResource.id}"
							name="selectionSubtitle"
							value={selectedResource.selectionSubtitle ?? selectedResource.abbrev}
							class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
						/>
					</div>

					<div class="sm:col-span-2">
						<label class="mb-1 block text-xs font-medium" for="license-{selectedResource.id}"
							>Rechtehinweis</label
						>
						<textarea
							id="license-{selectedResource.id}"
							name="licenseHtml"
							rows="3"
							class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
							>{selectedResource.licenseHtml ?? ''}</textarea
						>
						<p class="mt-1 text-xs text-stone-500">
							Wird unter der entsprechenden Reader-Spalte angezeigt.
						</p>
					</div>

					<div
						class="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4 sm:col-span-2 dark:border-stone-800"
					>
						<label class="flex items-center gap-2 text-sm"
							><input
								type="checkbox"
								name="isPublic"
								checked={selectedResource.isPublic}
								class="size-4"
							/> Öffentlich sichtbar</label
						>
						<button
							type="submit"
							class="ml-auto rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
							>Änderungen speichern</button
						>
					</div>
				</form>

				<div class="border-t border-stone-200 px-4 py-3 sm:px-5 dark:border-stone-800">
					<button
						type="button"
						class="text-sm text-red-700 hover:underline dark:text-red-300"
						onclick={() => (deleting = !deleting)}
						>{deleting ? 'Löschen abbrechen' : 'Ressource löschen …'}</button
					>
					{#if deleting}
						<form
							method="POST"
							action="?/delete"
							class="mt-3 grid gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm sm:grid-cols-2 dark:border-red-900 dark:bg-red-950"
						>
							<input type="hidden" name="id" value={selectedResource.id} />
							{#if selectedResource.kind === 'bible'}
								<label>
									<span class="mb-1 block font-medium">Kommentare verschieben nach</span>
									<select
										name="replacementId"
										required
										class="w-full rounded border border-red-300 px-2 py-1.5 dark:border-red-800 dark:bg-stone-900"
									>
										<option value="">Bibelübersetzung auswählen …</option>
										{#each bibles.filter((bible) => bible.id !== selectedResource.id) as bible (bible.id)}
											<option value={bible.id}>{bible.selectionTitle ?? bible.name}</option>
										{/each}
									</select>
								</label>
								<p class="self-end text-xs text-stone-600 dark:text-stone-300">
									{formatNumber(selectedResource.commentCount)} private Kommentare werden sicher übertragen.
								</p>
							{/if}
							<label class={selectedResource.kind === 'bible' ? 'sm:col-span-2' : ''}>
								<span class="mb-1 block"
									>Zur Bestätigung <span class="font-mono font-semibold">{selectedResource.id}</span
									> eingeben:</span
								>
								<input
									name="confirm"
									autocomplete="off"
									class="w-full rounded border border-red-300 px-2 py-1.5 font-mono dark:border-red-800 dark:bg-stone-900"
								/>
							</label>
							<button
								type="submit"
								disabled={selectedResource.kind === 'bible' && bibles.length < 2}
								class="w-fit rounded-lg bg-red-700 px-3 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
								>Endgültig löschen</button
							>
							{#if selectedResource.kind === 'bible' && bibles.length < 2}<p
									class="text-xs text-red-700 dark:text-red-300"
								>
									Die letzte Bibel kann ohne Zielübersetzung nicht gelöscht werden.
								</p>{/if}
						</form>
					{/if}
				</div>
			</section>
		{/if}
	</div>
{/if}
