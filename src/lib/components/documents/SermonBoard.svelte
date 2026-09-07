<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import {
		dndzone,
		setAriaStrings,
		SOURCES,
		TRIGGERS,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		type DndEvent
	} from 'svelte-dnd-action';
	import Icon from '$lib/components/Icon.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import { formatGermanCalendarDate } from '$lib/notes/calendar-date';
	import { sermonFormatLabel, type SermonFormat } from '$lib/notes/documents';
	import { MAX_SERMON_COLUMN_NAME_LENGTH, type SermonColumn } from '$lib/notes/sermon-board';
	type Card = {
		id: string;
		title: string;
		plainText: string;
		sermonStatus: string | null;
		sermonDate: Date | string | null;
		sermonSeries: string | null;
		sermonFormat: SermonFormat;
		revision: number;
	};
	type ColumnItem = SermonColumn & { isDndShadowItem?: boolean };
	let {
		columns,
		boardRevision,
		sermons,
		filteredStatus,
		movingId,
		onmove
	}: {
		columns: SermonColumn[];
		boardRevision: number;
		sermons: Card[];
		filteredStatus: string | null;
		movingId: string | null;
		onmove: (id: string, revision: number, status: string) => Promise<void>;
	} = $props();
	let cardDragging = $state(false);
	let columnDragging = $state(false);
	let savingColumns = $state(false);
	let editingId = $state<string | null>(null);
	let draftName = $state('');
	let adding = $state(false);
	let newName = $state('');
	let columnError = $state('');
	let nameInput: HTMLInputElement | undefined = $state();
	let newInput: HTMLInputElement | undefined = $state();
	let columnMenu: Menu;
	let selectedColumn = $state<SermonColumn | null>(null);
	let deletingColumn = $state<SermonColumn | null>(null);
	let deleteDialog: HTMLDialogElement;
	let deleteTarget = $state('');
	let visibleColumns: ColumnItem[] = $derived(
		columns.filter((column) => !filteredStatus || column.id === filteredStatus)
	);
	let cardLists = $derived(
		Object.fromEntries(
			columns.map((column) => [
				column.id,
				sermons.filter((sermon) => sermon.sermonStatus === column.id)
			])
		)
	);
	const errors: Record<string, string> = {
		boardConflict:
			'Die Spalten wurden inzwischen geändert. Die aktuelle Ansicht wurde geladen; bitte erneut versuchen.',
		columnMissing: 'Diese Spalte ist nicht mehr verfügbar.',
		columnName: 'Bitte einen eindeutigen Namen mit 1 bis 80 Zeichen eingeben.',
		columnLimit: 'Es können höchstens 30 Spalten angelegt werden.',
		lastColumn: 'Mindestens eine Spalte muss erhalten bleiben.',
		columnTarget: 'Bitte eine andere Zielspalte auswählen.',
		columnOrder: 'Die Spalten haben sich geändert. Bitte erneut versuchen.'
	};

	onMount(() => {
		setAriaStrings({
			dragStarted: ({ itemLabel }) =>
				`${itemLabel} aufgenommen. Mit Pfeiltasten sortieren oder mit Tab eine Zielspalte wählen. Leertaste legt ab.`,
			movedToPosition: ({ itemLabel, zoneLabel, position }) =>
				`${itemLabel}: Position ${position} in ${zoneLabel}.`,
			movedToZoneStart: ({ itemLabel, zoneLabel }) => `${itemLabel} in ${zoneLabel}.`,
			movedToZoneEnd: ({ itemLabel, zoneLabel }) => `${itemLabel} in ${zoneLabel}.`,
			dropped: ({ itemLabel, zoneLabel }) => `${itemLabel} in ${zoneLabel} abgelegt.`,
			zoneActiveInstruction: 'Mit Tab ein Element wählen und mit Leertaste aufnehmen.',
			zoneDragDisabledInstruction: 'Die Änderung wird gespeichert.'
		});
		return () => setAriaStrings(null);
	});

	async function saveColumns(
		action: string,
		values: Record<string, string | string[]>
	): Promise<boolean> {
		if (savingColumns || movingId) return false;
		savingColumns = true;
		columnError = '';
		const body = new FormData();
		body.set('boardRevision', String(boardRevision));
		body.set('columnAction', action);
		for (const [key, value] of Object.entries(values)) {
			for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
		}
		try {
			const response = await fetch('?/columns', { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type !== 'success') {
				const code = result.type === 'failure' ? result.data?.error : null;
				columnError = errors[String(code)] ?? 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
			}
			await invalidateAll();
			return result.type === 'success';
		} catch {
			columnError = 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
			await invalidateAll();
			return false;
		} finally {
			savingColumns = false;
		}
	}
	async function beginRename(column: SermonColumn) {
		if (savingColumns || movingId) return;
		columnMenu?.close();
		columnError = '';
		editingId = column.id;
		draftName = column.name;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}
	async function rename(column: SermonColumn, restoreFocus = false) {
		if (editingId !== column.id || savingColumns) return;
		if (
			draftName === column.name ||
			(await saveColumns('rename', { columnId: column.id, name: draftName }))
		) {
			editingId = null;
			if (restoreFocus) {
				await tick();
				document.getElementById(`column-title-${column.id}`)?.focus();
			}
		}
	}
	async function beginAdd() {
		adding = true;
		newName = '';
		columnError = '';
		await tick();
		newInput?.focus();
		newInput?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
	async function addColumn() {
		if (await saveColumns('create', { name: newName })) {
			adding = false;
			if (filteredStatus) {
				const url = new URL(window.location.href);
				url.searchParams.delete('status');
				await goto(url);
			}
			await tick();
			const title = document.getElementById(`column-title-${columns.at(-1)!.id}`);
			title?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			title?.focus();
		}
	}
	async function openColumnMenu(column: SermonColumn, target: HTMLElement) {
		selectedColumn = column;
		await tick();
		columnMenu.openAt(target);
	}
	async function shiftColumn(direction: 'left' | 'right') {
		if (!selectedColumn) return;
		columnMenu.close();
		await saveColumns(direction, { columnId: selectedColumn.id });
	}
	async function beginDelete() {
		if (!selectedColumn) return;
		columnMenu.close();
		deletingColumn = selectedColumn;
		deleteTarget = columns.find((column) => column.id !== selectedColumn!.id)?.id ?? '';
		columnError = '';
		await tick();
		deleteDialog.showModal();
	}
	async function deleteColumn() {
		if (
			deletingColumn &&
			(await saveColumns('delete', { columnId: deletingColumn.id, targetId: deleteTarget }))
		)
			deleteDialog.close();
	}
	function columnConsider(event: CustomEvent<DndEvent<ColumnItem>>) {
		if (event.target !== event.currentTarget) return;
		event.stopPropagation();
		if (event.detail.info.trigger === TRIGGERS.DRAG_STARTED) columnDragging = true;
		if (event.detail.info.trigger === TRIGGERS.DRAG_STOPPED) columnDragging = false;
		visibleColumns = event.detail.items;
	}
	async function columnFinalize(event: CustomEvent<DndEvent<ColumnItem>>) {
		if (event.target !== event.currentTarget) return;
		event.stopPropagation();
		if (event.detail.info.source === SOURCES.POINTER) columnDragging = false;
		visibleColumns = event.detail.items;
		const ids = event.detail.items.map((column) => column.id);
		if (ids.length === columns.length && ids.some((id, index) => id !== columns[index]?.id))
			await saveColumns('sort', { columnIds: ids });
	}
	function consider(id: string, event: CustomEvent<DndEvent<Card>>) {
		// Nested card events must never be interpreted as a new column order.
		event.stopPropagation();
		if (event.detail.info.trigger === TRIGGERS.DRAG_STARTED) cardDragging = true;
		if (event.detail.info.trigger === TRIGGERS.DRAG_STOPPED) cardDragging = false;
		cardLists = { ...cardLists, [id]: event.detail.items };
	}
	async function finalize(id: string, event: CustomEvent<DndEvent<Card>>) {
		if (event.detail.info.source === SOURCES.POINTER) cardDragging = false;
		consider(id, event);
		const card = sermons.find((sermon) => sermon.id === event.detail.info.id);
		if (!card || !event.detail.items.some((item) => item.id === card.id)) return;
		if (card.sermonStatus !== id) await onmove(card.id, card.revision, id);
		cardLists = Object.fromEntries(
			columns.map((column) => [
				column.id,
				sermons.filter((sermon) => sermon.sermonStatus === column.id)
			])
		);
	}
	async function keyMove(event: KeyboardEvent, card: Card) {
		if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
		const index = columns.findIndex((column) => column.id === card.sermonStatus);
		const target = columns[index + (event.key === 'ArrowLeft' ? -1 : 1)];
		if (!target || movingId || savingColumns) return;
		event.preventDefault();
		event.stopPropagation();
		await onmove(card.id, card.revision, target.id);
		await tick();
		document.getElementById(`sermon-link-${card.id}`)?.focus();
	}
	function controlPointer(event: MouseEvent | TouchEvent) {
		if (event.target instanceof Element && event.target.closest('[data-column-control]'))
			event.stopPropagation();
	}
	function preview(value: string) {
		const clean = value.replace(/\s+/gu, ' ').trim();
		return clean.length > 135 ? `${clean.slice(0, 132)}…` : clean;
	}
</script>

<p id="sermon-card-keyboard-help" class="sr-only">
	Mit Leertaste eine Karte aufnehmen und mit Tab in eine andere Spalte wechseln. Alt plus Pfeil
	links oder rechts verschiebt den fokussierten Dokumentlink direkt. Karten bleiben nach Termin
	sortiert.
</p>
{#if columnError && !deletingColumn}<p
		role="alert"
		class="mt-4 text-sm text-red-700 dark:text-red-300"
	>
		{columnError}
	</p>{/if}
<div
	class="board-scroll mt-5"
	class:filtered={!!filteredStatus}
	aria-label="Arbeitsstand"
	role="group"
>
	<ul
		class="sermon-board"
		aria-label="Spalten"
		use:dndzone={{
			items: visibleColumns,
			type: 'sermon-columns',
			flipDurationMs: 0,
			dragDisabled: !!filteredStatus || !!movingId || savingColumns || cardDragging || !!editingId,
			zoneItemTabIndex: 0,
			delayTouchStart: 200,
			useCursorForDetection: true,
			dropTargetStyle: {}
		}}
		onconsider={columnConsider}
		onfinalize={(event) => void columnFinalize(event)}
	>
		{#each visibleColumns as column (column.id)}
			<li
				class="column-shell"
				aria-label={column.name}
				data-is-dnd-shadow-item-hint={column[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
			>
				<section
					class="board-column"
					role="group"
					aria-label={column.name}
					data-column-id={column.id}
				>
					<header
						class="column-header"
						onmousedowncapture={controlPointer}
						ontouchstartcapture={controlPointer}
					>
						<span class="column-dot" aria-hidden="true"></span>
						{#if editingId === column.id}
							<form
								class="min-w-0 flex-1"
								data-column-control
								onsubmit={(event) => {
									event.preventDefault();
									void rename(column, true);
								}}
							>
								<input
									bind:this={nameInput}
									bind:value={draftName}
									aria-label="Spaltenname"
									maxlength={MAX_SERMON_COLUMN_NAME_LENGTH}
									required
									class="column-name-input"
									onblur={() => void rename(column)}
									onkeydown={(event) => {
										if (event.key === 'Escape') {
											event.preventDefault();
											editingId = null;
										}
									}}
								/>
							</form>
						{:else}
							<h2 class="min-w-0">
								<button
									type="button"
									id="column-title-{column.id}"
									class="column-title"
									tabindex={columnDragging || cardDragging ? -1 : 0}
									aria-label="Spalte {column.name} umbenennen"
									onclick={() => {
										if (!columnDragging) void beginRename(column);
									}}><span>{column.name}</span></button
								>
							</h2>
						{/if}
						<span class="column-count"
							>{sermons.filter((sermon) => sermon.sermonStatus === column.id).length}</span
						>
						<button
							type="button"
							data-column-control
							class="column-options"
							tabindex={cardDragging || columnDragging ? -1 : 0}
							aria-label="Spaltenaktionen für {column.name}"
							aria-haspopup="menu"
							disabled={savingColumns || !!movingId}
							onclick={(event) => openColumnMenu(column, event.currentTarget)}
							><Icon name="more-horizontal" class="size-5" /></button
						>
					</header>
					<ul
						class="card-list"
						class:space-y-3={!filteredStatus}
						aria-label={column.name}
						use:dndzone={{
							items: cardLists[column.id] ?? [],
							type: 'sermon-cards',
							flipDurationMs: 0,
							dragDisabled: !!movingId || savingColumns || columnDragging,
							dropFromOthersDisabled: !!movingId || savingColumns || columnDragging,
							delayTouchStart: 200,
							useCursorForDetection: true,
							dropTargetStyle: {
								outline: '2px solid var(--color-accent-500)',
								borderRadius: '0.75rem'
							}
						}}
						onconsider={(event) => consider(column.id, event)}
						onfinalize={(event) => void finalize(column.id, event)}
					>
						{#each cardLists[column.id] ?? [] as sermon (sermon.id)}
							<li
								class="sermon-card rounded-xl border border-stone-200/80 bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] dark:border-white/10"
								class:opacity-60={movingId === sermon.id}
								data-sermon-id={sermon.id}
								data-sermon-revision={sermon.revision}
								data-sermon-status={sermon.sermonStatus}
								data-testid="sermon-card"
								aria-label={sermon.title}
								aria-describedby="sermon-card-keyboard-help"
							>
								<a
									id="sermon-link-{sermon.id}"
									tabindex={cardDragging || columnDragging ? -1 : 0}
									draggable="false"
									href="/notes/{sermon.id}?returnTo={encodeURIComponent('/sermons')}"
									class="block font-serif leading-snug font-semibold break-words"
									aria-describedby="sermon-card-keyboard-help"
									onkeydown={(event) => void keyMove(event, sermon)}><h3>{sermon.title}</h3></a
								>
								{#if sermon.plainText}<p
										class="mt-2 line-clamp-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400"
									>
										{preview(sermon.plainText)}
									</p>{/if}
								<div class="mt-4 space-y-1 text-xs text-stone-500 dark:text-stone-400">
									<p>{sermonFormatLabel(sermon.sermonFormat)}</p>
									{#if sermon.sermonSeries}<p class="truncate">{sermon.sermonSeries}</p>{/if}
									{#if sermon.sermonDate}<p class="flex items-center gap-1">
											<Icon name="calendar" class="size-3" />{formatGermanCalendarDate(
												sermon.sermonDate
											)}
										</p>{/if}
								</div>
							</li>
						{/each}
					</ul>
					{#if (cardLists[column.id] ?? []).length === 0}<p
							class="empty-column pointer-events-none text-center text-xs text-stone-400"
						>
							Noch keine Ausarbeitungen
						</p>{/if}
				</section>
			</li>
		{/each}
	</ul>
	<div class="add-column" class:expanded={adding}>
		{#if adding}
			<form
				aria-label="Spalte hinzufügen"
				class="space-y-3"
				onsubmit={(event) => {
					event.preventDefault();
					void addColumn();
				}}
			>
				<input
					bind:this={newInput}
					bind:value={newName}
					aria-label="Neue Spalte"
					placeholder="Spaltenname"
					class="column-name-input"
					maxlength={MAX_SERMON_COLUMN_NAME_LENGTH}
					required
					onkeydown={(event) => {
						if (event.key === 'Escape') adding = false;
					}}
				/>
				<div class="flex items-center gap-2">
					<button class="add-submit" disabled={savingColumns}>Hinzufügen</button><button
						type="button"
						class="icon-button"
						aria-label="Abbrechen"
						onclick={() => (adding = false)}><Icon name="x" class="size-4" /></button
					>
				</div>
			</form>
		{:else}
			<button
				type="button"
				class="add-column-button"
				tabindex={cardDragging || columnDragging ? -1 : 0}
				aria-label="Spalte hinzufügen"
				title="Spalte hinzufügen"
				disabled={savingColumns || !!movingId}
				onclick={() => void beginAdd()}><Icon name="plus" class="size-6" /></button
			>
		{/if}
	</div>
</div>

<Menu bind:this={columnMenu} label="Spaltenaktionen">
	{#if selectedColumn}
		<button role="menuitem" onclick={() => void beginRename(selectedColumn!)}
			><Icon name="pencil" class="size-4" />Umbenennen</button
		>
		<button
			role="menuitem"
			disabled={columns[0]?.id === selectedColumn.id}
			onclick={() => void shiftColumn('left')}
			><Icon name="chevron-left" class="size-4" />Nach links verschieben</button
		>
		<button
			role="menuitem"
			disabled={columns.at(-1)?.id === selectedColumn.id}
			onclick={() => void shiftColumn('right')}
			><Icon name="chevron-right" class="size-4" />Nach rechts verschieben</button
		>
		<hr />
		<button role="menuitem" disabled={columns.length === 1} onclick={() => void beginDelete()}
			><Icon name="trash" class="size-4" />Spalte löschen</button
		>
	{/if}
</Menu>

<dialog
	bind:this={deleteDialog}
	class="delete-dialog"
	aria-labelledby="delete-column-title"
	onclose={() => (deletingColumn = null)}
>
	{#if deletingColumn}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void deleteColumn();
			}}
			class="space-y-4"
		>
			<h2 id="delete-column-title" class="font-serif text-xl font-semibold">
				„{deletingColumn.name}“ löschen
			</h2>
			<p class="text-sm text-stone-500">
				Alle zugeordneten Dokumente werden in die gewählte Spalte verschoben.
			</p>
			<label class="grid gap-2 text-sm"
				><span>Zielspalte</span><select bind:value={deleteTarget} class="column-name-input"
					>{#each columns.filter((column) => column.id !== deletingColumn?.id) as target (target.id)}<option
							value={target.id}>{target.name}</option
						>{/each}</select
				></label
			>
			{#if columnError}<p role="alert" class="text-sm text-red-700 dark:text-red-300">
					{columnError}
				</p>{/if}
			<div class="flex flex-wrap justify-end gap-2">
				<button type="button" class="cancel-button" onclick={() => deleteDialog.close()}
					>Abbrechen</button
				><button class="add-submit" disabled={savingColumns}>Verschieben und löschen</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.board-scroll {
		display: flex;
		align-items: stretch;
		gap: 0.8rem;
		overflow-x: auto;
		padding-bottom: 1rem;
	}
	.sermon-board {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(16rem, 1fr);
		min-width: min-content;
		flex: 1;
		gap: 0.8rem;
	}
	.column-shell {
		min-width: 0;
	}
	.board-column {
		height: 100%;
		position: relative;
		min-width: 0;
		min-height: 22rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-stone-200) 24%, var(--surface));
	}
	.column-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 3.5rem;
		padding: 0.55rem 0.7rem;
		cursor: grab;
	}
	.column-dot {
		flex: 0 0 auto;
		width: 0.9rem;
		height: 0.9rem;
		border: 2px solid var(--color-accent-600);
		border-radius: 50%;
	}
	.column-title {
		display: block;
		border-radius: 0.25rem;
		padding: 0.2rem 0;
		font-size: 0.9rem;
		font-weight: 700;
		overflow-wrap: anywhere;
		cursor: grab;
	}
	.column-title:hover {
		color: var(--color-accent-700);
	}
	.column-count {
		border-radius: 0.6rem;
		padding: 0.05rem 0.4rem;
		background: color-mix(in oklab, var(--color-stone-300) 38%, transparent);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-stone-500);
	}
	.column-options {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 2rem;
		height: 2rem;
		border-radius: 0.35rem;
		color: var(--color-stone-500);
		cursor: pointer;
	}
	.column-options:hover,
	.icon-button:hover {
		background: color-mix(in oklab, var(--color-stone-300) 25%, transparent);
	}
	.column-name-input {
		width: 100%;
		min-width: 0;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.4rem;
		background: var(--surface);
		padding: 0.5rem;
		font-size: 0.875rem;
	}
	.column-name-input:focus {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 1px;
	}
	.card-list {
		min-height: 17rem;
		padding: 0.2rem 0.7rem 0.7rem;
	}
	.sermon-card,
	.sermon-card a {
		cursor: grab;
	}
	.sermon-card:focus-visible,
	.column-title:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
	}
	.empty-column {
		position: absolute;
		top: 5rem;
		left: 0.7rem;
		right: 0.7rem;
	}
	.filtered .card-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		align-content: start;
		gap: 0.75rem;
	}
	.add-column {
		flex: 0 0 2.75rem;
	}
	.add-column.expanded {
		flex-basis: 16rem;
		padding: 0.6rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.75rem;
		align-self: flex-start;
		background: var(--surface);
	}
	.add-column-button {
		width: 2.75rem;
		height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.6rem;
		color: var(--color-stone-500);
		background: color-mix(in oklab, var(--color-stone-200) 40%, var(--surface));
	}
	.add-column-button:hover {
		color: var(--color-accent-700);
		border-color: var(--color-accent-500);
	}
	.add-submit {
		border-radius: 0.4rem;
		background: var(--color-accent-600);
		color: white;
		padding: 0.55rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 650;
	}
	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.55rem;
		border-radius: 0.4rem;
	}
	.cancel-button {
		padding: 0.55rem 0.75rem;
		font-size: 0.8rem;
	}
	.delete-dialog {
		margin: auto;
		max-width: min(27rem, calc(100vw - 2rem));
		border: 1px solid var(--color-stone-200);
		border-radius: 1rem;
		padding: 1.5rem;
		color: inherit;
		background: var(--surface);
	}
	.delete-dialog::backdrop {
		background: #0006;
	}
	button:disabled {
		opacity: 0.4;
	}
	:global(.dark) .board-column {
		border-color: var(--color-stone-700);
		background: color-mix(in oklab, white 3%, var(--surface));
	}
	:global(.dark) .column-name-input,
	:global(.dark) .add-column.expanded,
	:global(.dark) .add-column-button,
	:global(.dark) .delete-dialog {
		border-color: var(--color-stone-700);
	}
</style>
