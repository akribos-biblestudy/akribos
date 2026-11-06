<script lang="ts">
	import { categories } from '$lib/feedback/model';
	import { FEEDBACK_ACTIVE_PAGE_KEY, FEEDBACK_PAGE_KEY } from '$lib/feedback/page-context';
	import { onMount, untrack } from 'svelte';
	let { data, form } = $props();
	let category = $state(untrack(() => form?.values?.category ?? 'content'));
	let device = $state('');
	let originatingPage = $state(untrack(() => form?.values?.page ?? data.sourcePage ?? ''));
	onMount(() => {
		device = `${navigator.platform || 'Unbekannt'}; Bildschirm ${window.screen.width} × ${window.screen.height}`;
		try {
			const previous = sessionStorage.getItem(FEEDBACK_PAGE_KEY);
			sessionStorage.removeItem(FEEDBACK_PAGE_KEY);
			if (form?.sent) {
				sessionStorage.removeItem(FEEDBACK_ACTIVE_PAGE_KEY);
			} else if (previous || form?.values?.page) {
				originatingPage = previous || form?.values?.page || '';
				sessionStorage.setItem(FEEDBACK_ACTIVE_PAGE_KEY, originatingPage);
			} else if (
				(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
					?.type === 'reload'
			) {
				originatingPage = sessionStorage.getItem(FEEDBACK_ACTIVE_PAGE_KEY) || originatingPage;
			} else {
				sessionStorage.removeItem(FEEDBACK_ACTIVE_PAGE_KEY);
			}
		} catch {
			// The server-side same-origin referrer fallback remains available without sessionStorage.
		}
	});
</script>

<svelte:head><title>Feedback – Akribos</title><meta name="robots" content="noindex" /></svelte:head>
<div class="mx-auto max-w-2xl px-4 py-8">
	<h1 class="text-2xl font-semibold">Feedback geben</h1>
	<p class="mt-2 text-sm text-stone-600 dark:text-stone-400">
		Hilf uns, Akribos und die enthaltenen Werke zu verbessern.
	</p>
	{#if form?.sent}
		<p
			role="status"
			class="mt-6 rounded-lg bg-green-50 p-4 text-green-900 dark:bg-green-950 dark:text-green-100"
		>
			Vielen Dank! Dein Feedback wurde gespeichert.
		</p>
		<a class="mt-4 inline-block underline" href="/feedback">Weiteres Feedback senden</a>
	{:else}
		{#if form?.error}<p role="alert" class="mt-5 rounded-lg bg-red-50 p-3 text-red-800">
				{form.error}
			</p>{/if}
		<form method="POST" enctype="multipart/form-data" class="mt-6 grid gap-4">
			<label class="grid gap-1 text-sm font-medium"
				>Art des Feedbacks
				<select
					name="category"
					bind:value={category}
					class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
				>
					{#each Object.entries(categories) as [value, label] (value)}<option {value}
							>{label}</option
						>{/each}
				</select>
			</label>
			<label class="grid gap-1 text-sm font-medium"
				>Werk {category === 'content' ? '(erforderlich)' : '(optional)'}
				<select
					name="resourceId"
					required={category === 'content'}
					class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
				>
					<option value="">Bitte wählen</option>
					{#each data.resources as resource (resource.id)}<option
							value={resource.id}
							selected={form?.values?.resourceId === resource.id}>{resource.name}</option
						>{/each}
				</select>
			</label>
			<label class="grid gap-1 text-sm font-medium"
				>Stelle {category === 'content' ? '(erforderlich)' : '(optional)'}
				<input
					name="location"
					maxlength="500"
					required={category === 'content'}
					value={form?.values?.location ?? ''}
					placeholder="z. B. Johannes 3,16 oder Strong G25, Abschnitt …"
					class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
				/>
				<span class="font-normal text-stone-500"
					>Bitte gib Bibelstelle, Strong-Nummer oder Abschnitt möglichst genau an.</span
				>
			</label>
			<label class="grid gap-1 text-sm font-medium"
				>Beschreibung
				<textarea
					name="description"
					required
					maxlength="10000"
					rows="5"
					class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
					>{form?.values?.description ?? ''}</textarea
				>
			</label>
			<label class="grid gap-1 text-sm font-medium"
				>Korrekturvorschlag (optional)
				<textarea
					name="suggestion"
					maxlength="5000"
					rows="3"
					class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
					>{form?.values?.suggestion ?? ''}</textarea
				>
			</label>
			<input type="hidden" name="page" value={originatingPage} />
			<label class="grid gap-1 text-sm font-medium"
				>Anhang oder Screenshot (optional, bis 3 MB)
				<input name="attachment" type="file" class="text-sm" />
			</label>
			<input type="hidden" name="device" value={device} />
			<p class="text-xs text-stone-500">
				Dein Konto, Browser- und Geräteangaben sowie die vollständige Adresse der vorherigen Seite
				werden mitgespeichert und sind nur in der Verwaltung sichtbar. Die Adresse kann persönliche
				Angaben enthalten. Bitte entferne vertrauliche Inhalte aus Screenshots. Du erhältst keine
				Benachrichtigung zum Bearbeitungsstand.
			</p>
			<button
				class="justify-self-start rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700"
				>Feedback senden</button
			>
		</form>
	{/if}
</div>
