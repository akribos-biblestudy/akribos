<script lang="ts">
	let { data, form } = $props();

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' });
	let query = $state('');
	let filter = $state('all');
	const visibleUsers = $derived.by(() => {
		const needle = query.trim().toLocaleLowerCase('de');
		return data.users.filter((user) => {
			if (filter === 'admin' && user.role !== 'admin') return false;
			if (filter === 'disabled' && !user.disabledAt) return false;
			if (filter === 'unverified' && user.emailVerifiedAt) return false;
			if (filter === 'active' && (user.disabledAt || !user.emailVerifiedAt)) return false;
			return (
				!needle ||
				[user.email, user.displayName].some((value) =>
					value?.toLocaleLowerCase('de').includes(needle)
				)
			);
		});
	});
</script>

<svelte:head><title>Nutzer — Akribos</title></svelte:head>

<header class="mb-5">
	<h1 class="text-2xl font-semibold tracking-tight">Nutzer</h1>
	<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
		Konten finden, Rollen vergeben und Zugänge verwalten.
	</p>
</header>

{#if form?.error === 'self'}
	<p class="mb-4 text-sm text-red-700 dark:text-red-300" role="alert">
		Das eigene Konto kann nicht geändert werden.
	</p>
{/if}

{#if form?.resetLink}
	<div
		class="mb-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm dark:border-stone-800 dark:bg-stone-900"
	>
		<p class="mb-1">Einmal-Link zum Zurücksetzen (eine Stunde gültig):</p>
		<input
			readonly
			value={form.resetLink}
			onclick={(event) => event.currentTarget.select()}
			class="w-full rounded border border-stone-300 px-2 py-1 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
		/>
	</div>
{/if}

{#if form?.verifyLink}
	<div
		class="mb-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm dark:border-stone-800 dark:bg-stone-900"
	>
		<p class="mb-1">Einmal-Link zur Aktivierung (24 Stunden gültig):</p>
		<input
			readonly
			value={form.verifyLink}
			onclick={(event) => event.currentTarget.select()}
			class="w-full rounded border border-stone-300 px-2 py-1 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
		/>
	</div>
{/if}

<div
	class="mb-3 flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-900/40"
>
	<label class="sr-only" for="user-search">Nutzer durchsuchen</label>
	<input
		id="user-search"
		type="search"
		bind:value={query}
		placeholder="E-Mail oder Name …"
		class="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm sm:max-w-sm dark:border-stone-700 dark:bg-stone-950"
	/>
	<label class="sr-only" for="user-filter">Nutzerstatus</label>
	<select
		id="user-filter"
		bind:value={filter}
		class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
	>
		<option value="all">Alle Konten</option>
		<option value="active">Aktiv</option>
		<option value="admin">Verwaltung</option>
		<option value="unverified">Nicht aktiviert</option>
		<option value="disabled">Gesperrt</option>
	</select>
	<span class="text-xs text-stone-500 sm:ml-auto"
		>{visibleUsers.length} von {data.users.length}</span
	>
</div>

<div class="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
	<table class="w-full text-sm">
		<thead
			class="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-900 dark:text-stone-400"
		>
			<tr>
				<th class="px-3 py-2">E-Mail</th>
				<th class="px-3 py-2">Name</th>
				<th class="px-3 py-2">Rolle</th>
				<th class="px-3 py-2 text-right">Listen</th>
				<th class="px-3 py-2">Registriert</th>
				<th class="px-3 py-2">Zuletzt aktiv</th>
				<th class="px-3 py-2"></th>
			</tr>
		</thead>
		<tbody class="divide-y divide-stone-200 dark:divide-stone-800">
			{#each visibleUsers as user (user.id)}
				<tr class:opacity-50={user.disabledAt}>
					<td class="px-3 py-2.5">
						{user.email}
						{#if !user.emailVerifiedAt}
							<span class="ml-1 text-xs text-amber-700 dark:text-amber-400">(nicht aktiviert)</span>
						{/if}
					</td>
					<td class="px-3 py-2.5">{user.displayName ?? '—'}</td>
					<td class="px-3 py-2.5">
						<form method="POST" action="?/role" class="flex items-center gap-1">
							<input type="hidden" name="userId" value={user.id} />
							<select
								name="role"
								class="rounded border border-stone-300 px-1 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-900"
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
								<option value="user" selected={user.role === 'user'}>Nutzer</option>
								<option value="admin" selected={user.role === 'admin'}>Verwaltung</option>
							</select>
						</form>
					</td>
					<td class="px-3 py-2.5 text-right tabular-nums">{user.listCount}</td>
					<td class="px-3 py-2.5 text-xs">{dateFormat.format(new Date(user.createdAt))}</td>
					<td class="px-3 py-2.5 text-xs">
						{user.lastLoginAt ? dateFormat.format(new Date(user.lastLoginAt)) : '—'}
					</td>
					<td class="px-3 py-2.5">
						<div class="flex gap-2">
							<form method="POST" action="?/reset">
								<input type="hidden" name="userId" value={user.id} />
								<button type="submit" class="text-xs text-accent-600 hover:underline">
									Passwort-Link
								</button>
							</form>
							{#if !user.emailVerifiedAt}
								<form method="POST" action="?/verify">
									<input type="hidden" name="userId" value={user.id} />
									<button type="submit" class="text-xs text-accent-600 hover:underline">
										Aktivierungslink
									</button>
								</form>
							{/if}
							<form method="POST" action="?/disable">
								<input type="hidden" name="userId" value={user.id} />
								<input type="hidden" name="disabled" value={user.disabledAt ? 'false' : 'true'} />
								<button
									type="submit"
									class="text-xs text-red-700 hover:underline dark:text-red-300"
								>
									{user.disabledAt ? 'aktivieren' : 'sperren'}
								</button>
							</form>
						</div>
					</td>
				</tr>
			{/each}
			{#if visibleUsers.length === 0}
				<tr
					><td colspan="7" class="px-3 py-8 text-center text-sm text-stone-500"
						>Keine passenden Konten.</td
					></tr
				>
			{/if}
		</tbody>
	</table>
</div>
