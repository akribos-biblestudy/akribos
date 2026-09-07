<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { MAX_SERMON_COLUMN_NAME_LENGTH, type SermonColumn } from '$lib/notes/sermon-board';
	let { board }: { board: { columns: SermonColumn[]; revision: number } } = $props();
	let saving = $state(false);
	let message = $state('');
	const errors: Record<string, string> = {
		boardConflict:
			'Die Spalten wurden inzwischen geändert. Die aktuelle Ansicht wurde geladen; bitte erneut versuchen.',
		columnMissing: 'Diese Spalte ist nicht mehr verfügbar.',
		columnName: 'Bitte einen eindeutigen Namen mit 1 bis 80 Zeichen eingeben.',
		columnLimit: 'Es können höchstens 30 Spalten angelegt werden.',
		lastColumn: 'Mindestens eine Spalte muss erhalten bleiben.',
		columnTarget: 'Bitte eine andere Zielspalte auswählen.'
	};
	const save: SubmitFunction = ({ formElement }) => {
		saving = true;
		message = '';
		return async ({ result }) => {
			try {
				if (result.type === 'success') {
					if (formElement.dataset.create) formElement.reset();
				} else {
					const error = result.type === 'failure' ? result.data?.error : null;
					message = errors[String(error)] ?? 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
				}
				await invalidateAll();
			} finally {
				saving = false;
			}
		};
	};
</script>

<section
	class="mt-5 rounded-2xl border border-stone-200 bg-[var(--surface)] p-5 dark:border-white/10"
	aria-label="Spalten bearbeiten"
>
	<h2 class="font-serif text-lg font-semibold">Deine Spalten</h2>
	<p class="mt-1 text-sm text-stone-500">
		Namen und Reihenfolge gelten für dein Konto. Neue Ausarbeitungen starten in der ersten Spalte.
	</p>
	{#if message}<p class="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
			{message}
		</p>{/if}
	<ol class="mt-4 space-y-3">
		{#each board.columns as column, index (column.id)}
			<li class="rounded-xl bg-stone-100/70 p-3 dark:bg-white/5" data-column-id={column.id}>
				<form
					method="POST"
					action="?/columns"
					use:enhance={save}
					class="flex flex-wrap items-center gap-2"
					aria-label="Spalte {column.name} bearbeiten"
				>
					<input type="hidden" name="boardRevision" value={board.revision} />
					<input type="hidden" name="columnId" value={column.id} />
					<input
						name="name"
						value={column.name}
						aria-label="Spaltenname"
						maxlength={MAX_SERMON_COLUMN_NAME_LENGTH}
						required
						class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-stone-600"
					/>
					<button name="columnAction" value="rename" disabled={saving} class="control"
						>Speichern</button
					>
					<button
						name="columnAction"
						value="left"
						disabled={saving || index === 0}
						aria-label="{column.name} nach links"
						class="control"><Icon name="chevron-left" class="size-4" /></button
					>
					<button
						name="columnAction"
						value="right"
						disabled={saving || index === board.columns.length - 1}
						aria-label="{column.name} nach rechts"
						class="control"><Icon name="chevron-right" class="size-4" /></button
					>
				</form>
				{#if board.columns.length > 1}
					<details class="mt-2 text-sm">
						<summary class="w-fit cursor-pointer text-stone-500">Spalte löschen</summary>
						<form
							method="POST"
							action="?/columns"
							use:enhance={save}
							class="mt-3 flex flex-wrap items-end gap-3"
							aria-label="Spalte {column.name} löschen"
						>
							<input type="hidden" name="boardRevision" value={board.revision} />
							<input type="hidden" name="columnId" value={column.id} />
							<input type="hidden" name="columnAction" value="delete" />
							<label class="grid gap-1"
								><span>Alle zugeordneten Dokumente verschieben nach</span>
								<select name="targetId" class="control" aria-label="Zielspalte">
									{#each board.columns.filter((candidate) => candidate.id !== column.id) as target (target.id)}<option
											value={target.id}>{target.name}</option
										>{/each}
								</select>
							</label>
							<button disabled={saving} class="control text-red-700 dark:text-red-300"
								>Verschieben und löschen</button
							>
						</form>
					</details>
				{/if}
			</li>
		{/each}
	</ol>
	<form
		method="POST"
		action="?/columns"
		use:enhance={save}
		data-create="true"
		class="mt-4 flex flex-wrap gap-2"
		aria-label="Spalte hinzufügen"
	>
		<input type="hidden" name="boardRevision" value={board.revision} />
		<input type="hidden" name="columnAction" value="create" />
		<input
			name="name"
			required
			maxlength={MAX_SERMON_COLUMN_NAME_LENGTH}
			aria-label="Neue Spalte"
			placeholder="Name der neuen Spalte"
			class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-stone-600"
		/>
		<button disabled={saving} class="control"
			><Icon name="plus" class="size-4" /> Spalte hinzufügen</button
		>
	</form>
</section>

<style>
	.control {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 2.5rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.5rem;
		background: var(--surface);
		padding: 0.4rem 0.7rem;
		font-size: 0.8rem;
	}
	.control:disabled {
		opacity: 0.4;
	}
</style>
