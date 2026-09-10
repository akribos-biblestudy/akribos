<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const settings = $derived(form?.values ?? data.analytics);
</script>

<h1 class="text-2xl font-semibold">Umami-Analyse</h1>
<p class="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
	Konfiguriere eine vorhandene Umami-Instanz (Version 2.18 oder neuer). Besucher entscheiden vor dem
	Laden, ob sie die freiwillige Nutzungsanalyse erlauben.
</p>
<form method="POST" use:enhance class="mt-6 grid max-w-2xl gap-4">
	<label class="flex items-center gap-2"
		><input type="checkbox" name="enabled" checked={settings.enabled} /> Umami aktivieren</label
	>
	<label class="grid gap-1 text-sm"
		>Skript-Adresse (HTTPS)<input
			name="scriptUrl"
			type="url"
			value={settings.scriptUrl}
			placeholder="https://statistik.example.org/script.js"
			class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
		/></label
	>
	<label class="grid gap-1 text-sm"
		>Website-ID<input
			name="websiteId"
			value={settings.websiteId}
			class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
		/></label
	>
	<label class="grid gap-1 text-sm"
		>Betreiber der Umami-Instanz<input
			name="provider"
			value={settings.provider}
			maxlength="300"
			class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
		/></label
	>
	<label class="grid gap-1 text-sm"
		>Datenschutzhinweise des Betreibers (HTTPS)<input
			name="privacyUrl"
			type="url"
			value={settings.privacyUrl}
			class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
		/></label
	>
	<label class="grid gap-1 text-sm"
		>Verarbeitung und Speicherfristen beim Betreiber<textarea
			name="privacyDetails"
			rows="5"
			maxlength="4000"
			class="rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-950"
			>{settings.privacyDetails}</textarea
		></label
	>
	<p class="text-xs text-stone-500">
		Diese Angaben erscheinen in der Datenschutzerklärung. Beschreibe Hosting-Ort, Speicherfristen
		und gegebenenfalls Übermittlungen außerhalb der EU/des EWR. Die tatsächlichen Löschfristen
		werden beim Betreiber eingerichtet.
	</p>
	<p class="text-sm text-stone-600 dark:text-stone-400">
		Gezählt werden nur allgemeine Seitenbereiche wie Reader, Wortstudie und Hilfe. Suchbegriffe,
		Lesestellen, Ressourcen, Notizen, Konto- und Verwaltungsseiten werden nicht übertragen.
		Änderungen an dieser Konfiguration erfordern eine neue Entscheidung der Besucher.
	</p>
	<button
		type="submit"
		class="justify-self-start rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700"
		>Analyse-Einstellungen speichern</button
	>
	{#if form?.saved}<p role="status">Analyse-Einstellungen gespeichert.</p>{/if}
	{#if form?.error}<p role="alert" class="text-sm text-red-700">{form.error}</p>{/if}
</form>
