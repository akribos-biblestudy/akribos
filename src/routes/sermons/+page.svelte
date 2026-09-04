<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import DocumentAreaNav from '$lib/components/documents/DocumentAreaNav.svelte';
	import { t, type MessageKey } from '$lib/i18n';
	import { formatGermanCalendarDate } from '$lib/notes/calendar-date';
	import { isSermonWorkflowState, type SermonWorkflowState } from '$lib/notes/documents';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();
	let movingId = $state<string | null>(null);
	let dragStatus = $state<string | null>(null);
	let draggedSermon: { id: string; revision: number } | null = null;
	let pointerSermon: { id: string; revision: number; status: SermonWorkflowState } | null = null;
	const germanDatePattern = '[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{4}';

	function statusLabel(status: string): string {
		return t(`sermons.status.${status}` as MessageKey);
	}

	function filterUrl(status: string | null): string {
		const params = new SvelteURLSearchParams();
		if (data.filters.q) params.set('q', data.filters.q);
		if (status) params.set('status', status);
		return params.size ? `/sermons?${params}` : '/sermons';
	}

	function preview(value: string): string {
		const clean = value.replace(/\s+/gu, ' ').trim();
		return clean.length > 135 ? `${clean.slice(0, 132)}…` : clean;
	}

	async function moveSermon(id: string, revision: number, status: string): Promise<void> {
		if (movingId || !isSermonWorkflowState(status)) return;
		movingId = id;
		const body = new FormData();
		body.set('id', id);
		body.set('revision', String(revision));
		body.set('status', status);
		try {
			const response = await fetch('?/move', { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type !== 'success') throw new Error('move failed');
			await invalidateAll();
		} finally {
			movingId = null;
			dragStatus = null;
		}
	}

	function sermonInteractionTarget(target: EventTarget | null): {
		id: string;
		revision: number;
		status: SermonWorkflowState;
	} | null {
		if (!(target instanceof Element)) return null;
		const element = target.closest<HTMLElement>('[data-sermon-id]');
		if (!element) return null;
		const id = element.dataset.sermonId;
		const revision = Number(element.dataset.sermonRevision);
		const status = element.dataset.sermonStatus;
		return id && Number.isSafeInteger(revision) && isSermonWorkflowState(status)
			? { id, revision, status }
			: null;
	}

	function onDragStart(event: DragEvent): void {
		// Capture the source before the drag begins. Browsers and automation can retarget `dragstart`
		// while bringing a distant board column into view; the card-level fallback still covers
		// keyboard- or script-triggered drag events without a preceding pointer event.
		const sermon = pointerSermon ?? sermonInteractionTarget(event.currentTarget);
		if (!sermon) return;
		const serialized = JSON.stringify({ id: sermon.id, revision: sermon.revision });
		draggedSermon = { id: sermon.id, revision: sermon.revision };
		if (event.dataTransfer) {
			event.dataTransfer.setData('application/json', serialized);
			event.dataTransfer.setData('text/plain', serialized);
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function onDrop(event: DragEvent, status: string): void {
		event.preventDefault();
		try {
			const serialized =
				event.dataTransfer?.getData('application/json') ||
				event.dataTransfer?.getData('text/plain') ||
				'';
			const value =
				draggedSermon ??
				(JSON.parse(serialized) as {
					id?: string;
					revision?: number;
				});
			if (value.id && Number.isSafeInteger(value.revision)) {
				void moveSermon(value.id, value.revision!, status);
			}
		} catch {
			dragStatus = null;
		} finally {
			draggedSermon = null;
			pointerSermon = null;
		}
	}

	function onDragEnd(): void {
		dragStatus = null;
		draggedSermon = null;
		pointerSermon = null;
	}

	function onCardKeydown(event: KeyboardEvent): void {
		if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
		const sermon = sermonInteractionTarget(event.target);
		if (!sermon) return;
		const current = data.statuses.indexOf(sermon.status);
		const offset = event.key === 'ArrowLeft' ? -1 : 1;
		const target = data.statuses[current + offset];
		if (!target) return;
		event.preventDefault();
		void moveSermon(sermon.id, sermon.revision, target);
	}
</script>

<main class="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-6 sm:py-10" data-testid="sermon-manager">
	<p id="sermon-card-keyboard-help" class="sr-only">
		Predigt fokussieren und mit Alt plus Pfeil links oder rechts zwischen Arbeitsständen
		verschieben.
	</p>
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-xs font-bold tracking-[0.16em] text-accent-700 uppercase dark:text-accent-300">
				{t('documents.kind.sermon')}
			</p>
			<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
				{t('sermons.title')}
			</h1>
			<p class="mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
				{t('sermons.subtitle')}
			</p>
		</div>
		<a href="/sermons/templates" class="header-link">
			<Icon name="file-text" class="size-4" />
			{t('sermons.templates.title')}
		</a>
	</header>
	<DocumentAreaNav active="sermons" />

	<section
		data-tour-target="sermon-create"
		class="mt-7 rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-5 shadow-[var(--shadow-soft)] sm:p-6 dark:border-white/8"
	>
		<h2 class="flex items-center gap-2 font-serif text-lg font-semibold">
			<Icon name="plus" class="size-4 text-accent-600" />
			{t('sermons.new')}
		</h2>
		<form
			method="POST"
			action="?/create"
			class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]"
		>
			<input type="hidden" name="returnTo" value="/sermons" />
			<label class="field-label">
				<span>{t('documents.editor.title')}</span>
				<input name="title" class="field-control" placeholder={t('documents.create.sermon')} />
			</label>
			<label class="field-label">
				<span>{t('documents.passages.reference')}</span>
				<input
					name="passage"
					class="field-control"
					placeholder={t('documents.passages.placeholder')}
				/>
			</label>
			<label class="field-label">
				<span>{t('sermons.series')}</span>
				<input name="series" class="field-control" placeholder={t('sermons.seriesPlaceholder')} />
			</label>
			<label class="field-label">
				<span>{t('sermons.date')}</span>
				<input
					type="text"
					name="date"
					class="field-control"
					placeholder="TT.MM.JJJJ"
					inputmode="numeric"
					pattern={germanDatePattern}
				/>
			</label>
			<label class="field-label">
				<span>{t('sermons.templates.template')}</span>
				<select name="template" class="field-control">
					<option value="default">{t('sermons.templates.default')}</option>
					<option value="empty">{t('sermons.templates.emptyDocument')}</option>
					{#each data.templates as template (template.id)}
						<option value={template.id}>{template.name}</option>
					{/each}
				</select>
			</label>
			<input type="hidden" name="status" value="idea" />
			<button
				type="submit"
				class="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-700"
			>
				<Icon name="plus" class="size-4" />
				{t('action.create')}
			</button>
		</form>
		{#if form?.error}
			<p class="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
				{t('documents.publication.error')}
			</p>
		{/if}
	</section>

	<div class="mt-6 flex flex-wrap items-center justify-between gap-3">
		<nav class="flex max-w-full gap-1 overflow-x-auto pb-1" aria-label={t('sermons.status')}>
			<a href={filterUrl(null)} class:active={!data.filters.status} class="status-filter">
				{t('documents.library.all')}
			</a>
			{#each data.statuses as status (status)}
				<a
					href={filterUrl(status)}
					class:active={data.filters.status === status}
					class="status-filter"
				>
					{statusLabel(status)}
				</a>
			{/each}
		</nav>
		<form method="GET" class="relative w-full sm:w-72">
			{#if data.filters.status}<input
					type="hidden"
					name="status"
					value={data.filters.status}
				/>{/if}
			<label class="sr-only" for="sermon-search">{t('documents.library.search')}</label>
			<Icon
				name="search"
				class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
			/>
			<input
				id="sermon-search"
				type="search"
				name="q"
				value={data.filters.q}
				placeholder={t('documents.library.search')}
				class="field-control pl-9"
			/>
		</form>
	</div>

	{#if data.sermons.length === 0}
		<div
			class="mt-5 rounded-2xl border border-dashed border-stone-300 py-14 text-center text-stone-500 dark:border-stone-700 dark:text-stone-400"
		>
			<Icon name="message" class="mx-auto size-9 opacity-45" />
			<p class="mt-3 text-sm font-medium">{t('sermons.empty')}</p>
		</div>
	{:else if data.filters.status}
		<ul class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each data.sermons as sermon (sermon.id)}
				{@render SermonCard({ sermon })}
			{/each}
		</ul>
	{:else}
		<div class="sermon-board mt-5" aria-label={t('sermons.status')} role="group">
			{#each data.statuses as status (status)}
				<section
					class="board-column"
					role="group"
					aria-label={statusLabel(status)}
					class:drag-target={dragStatus === status}
					ondragover={(event) => {
						event.preventDefault();
						dragStatus = status;
					}}
					ondragleave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null))
							dragStatus = null;
					}}
					ondrop={(event) => onDrop(event, status)}
				>
					<header class="flex items-center justify-between gap-2 px-1">
						<h2
							class="text-xs font-bold tracking-[0.08em] text-stone-500 uppercase dark:text-stone-400"
						>
							{statusLabel(status)}
						</h2>
						<span
							class="rounded-full bg-stone-200 px-2 py-0.5 text-[0.65rem] text-stone-600 dark:bg-white/8 dark:text-stone-300"
						>
							{data.sermons.filter((sermon) => sermon.sermonStatus === status).length}
						</span>
					</header>
					<ul class="mt-2 space-y-3">
						{#each data.sermons.filter((sermon) => sermon.sermonStatus === status) as sermon (sermon.id)}
							{@render SermonCard({ sermon })}
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</main>

{#snippet SermonCard({ sermon }: { sermon: (typeof data.sermons)[number] })}
	<li
		class="group relative rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md dark:border-white/8"
		class:opacity-60={movingId === sermon.id}
		draggable="true"
		data-sermon-id={sermon.id}
		data-sermon-revision={sermon.revision}
		data-sermon-status={sermon.sermonStatus ?? 'idea'}
		data-testid="sermon-card"
		onpointerdown={(event) => {
			pointerSermon = sermonInteractionTarget(event.currentTarget);
		}}
		ondragstart={onDragStart}
		ondragend={onDragEnd}
	>
		<a
			href="/notes/{sermon.id}?returnTo={encodeURIComponent('/sermons')}"
			class="after:absolute after:inset-0"
			aria-describedby="sermon-card-keyboard-help"
			data-sermon-id={sermon.id}
			data-sermon-revision={sermon.revision}
			data-sermon-status={sermon.sermonStatus ?? 'idea'}
			onkeydown={onCardKeydown}
		>
			<h3 class="font-serif leading-snug font-semibold">{sermon.title}</h3>
		</a>
		{#if sermon.plainText}
			<p class="mt-2 line-clamp-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
				{preview(sermon.plainText)}
			</p>
		{/if}
		<div class="mt-4 space-y-1 text-[0.68rem] text-stone-400">
			{#if sermon.sermonSeries}
				<p class="truncate">{sermon.sermonSeries}</p>
			{/if}
			{#if sermon.sermonDate}
				<p class="flex items-center gap-1">
					<Icon name="calendar" class="size-3" />
					{formatGermanCalendarDate(sermon.sermonDate)}
				</p>
			{/if}
		</div>
	</li>
{/snippet}

<style>
	.field-label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 650;
		color: var(--color-stone-600);
	}
	.field-control {
		width: 100%;
		min-height: 2.5rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.75rem;
		background: var(--surface-raised);
		padding: 0.45rem 0.75rem;
		color: var(--color-stone-900);
		font-size: 0.82rem;
		font-weight: 400;
		outline: none;
	}
	.field-control:focus {
		border-color: var(--color-accent-500);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}
	.status-filter {
		flex: 0 0 auto;
		border-radius: 999px;
		padding: 0.42rem 0.8rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
		font-weight: 700;
	}
	.status-filter:hover,
	.status-filter.active {
		background: var(--color-accent-600);
		color: white;
	}
	.sermon-board {
		display: grid;
		grid-template-columns: repeat(5, minmax(14rem, 1fr));
		gap: 0.8rem;
		overflow-x: auto;
		padding-bottom: 1rem;
		scroll-snap-type: x proximity;
	}
	.board-column {
		min-height: 20rem;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-stone-200) 35%, transparent);
		padding: 0.7rem;
		scroll-snap-align: start;
	}
	.board-column.drag-target {
		box-shadow: inset 0 0 0 2px var(--color-accent-500);
		background: color-mix(in oklab, var(--color-accent-100) 55%, transparent);
	}
	.header-link {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.5rem;
		background: var(--surface-raised);
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		font-weight: 650;
	}
	:global(.dark) .field-label {
		color: var(--color-stone-300);
	}
	:global(.dark) .field-control {
		border-color: var(--color-stone-700);
		background: color-mix(in oklab, white 4%, transparent);
		color: var(--color-stone-100);
	}
	:global(.dark) .board-column {
		background: color-mix(in oklab, white 3%, transparent);
	}
</style>
