<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import BackupJobList from '$lib/components/admin/BackupJobList.svelte';
	import type { BackupJob } from '$lib/server/db/schema';

	let { data, form } = $props();

	const running = $derived(
		data.running ||
			data.jobs.some((job: BackupJob) => job.state === 'running' || job.state === 'queued')
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

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

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

	const weekdayLabels = [
		'Montag',
		'Dienstag',
		'Mittwoch',
		'Donnerstag',
		'Freitag',
		'Samstag',
		'Sonntag'
	];

	// --- S3 settings form state, seeded from the load data -----------------------
	let enabled = $state(data.settings.s3.enabled);
	let endpoint = $state(data.settings.s3.endpoint);
	let region = $state(data.settings.s3.region);
	let bucket = $state(data.settings.s3.bucket);
	let prefix = $state(data.settings.s3.prefix);
	let accessKeyId = $state(data.settings.s3.accessKeyId);
	let forcePathStyle = $state(data.settings.s3.forcePathStyle);
	let preset = $state(data.settings.schedule.preset);
	let hour = $state(data.settings.schedule.hour);
	let minute = $state(data.settings.schedule.minute);
	let weekday = $state(data.settings.schedule.weekday);
	let timeZone = $state(data.settings.schedule.timeZone);
	let keepRemote = $state(data.settings.retention.keepRemote);
	let keepLocal = $state(data.settings.retention.keepLocal);

	// --- restore upload state -----------------------------------------------------
	let uploadPercent = $state<number | null>(null);
	let stagedId = $state('');
	let uploadError = $state('');
	let uploadedFileLabel = $state('');
	let confirmText = $state('');

	function uploadRestoreFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		stagedId = '';
		uploadedFileLabel = '';
		uploadError = '';
		uploadPercent = 0;

		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/admin/backup/upload');
		// A `File`'s own MIME type is unset for a `.dump` file, and adapter-node needs a Content-Type
		// present to expose the request body as a stream at all.
		xhr.setRequestHeader('Content-Type', 'application/octet-stream');
		xhr.upload.addEventListener('progress', (event) => {
			if (event.lengthComputable) uploadPercent = Math.round((event.loaded / event.total) * 100);
		});
		xhr.addEventListener('load', () => {
			uploadPercent = null;
			try {
				const body = JSON.parse(xhr.responseText);
				if (xhr.status === 200) {
					stagedId = body.stagedId;
					uploadedFileLabel = `${file.name} (${formatBytes(body.sizeBytes)})`;
				} else {
					uploadError = body.message ?? 'Hochladen fehlgeschlagen.';
				}
			} catch {
				uploadError = 'Hochladen fehlgeschlagen.';
			}
		});
		xhr.addEventListener('error', () => {
			uploadPercent = null;
			uploadError = 'Hochladen fehlgeschlagen.';
		});
		xhr.send(file);
	}

	const confirmMatches = $derived(confirmText === data.restorePhrase);
	const canRestore = $derived(stagedId !== '' && confirmMatches);
</script>

<svelte:head><title>Backup — Akribos</title></svelte:head>

<h1 class="mb-1 text-2xl font-semibold tracking-tight">Backup und Wiederherstellung</h1>
<p class="mb-5 max-w-2xl text-sm text-stone-600 dark:text-stone-300">
	Sicherungen der gesamten Datenbank: sofort herunterladen oder automatisch nach S3-kompatiblem
	Speicher hochladen.
</p>

<nav aria-label="Bereiche auf dieser Seite" class="mb-5 flex flex-wrap gap-2 text-sm">
	<a
		href="#manual-backup"
		class="rounded-full bg-stone-100 px-3 py-1.5 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
		>Sofort-Backup</a
	>
	<a
		href="#automatic-backup"
		class="rounded-full bg-stone-100 px-3 py-1.5 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
		>Automatik</a
	>
	<a
		href="#backup-history"
		class="rounded-full bg-stone-100 px-3 py-1.5 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
		>Verlauf</a
	>
	<a
		href="#restore"
		class="rounded-full bg-red-50 px-3 py-1.5 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300"
		>Wiederherstellen</a
	>
