<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import DocumentAreaHeader from '$lib/components/documents/DocumentAreaHeader.svelte';
	import { t } from '$lib/i18n';
	import SermonBoard from '$lib/components/documents/SermonBoard.svelte';
	import { SERMON_FORMATS, sermonFormatLabel } from '$lib/notes/documents';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();
	let movingId = $state<string | null>(null);
	let moveError = $state('');
	const germanDatePattern = '[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{4}';
	function filterUrl(status: string | null): string {
		const params = new SvelteURLSearchParams();
		if (data.filters.q) params.set('q', data.filters.q);
		if (data.filters.series) params.set('series', data.filters.series);
		if (data.filters.year) params.set('year', String(data.filters.year));
		if (status) params.set('status', status);
		return params.size ? `/sermons?${params}` : '/sermons';
	}

	async function moveSermon(id: string, revision: number, status: string): Promise<void> {
		if (movingId) return;
		movingId = id;
		moveError = '';
		const body = new FormData();
		body.set('id', id);
		body.set('revision', String(revision));
		body.set('status', status);
		try {
			const response = await fetch('?/move', { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type !== 'success') {
				moveError =
					'Die Ausarbeitung oder Spalte wurde inzwischen geändert. Bitte erneut versuchen.';
			}
			await invalidateAll();
		} catch {
			moveError = 'Verschieben fehlgeschlagen. Bitte erneut versuchen.';
			await invalidateAll();
		} finally {
			movingId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-6 sm:py-10" data-testid="sermon-manager">
	<DocumentAreaHeader active="sermons">
		{#snippet actions()}
			<a href="/sermons/templates"
				><Icon name="file-text" class="size-4" />{t('sermons.templates.title')}</a
			>
		{/snippet}
	</DocumentAreaHeader>

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
			<label class="field-label"
				><span id="create-format-label">Format</span><select
					aria-labelledby="create-format-label"
					name="format"
					class="field-control"
				>
					{#each SERMON_FORMATS as format (format)}<option value={format}
							>{sermonFormatLabel(format)}</option
						>{/each}
				</select></label
			>
			<input type="hidden" name="status" value={data.board.columns[0]!.id} />
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

	<div class="mt-6 flex flex-wrap items-start justify-between gap-3">
		<nav class="flex max-w-full gap-1 overflow-x-auto pb-1" aria-label={t('sermons.status')}>
			<a href={filterUrl(null)} class:active={!data.filters.status} class="status-filter">
				{t('documents.library.all')}
			</a>
			{#each data.board.columns as column (column.id)}
				<a
					href={filterUrl(column.id)}
					class:active={data.filters.status === column.id}
					class="status-filter"
				>
					{column.name}
				</a>
			{/each}
		</nav>
		<form
			method="GET"
			class="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-[minmax(15rem,1fr)_minmax(10rem,0.7fr)_7rem_auto]"
			aria-label={t('sermons.filters')}
		>
			{#if data.filters.status}<input
					type="hidden"
					name="status"
					value={data.filters.status}
				/>{/if}
			<label class="relative block sm:col-span-2 lg:col-span-1">
				<span class="sr-only">{t('documents.library.search')}</span>
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
					class="field-control search-control"
				/>
			</label>
			<label>
				<span class="sr-only">{t('sermons.filterSeries')}</span>
				<select name="series" class="field-control" value={data.filters.series ?? ''}>
					<option value="">{t('sermons.allSeries')}</option>
					{#each data.seriesOptions as series (series)}
						<option value={series}>{series}</option>
					{/each}
				</select>
			</label>
			<label>
				<span class="sr-only">{t('sermons.filterYear')}</span>
				<select name="year" class="field-control" value={data.filters.year ?? ''}>
					<option value="">{t('sermons.allYears')}</option>
					{#each data.yearOptions as year (year)}
						<option value={year}>{year}</option>
					{/each}
				</select>
			</label>
			<button
				type="submit"
				class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-700"
			>
				<Icon name="search" class="size-4" />
				{t('sermons.applyFilters')}
			</button>
		</form>
	</div>

	{#if moveError}<p role="alert" class="mt-4 text-sm text-red-700 dark:text-red-300">
			{moveError}
		</p>{/if}
	<SermonBoard
		columns={data.board.columns}
		boardRevision={data.board.revision}
		sermons={data.sermons}
		filteredStatus={data.filters.status}
		{movingId}
		onmove={moveSermon}
	/>
</main>

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
	.search-control {
		padding-left: 2.35rem;
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
	:global(.dark) .field-label {
		color: var(--color-stone-300);
	}
	:global(.dark) .field-control {
		border-color: var(--color-stone-700);
		background: color-mix(in oklab, white 4%, transparent);
		color: var(--color-stone-100);
	}
</style>
