<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		dragHandleZone,
		dragHandle,
		setAriaStrings,
		SOURCES,
		TRIGGERS,
		type DndEvent
	} from 'svelte-dnd-action';
	import Icon from '$lib/components/Icon.svelte';
	import { formatGermanCalendarDate } from '$lib/notes/calendar-date';
	import { sermonFormatLabel, type SermonFormat } from '$lib/notes/documents';
	import type { SermonColumn } from '$lib/notes/sermon-board';
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
	let {
		columns,
		sermons,
		filteredStatus,
		movingId,
		onmove
	}: {
		columns: SermonColumn[];
		sermons: Card[];
		filteredStatus: string | null;
		movingId: string | null;
		onmove: (id: string, revision: number, status: string) => Promise<void>;
	} = $props();
	let dragging = $state(false);
	let board = $derived(
		columns
			.filter((column) => !filteredStatus || column.id === filteredStatus)
			.map((column) => ({
				...column,
				items: sermons.filter((sermon) => sermon.sermonStatus === column.id)
			}))
	);

	onMount(() => {
		setAriaStrings({
			dragStarted: ({ itemLabel }) =>
				`${itemLabel} aufgenommen. Mit Tab eine Spalte wählen, mit Leertaste ablegen.`,
			movedToPosition: ({ itemLabel, zoneLabel }) =>
				`${itemLabel} in ${zoneLabel}. Die Karten werden nach Termin sortiert.`,
			movedToZoneStart: ({ itemLabel, zoneLabel }) => `${itemLabel} in ${zoneLabel}.`,
			movedToZoneEnd: ({ itemLabel, zoneLabel }) => `${itemLabel} in ${zoneLabel}.`,
			dropped: ({ itemLabel, zoneLabel }) => `${itemLabel} in ${zoneLabel} abgelegt.`,
			zoneActiveInstruction: 'Mit Tab eine Ausarbeitung wählen und mit Leertaste aufnehmen.',
			zoneDragDisabledInstruction: 'Die Änderung wird gespeichert.'
		});
		return () => setAriaStrings(null);
	});
	function consider(id: string, event: CustomEvent<DndEvent<Card>>) {
		if (event.detail.info.trigger === TRIGGERS.DRAG_STARTED) dragging = true;
		if (event.detail.info.trigger === TRIGGERS.DRAG_STOPPED) dragging = false;
		board = board.map((column) =>
			column.id === id ? { ...column, items: event.detail.items } : column
		);
	}
	async function finalize(id: string, event: CustomEvent<DndEvent<Card>>) {
		if (event.detail.info.source === SOURCES.POINTER) dragging = false;
		consider(id, event);
		const card = sermons.find((sermon) => sermon.id === event.detail.info.id);
		if (!card || !event.detail.items.some((item) => item.id === card.id)) return;
		if (card.sermonStatus !== id) await onmove(card.id, card.revision, id);
		// The workflow keeps its existing date order; dropping within a column does not persist a rank.
		board = columns
			.filter((column) => !filteredStatus || column.id === filteredStatus)
			.map((column) => ({
				...column,
				items: sermons.filter((sermon) => sermon.sermonStatus === column.id)
			}));
	}
	async function keyMove(event: KeyboardEvent, card: Card) {
		if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
		const index = columns.findIndex((column) => column.id === card.sermonStatus);
		const target = columns[index + (event.key === 'ArrowLeft' ? -1 : 1)];
		if (!target || movingId) return;
		event.preventDefault();
		const focusId = `sermon-link-${card.id}`;
		await onmove(card.id, card.revision, target.id);
		await tick();
		document.getElementById(focusId)?.focus();
	}
	function preview(value: string) {
		const clean = value.replace(/\s+/gu, ' ').trim();
		return clean.length > 135 ? `${clean.slice(0, 132)}…` : clean;
	}
</script>

<p id="sermon-card-keyboard-help" class="sr-only">
	Mit Alt plus Pfeil links oder rechts in die benachbarte Spalte verschieben.
</p>
<div
	class="sermon-board mt-5"
	class:filtered={!!filteredStatus}
	aria-label="Arbeitsstand"
	role="group"
>
	{#each board as column (column.id)}
		<section class="board-column" role="group" aria-label={column.name}>
			<header class="flex items-center justify-between gap-2 px-1">
				<h2
					class="min-w-0 text-xs font-bold tracking-wide break-words text-stone-600 uppercase dark:text-stone-300"
				>
					{column.name}
				</h2>
				<span
					class="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600 dark:bg-white/10 dark:text-stone-300"
					>{sermons.filter((sermon) => sermon.sermonStatus === column.id).length}</span
				>
			</header>
			<ul
				class="card-list mt-3"
				class:space-y-3={!filteredStatus}
				aria-label={column.name}
				use:dragHandleZone={{
					items: column.items,
					type: 'sermon-cards',
					flipDurationMs: 0,
					dragDisabled: !!movingId,
					dropFromOthersDisabled: !!movingId,
					delayTouchStart: 180,
					dropTargetStyle: { outline: '2px solid var(--color-accent-500)', borderRadius: '0.75rem' }
				}}
				onconsider={(event) => consider(column.id, event)}
				onfinalize={(event) => void finalize(column.id, event)}
			>
				{#each column.items as sermon (sermon.id)}
					<li
						class="sermon-card rounded-2xl border border-stone-200/80 bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] dark:border-white/10"
						class:opacity-60={movingId === sermon.id}
						data-sermon-id={sermon.id}
						data-sermon-revision={sermon.revision}
						data-sermon-status={sermon.sermonStatus}
						data-testid="sermon-card"
						aria-label={sermon.title}
					>
						<div class="flex items-start gap-2">
							<a
								id="sermon-link-{sermon.id}"
								tabindex={dragging ? -1 : 0}
								href="/notes/{sermon.id}?returnTo={encodeURIComponent('/sermons')}"
								class="min-w-0 flex-1 font-serif leading-snug font-semibold break-words"
								aria-describedby="sermon-card-keyboard-help"
								onkeydown={(event) => void keyMove(event, sermon)}><h3>{sermon.title}</h3></a
							>
							<!-- Native buttons are reserved for card actions by the library; use its documented focusable handle. -->
							<span
								role="button"
								tabindex="0"
								use:dragHandle
								aria-label="{sermon.title} verschieben"
								class="drag-handle inline-flex min-h-8 min-w-8 items-center justify-center rounded text-stone-400"
								><Icon name="grip" class="size-4" /></span
							>
						</div>
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
			{#if column.items.length === 0}<p
					class="pointer-events-none px-2 text-center text-xs text-stone-400"
				>
					Noch keine Ausarbeitungen
				</p>{/if}
		</section>
	{/each}
</div>

<style>
	.sermon-board {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(15rem, 1fr);
		gap: 0.8rem;
		overflow-x: auto;
		padding-bottom: 1rem;
		scroll-snap-type: x proximity;
	}
	.board-column {
		min-width: 0;
		min-height: 22rem;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-stone-200) 35%, transparent);
		padding: 0.7rem;
		scroll-snap-align: start;
	}
	.card-list {
		min-height: 16rem;
	}
	.filtered .card-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		align-content: start;
		gap: 0.75rem;
	}
	.drag-handle {
		cursor: grab;
		touch-action: none;
	}
	:global(.dark) .board-column {
		background: color-mix(in oklab, white 3%, transparent);
	}
</style>