</nav>

{#if !data.pgToolsAvailable}
	<p
		class="mb-4 max-w-2xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
		       dark:border-red-900 dark:bg-red-950 dark:text-red-200"
		role="alert"
	>
		pg_dump ist in dieser Umgebung nicht installiert. Backup und Wiederherstellung stehen erst zur
		Verfügung, wenn das Image die PostgreSQL-Client-Tools enthält.
	</p>
{/if}

<!-- Bestätigung für Wiederherstellung — gilt für jede Wiederherstellen-Aktion auf dieser Seite: den
     Datei-Upload unten, sowie "direkt wiederherstellen" bei den lokalen Kopien und den S3-Objekten. -->
<details
	id="restore-confirm"
	open={form?.restoreError === 'confirm'}
	class="group mb-5 max-w-2xl scroll-mt-24 rounded-xl border border-red-300 dark:border-red-900"
>
	<summary
		class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300 [&::-webkit-details-marker]:hidden"
	>
		<span>Bestätigung für Wiederherstellung</span><span
			class="transition-transform group-open:rotate-180">⌄</span
		>
	</summary>
	<div class="border-t border-red-200 p-4 dark:border-red-900">
		<p class="mb-3 text-sm text-stone-600 dark:text-stone-300">
			Gilt für jede Wiederherstellung auf dieser Seite. Eine Wiederherstellung ersetzt den gesamten
			Inhalt der Datenbank durch den Inhalt der gewählten Backup-Datei; vorher wird automatisch eine
			Sicherung des aktuellen Zustands erstellt.
		</p>
		<label class="mb-1 block text-xs font-medium" for="confirm-global">
			Zur Bestätigung <span class="font-mono">{data.restorePhrase}</span> eingeben:
		</label>
		<input
			id="confirm-global"
			bind:value={confirmText}
			autocomplete="off"
			class="w-full max-w-sm rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
		/>
		{#if form?.restoreError === 'confirm'}
			<p class="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
				Die Bestätigung stimmt nicht überein.
			</p>
		{/if}
	</div>
</details>

<!-- Sofort-Backup -->
<section
	id="manual-backup"
	class="mb-8 max-w-2xl scroll-mt-24 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"
>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Sofort-Backup</h2>
	<p class="mb-3 text-sm text-stone-600 dark:text-stone-300">
		Erstellt einen vollständigen Dump der Datenbank (pg_dump, Custom-Format) und lädt ihn direkt
		herunter. Bei einer großen Datenbank kann das eine Weile dauern.
	</p>
	<!-- Without data-sveltekit-reload, SvelteKit's client router treats this as an SPA navigation and
	     fetches __data.json (404, no +page here) instead of letting the browser download the file. -->
	<a
		href="/admin/backup/download"
		data-sveltekit-reload
		class="inline-block rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white
		       hover:bg-accent-700"
	>
		Backup herunterladen
	</a>
</section>

<!-- Automatisches Backup nach S3 -->
<section
	id="automatic-backup"
	class="mb-8 max-w-4xl scroll-mt-24 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900"
>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">
		Automatisches Backup nach S3
	</h2>

	{#if !data.encryptionAvailable}
		<p
			class="mb-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm
			       dark:border-stone-800 dark:bg-stone-900"
		>
			BACKUP_ENCRYPTION_KEY ist nicht gesetzt — automatische Backups nach S3 können nicht
			konfiguriert werden.
		</p>
	{/if}

	{#if form?.error && typeof form.error === 'string'}
		<p
			class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800
			       dark:border-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{form.error}
		</p>
	{/if}
	{#if form?.saved}
		<p
			class="mb-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900"
		>
			Einstellungen gespeichert.
		</p>
	{/if}
	{#if form?.tested === 'ok'}
		<p
			class="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
		>
			Verbindung erfolgreich — Bucket ist erreichbar und beschreibbar.
		</p>
	{:else if form?.tested === 'failed'}
		<p
			class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			Verbindung fehlgeschlagen: {form.message}
		</p>
	{/if}
	{#if form?.started}
		<p
			class="mb-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900"
		>
			Backup gestartet. Der Fortschritt erscheint im Verlauf unten.
		</p>
	{/if}

	<form method="POST" action="?/saveSettings" class="space-y-4">
		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				name="enabled"
				bind:checked={enabled}
				disabled={!data.encryptionAvailable}
			/>
			Automatische Backups aktiviert
		</label>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="mb-1 block text-xs font-medium" for="endpoint">Endpoint (URL)</label>
				<input
					id="endpoint"
					name="endpoint"
					bind:value={endpoint}
					placeholder="https://s3.eu-central-1.wasabisys.com"
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium" for="region">Region</label>
				<input
					id="region"
					name="region"
					bind:value={region}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium" for="bucket">Bucket</label>
				<input
					id="bucket"
					name="bucket"
					bind:value={bucket}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium" for="prefix">Pfad-Präfix</label>
				<input
					id="prefix"
					name="prefix"
					bind:value={prefix}
					placeholder="akribos/"
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium" for="accessKeyId">Access Key ID</label>
				<input
					id="accessKeyId"
					name="accessKeyId"
					bind:value={accessKeyId}
					autocomplete="off"
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium" for="secretAccessKey">Secret Access Key</label
				>
				<input
					id="secretAccessKey"
					name="secretAccessKey"
					type="password"
					autocomplete="off"
					placeholder={data.settings.s3.hasSecret ? 'unverändert' : ''}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
		</div>

		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" name="forcePathStyle" bind:checked={forcePathStyle} />
			Path-Style-Adressierung verwenden (für MinIO und die meisten S3-kompatiblen Dienste)
		</label>

		<div class="grid gap-3 sm:grid-cols-4">
			<div>
				<label class="mb-1 block text-xs font-medium" for="preset">Häufigkeit</label>
				<select
					id="preset"
					name="preset"
					bind:value={preset}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				>
					<option value="hourly">Stündlich</option>
					<option value="daily">Täglich</option>
					<option value="weekly">Wöchentlich</option>
				</select>
			</div>
			{#if preset === 'weekly'}
				<div>
					<label class="mb-1 block text-xs font-medium" for="weekday">Wochentag</label>
					<select
						id="weekday"
						name="weekday"
						bind:value={weekday}
						class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
					>
						{#each weekdayLabels as label, index (label)}
							<option value={index + 1}>{label}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if preset !== 'hourly'}
				<div>
					<label class="mb-1 block text-xs font-medium" for="time">Uhrzeit</label>
					<input
						id="time"
						type="time"
						value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
						onchange={(event) => {
							const [h, m] = event.currentTarget.value.split(':').map(Number);
							hour = h ?? 3;
							minute = m ?? 0;
						}}
						class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
					/>
					<input type="hidden" name="hour" value={hour} />
					<input type="hidden" name="minute" value={minute} />
				</div>
			{:else}
				<div>
					<label class="mb-1 block text-xs font-medium" for="minute">Minute</label>
					<input
						id="minute"
						name="minute"
						type="number"
						min="0"
						max="59"
						bind:value={minute}
						class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
					/>
				</div>
			{/if}
			<div>
				<label class="mb-1 block text-xs font-medium" for="timeZone">Zeitzone</label>
				<input
					id="timeZone"
					name="timeZone"
					bind:value={timeZone}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="mb-1 block text-xs font-medium" for="keepRemote">Aufbewahrung im Bucket</label
				>
				<input
					id="keepRemote"
					name="keepRemote"
					type="number"
					min="1"
					max="365"
					bind:value={keepRemote}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
				<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">Anzahl der Sicherungen.</p>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium" for="keepLocal">Lokale Kopien</label>
				<input
					id="keepLocal"
					name="keepLocal"
					type="number"
					min="0"
					max="20"
					bind:value={keepLocal}
					class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
				/>
				<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
					Zusätzlich im Volume des Servers aufbewahrt, als Sicherheitsnetz falls S3 nicht erreichbar
					ist.
				</p>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button
				type="submit"
				class="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
			>
				Speichern
			</button>
			<button
				type="submit"
				formaction="?/testConnection"
				class="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50
				       dark:border-stone-700 dark:hover:bg-stone-800"
			>
				Verbindung testen
			</button>
			<button
				type="submit"
				formaction="?/runNow"
				disabled={running || !data.settings.s3.enabled}
				class="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium enabled:hover:bg-stone-50
				       disabled:opacity-50 dark:border-stone-700 dark:enabled:hover:bg-stone-800"
			>
				Jetzt sichern
			</button>
		</div>
	</form>

	<p class="mt-3 text-xs text-stone-500 dark:text-stone-400">
		{#if data.nextRunAt}
			Nächste Sicherung: {dateFormat.format(new Date(data.nextRunAt))}
		{/if}
		{#if data.lastRunAt}
			· Letzte erfolgreiche: {dateFormat.format(new Date(data.lastRunAt))}
		{/if}
	</p>

	{#if data.localBackups.length > 0}
		<div class="mt-4 border-t border-stone-200 pt-3 dark:border-stone-800">
			<h3 class="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
				Lokale Kopien
			</h3>
			<ul class="space-y-1 text-sm">
				{#each data.localBackups as backup (backup.name)}
					<li class="flex flex-wrap items-center justify-between gap-2">
						<span>{backup.name} — {formatBytes(backup.size)}</span>
						<div class="flex items-center gap-3">
							<!-- data-sveltekit-reload: see the note on the "Sofort-Backup" download link above. -->
							<a
								href={`/admin/backup/download/local/${backup.name}`}
								data-sveltekit-reload
								class="text-xs text-accent-700 underline dark:text-accent-300"
							>
								herunterladen
							</a>
							<form method="POST" action="?/restoreLocal">
								<input type="hidden" name="name" value={backup.name} />
								<input type="hidden" name="confirm" value={confirmText} />
								<button
									type="submit"
									disabled={!confirmMatches || running}
									class="text-xs text-red-700 underline enabled:hover:text-red-800
									       disabled:opacity-50 dark:text-red-300"
								>
									direkt wiederherstellen
								</button>
							</form>
							<form method="POST" action="?/deleteLocal">
								<input type="hidden" name="name" value={backup.name} />
								<button type="submit" class="text-xs text-red-700 underline dark:text-red-300">
									löschen
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="mt-4 border-t border-stone-200 pt-3 dark:border-stone-800">
		<form method="POST" action="?/listRemote">
			<button
				type="submit"
				class="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50
				       dark:border-stone-700 dark:hover:bg-stone-800"
			>
				Liste im Bucket aktualisieren
			</button>
		</form>
		{#if form?.remoteError}
			<p class="mt-2 text-xs text-red-700 dark:text-red-300">{form.remoteError}</p>
		{/if}
		{#if form?.remote}
			<div class="overflow-x-auto">
				<table class="mt-2 w-full text-xs">
					<thead>
						<tr class="text-left text-stone-500 dark:text-stone-400">
							<th class="pb-1 font-medium">Datei</th>
							<th class="pb-1 font-medium">Größe</th>
							<th class="pb-1 font-medium">Datum</th>
							<th class="pb-1 font-medium"></th>
							<th class="pb-1 font-medium"></th>
						</tr>
					</thead>
					<tbody>
						{#each form.remote as object (object.key)}
							<tr class:opacity-50={object.expired}>
								<td class="py-0.5">{object.key}</td>
								<td class="py-0.5">{formatBytes(object.size)}</td>
								<td class="py-0.5">{dateFormat.format(new Date(object.lastModified))}</td>
								<td class="py-0.5 text-right whitespace-nowrap">
									<a
										href={`/admin/backup/download/s3?key=${encodeURIComponent(object.key)}`}
										data-sveltekit-reload
										class="text-accent-700 underline dark:text-accent-300"
									>
										herunterladen
									</a>
								</td>
								<td class="py-0.5 text-right whitespace-nowrap">
									<form method="POST" action="?/restoreS3">
										<input type="hidden" name="key" value={object.key} />
										<input type="hidden" name="confirm" value={confirmText} />
										<button
											type="submit"
											disabled={!confirmMatches || running}
											class="text-red-700 underline enabled:hover:text-red-800
											       disabled:opacity-50 dark:text-red-300"
										>
											direkt wiederherstellen
										</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>

<!-- Verlauf -->
<section id="backup-history" class="mb-8 max-w-4xl scroll-mt-24">
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">Verlauf</h2>
	<BackupJobList jobs={data.jobs} />
</section>

<!-- Wiederherstellen -->
<section
	id="restore"
	class="max-w-2xl scroll-mt-24 rounded-xl border border-red-300 p-4 dark:border-red-900"
>
	<h2 class="mb-2 text-sm font-semibold tracking-wide text-red-700 uppercase dark:text-red-300">
		Wiederherstellen
	</h2>
	<p class="mb-3 text-sm text-stone-600 dark:text-stone-300">
		Ersetzt den gesamten Inhalt der Datenbank durch den Inhalt der Backup-Datei. Vorher wird
		automatisch eine Sicherung des aktuellen Zustands erstellt; ohne diese Sicherung wird die
		Wiederherstellung nicht ausgeführt. Alle Nutzerdaten, Listen und Notizen entsprechen danach dem
		Stand des Backups. Möglicherweise musst du dich anschließend neu anmelden.
	</p>
	<p class="mb-3 text-xs text-stone-500">
		Die Bestätigungsphrase wird im Abschnitt <a href="#restore-confirm" class="underline"
			>Bestätigung für Wiederherstellung</a
		> eingegeben.
	</p>

	{#if form?.restoreError && form.restoreError !== 'confirm' && typeof form.restoreError === 'string'}
		<p class="mb-3 text-sm text-red-700 dark:text-red-300" role="alert">{form.restoreError}</p>
	{/if}
	{#if form?.restoreStarted}
		<p class="mb-3 text-sm">
			Wiederherstellung gestartet. Der Fortschritt erscheint im Verlauf oben.
		</p>
	{/if}

	<form method="POST" action="?/restore" class="space-y-3">
		<div>
			<label class="mb-1 block text-xs font-medium" for="file">Backup-Datei (.dump)</label>
			<input
				id="file"
				type="file"
				accept=".dump"
				onchange={uploadRestoreFile}
				class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm file:mr-3 file:rounded
				       file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-xs
				       dark:border-stone-700 dark:file:bg-stone-800"
			/>
			{#if uploadPercent !== null}
				<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">Hochladen … {uploadPercent}%</p>
			{:else if uploadedFileLabel}
				<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">{uploadedFileLabel}</p>
			{:else if uploadError}
				<p class="mt-1 text-xs text-red-700 dark:text-red-300">{uploadError}</p>
			{/if}
		</div>
		<input type="hidden" name="stagedId" value={stagedId} />
		<input type="hidden" name="confirm" value={confirmText} />
		<p class="text-xs text-stone-500 dark:text-stone-400">Bestätigungsphrase siehe oben.</p>

		<button
			type="submit"
			disabled={!canRestore || running}
			class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-red-700
			       disabled:opacity-50"
		>
			Endgültig wiederherstellen
		</button>
	</form>
</section>
