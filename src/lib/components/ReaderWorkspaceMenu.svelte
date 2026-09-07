<script lang="ts">
	import { getContext, tick } from 'svelte';
	import {
		MAX_WORKSPACE_NAME_LENGTH,
		READER_WORKSPACE_CONTEXT,
		type ReaderWorkspaceCapture,
		type SavedWorkspaceSummary
	} from '$lib/reader/saved-workspaces';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';

	let { workspaces, reader }: { workspaces: SavedWorkspaceSummary[]; reader: boolean } = $props();
	const capture = getContext<ReaderWorkspaceCapture>(READER_WORKSPACE_CONTEXT);
	let entries = $derived(workspaces);
	let entriesGeneration = 0;
	let menu = $state<Menu>();
	let dialog = $state<HTMLDialogElement>();
	let nameInput = $state<HTMLInputElement>();
	let editing = $state(false);
	let selected = $state<SavedWorkspaceSummary | null>(null);
	let name = $state('');
	let replaceSnapshot = $state(false);
	let deleting = $state(false);
	let busy = $state(false);
	let message = $state('');
	let notice = $state('');
	const dialogTitle = $derived(
		deleting
			? 'Arbeitsbereich löschen'
			: selected
				? 'Arbeitsbereich bearbeiten'
				: 'Arbeitsbereich speichern'
	);

	async function refreshEntries(): Promise<void> {
		const generation = ++entriesGeneration;
		const response = await fetch('/api/reader/workspaces');
		if (!response.ok) return;
		const result = await response.json();
		if (generation === entriesGeneration) entries = result.workspaces;
	}

	function openMenu(event: MouseEvent): void {
		menu?.openAt(event.currentTarget as HTMLElement);
		if (menu?.isOpen()) void refreshEntries().catch(() => {});
	}

	async function edit(entry: SavedWorkspaceSummary | null): Promise<void> {
		menu?.close();
		selected = entry;
		name = entry?.name ?? '';
		replaceSnapshot = false;
		deleting = false;
		message = '';
		editing = true;
		await tick();
		dialog?.showModal();
		nameInput?.focus();
		nameInput?.select();
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		busy = true;
		entriesGeneration += 1;
		message = '';
		try {
			const snapshot =
				!deleting && (!selected || replaceSnapshot) ? capture.capture?.() : undefined;
			if (!deleting && (!selected || replaceSnapshot) && !snapshot) {
				throw new Error('Bitte öffne zuerst einen Arbeitsbereich im Reader.');
			}
			const response = await fetch(`/api/reader/workspaces${selected ? `/${selected.id}` : ''}`, {
				method: deleting ? 'DELETE' : selected ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, revision: selected?.revision, snapshot })
			});
			const result = await response.json();
			if (!response.ok)
				throw new Error(result.message ?? 'Der Arbeitsbereich konnte nicht gespeichert werden.');
			entries = entries.filter((entry) => entry.id !== result.workspace.id);
			if (!deleting)
				entries = [...entries, result.workspace].sort((a, b) => a.name.localeCompare(b.name, 'de'));
			notice = deleting
				? 'Arbeitsbereich gelöscht.'
				: `Arbeitsbereich „${result.workspace.name}“ gespeichert.`;
			dialog?.close();
		} catch (caught) {
			message = caught instanceof Error ? caught.message : 'Bitte versuche es erneut.';
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	class="workspace-trigger"
	aria-label="Arbeitsbereiche"
	title="Arbeitsbereiche"
	aria-haspopup="menu"
	aria-expanded={menu?.isOpen() ?? false}
	onclick={openMenu}
>
	<Icon name="book-open" class="size-4.5" />
	<span class="hidden sm:inline">Arbeitsbereiche</span>
	<Icon name="chevron-down" class="hidden size-3.5 sm:block" />
</button>

<Menu bind:this={menu} label="Arbeitsbereiche" minWidth="19rem">
	<p class="menu-caption">Gespeicherte Arbeitsbereiche</p>
	{#if entries.length === 0}
		<p class="empty-hint">Noch keine Arbeitsbereiche gespeichert.</p>
	{:else}
		{#each entries as entry (entry.id)}
			<div class="workspace-row" role="none">
				<a
					href={`/workspaces/${entry.id}`}
					role="menuitem"
					title={entry.name}
					onclick={() => menu?.close()}
					data-sveltekit-preload-data="off"
				>
					<span class="truncate">{entry.name}</span>
				</a>
				<button
					type="button"
					role="menuitem"
					class="edit-workspace"
					aria-label={`Arbeitsbereich „${entry.name}“ bearbeiten`}
					title="Bearbeiten"
					onclick={() => edit(entry)}
				>
					<Icon name="pencil" class="size-4" />
				</button>
			</div>
		{/each}
	{/if}
	<hr />
	{#if reader}
		<button type="button" role="menuitem" onclick={() => edit(null)}
			><Icon name="plus" class="size-4" />Aktuellen Arbeitsbereich speichern …</button
		>
	{:else}
		<p class="empty-hint">Neue Arbeitsbereiche kannst du im Reader speichern.</p>
	{/if}
</Menu>

<p role="status" class="sr-only">{notice}</p>

<dialog
	bind:this={dialog}
	class="workspace-dialog"
	aria-label={dialogTitle}
	onclose={() => {
		editing = false;
	}}
	oncancel={(event) => {
		if (busy) event.preventDefault();
	}}
>
	{#if editing}
		<form onsubmit={submit}>
			<div class="dialog-heading">
				<h2>{dialogTitle}</h2>
				<button
					type="button"
					class="icon-button"
					aria-label="Schließen"
					disabled={busy}
					onclick={() => dialog?.close()}><Icon name="x" class="size-5" /></button
				>
			</div>
			{#if deleting}
				<p>
					Gespeicherten Arbeitsbereich „{selected?.name}“ löschen? Deine geöffneten Tabs bleiben
					erhalten.
				</p>
			{:else}
				{#if !selected}<p>
						Speichert Kacheln, Tabs, Bibelstellen und offene Suchen in deinem Konto.
					</p>{/if}
				<label class="name-label" for="workspace-name">Name</label>
				<input
					bind:this={nameInput}
					id="workspace-name"
					bind:value={name}
					maxlength={MAX_WORKSPACE_NAME_LENGTH}
					required
					autocomplete="off"
					placeholder="z. B. Studium zum Römerbrief"
					disabled={busy}
				/>
				{#if selected && reader}
					<label class="replace-option"
						><input type="checkbox" bind:checked={replaceSnapshot} disabled={busy} />Gespeicherte
						Ansicht durch den aktuellen Arbeitsbereich ersetzen</label
					>
				{/if}
			{/if}
			{#if message}<p role="alert" class="error-message">{message}</p>{/if}
			<div class="dialog-actions">
				{#if selected && !deleting}<button
						type="button"
						class="delete-action"
						disabled={busy}
						onclick={() => {
							deleting = true;
							message = '';
						}}><Icon name="trash" class="size-4" />Löschen …</button
					>{/if}
				<button
					type="button"
					class="secondary-action"
					disabled={busy}
					onclick={() => {
						if (deleting) deleting = false;
						else dialog?.close();
					}}>Abbrechen</button
				>
				<button class:danger={deleting} class="primary-action" disabled={busy}
					>{busy ? 'Wird gespeichert …' : deleting ? 'Löschen' : 'Speichern'}</button
				>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.workspace-trigger {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.45rem;
		min-height: 2.25rem;
		padding: 0.45rem 0.6rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-stone-600);
		cursor: pointer;
	}
	.workspace-trigger:hover {
		background: var(--color-stone-100);
	}
	.menu-caption {
		padding: 0.4rem 0.6rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-stone-500);
	}
	.empty-hint {
		padding: 0.4rem 0.6rem;
		font-size: 0.78rem;
		color: var(--color-stone-500);
	}
	.workspace-row {
		display: flex;
		align-items: center;
	}
	.workspace-row a {
		min-width: 0;
		flex: 1;
	}
	.workspace-row .edit-workspace {
		flex: 0 0 2rem;
		width: 2rem;
		padding: 0.5rem;
	}
	.workspace-dialog {
		width: min(29rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		margin: auto;
		padding: 1.35rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.9rem;
		background: var(--surface-raised);
		color: var(--color-stone-800);
		box-shadow: 0 20px 60px rgb(0 0 0 / 0.2);
	}
	.workspace-dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.dialog-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	h2 {
		font-size: 1.05rem;
		font-weight: 650;
	}
	.icon-button {
		padding: 0.35rem;
		border-radius: 0.4rem;
		cursor: pointer;
	}
	.workspace-dialog p {
		font-size: 0.875rem;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.name-label {
		display: block;
		margin: 1rem 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
	}
	#workspace-name {
		width: 100%;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.5rem;
		background: var(--surface);
		font-size: 0.9rem;
	}
	.replace-option {
		display: flex;
		align-items: start;
		gap: 0.65rem;
		margin-top: 1rem;
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.replace-option input {
		margin-top: 0.2rem;
		flex-shrink: 0;
		accent-color: var(--color-accent-600);
	}
	.dialog-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}
	.dialog-actions button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.55rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.delete-action {
		margin-right: auto;
		color: var(--color-red-700);
	}
	.secondary-action {
		background: var(--color-stone-100);
	}
	.primary-action {
		background: var(--color-accent-600);
		color: white;
	}
	.primary-action.danger {
		background: var(--color-red-700);
	}
	.workspace-dialog .error-message {
		margin-top: 1rem;
		color: var(--color-red-700);
	}
	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}
	:global(.dark) .workspace-trigger {
		color: var(--color-stone-300);
	}
	:global(.dark) .workspace-trigger:hover,
	:global(.dark) .secondary-action {
		background: var(--color-stone-800);
	}
	:global(.dark) .workspace-dialog {
		border-color: var(--color-stone-700);
		color: var(--color-stone-100);
	}
	:global(.dark) #workspace-name {
		border-color: var(--color-stone-600);
	}
	:global(.dark) .delete-action,
	:global(.dark) .workspace-dialog .error-message {
		color: var(--color-red-400);
	}
</style>
