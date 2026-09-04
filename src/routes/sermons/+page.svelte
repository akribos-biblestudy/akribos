<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { t, type MessageKey } from '$lib/i18n';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();

	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

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
</script>

<main class="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-6 sm:py-10" data-testid="sermon-manager">
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
		<a
			href="/notes"
			class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-[color:var(--surface-raised)] px-3 py-2 text-sm font-semibold shadow-sm hover:border-accent-400 dark:border-white/12"
		>
			<Icon name="file-text" class="size-4" />
			{t('documents.library.title')}
		</a>
	</header>

	<section
		class="mt-7 rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-5 shadow-[var(--shadow-soft)] sm:p-6 dark:border-white/8"
	>
		<h2 class="flex items-center gap-2 font-serif text-lg font-semibold">
			<Icon name="plus" class="size-4 text-accent-600" />
			{t('sermons.new')}
		</h2>
		<form
			method="POST"
			action="?/create"
			class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"
		>
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
				<input type="date" name="date" class="field-control" />
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
		<div class="sermon-board mt-5" aria-label={t('sermons.status')}>
			{#each data.statuses as status (status)}
				<section class="board-column">
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
	>
		<a
			href="/notes/{sermon.id}?returnTo={encodeURIComponent('/sermons')}"
			class="after:absolute after:inset-0"
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
					{dateFormat.format(new Date(sermon.sermonDate))}
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
