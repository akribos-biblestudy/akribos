<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { bookShortName } from '$lib/bible/book-names';
	import BookDistribution from '$lib/components/BookDistribution.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import DocumentAreaNav from '$lib/components/documents/DocumentAreaNav.svelte';
	import { t, type MessageKey } from '$lib/i18n';
	import type { DocumentKind } from '$lib/notes/documents';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();
	const expandedTags = new SvelteSet<string>();
	const tagSearch = $derived(page.url.searchParams.get('tagSearch') ?? '');
	function searchTags(value: string): void {
		const url = new URL(page.url);
		if (value) url.searchParams.set('tagSearch', value);
		else url.searchParams.delete('tagSearch');
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}
	const tagQuery = $derived(tagSearch.trim().toLocaleLowerCase('de'));
	const matchingTagPaths = $derived.by(() => {
		const paths = new SvelteSet<string>();
		if (!tagQuery) return paths;
		for (const tag of data.tagTree) {
			if (!tag.path.toLocaleLowerCase('de').includes(tagQuery)) continue;
			const segments = tag.path.split('/');
			for (let length = 1; length <= segments.length; length++)
				paths.add(segments.slice(0, length).join('/'));
		}
		return paths;
	});

	const dateFormat = new Intl.DateTimeFormat('de-DE', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function kindLabel(kind: DocumentKind): string {
		return t(`documents.kind.${kind}` as MessageKey);
	}

	function kindIcon(kind: DocumentKind): 'file-text' | 'book-open' | 'message' {
		if (kind === 'sermon') return 'message';
		return 'file-text';
	}

	function visibilityLabel(value: string): string {
		return t(`documents.visibility.${value}` as MessageKey);
	}

	function excerpt(value: string): string {
		const clean = value.replace(/\s+/gu, ' ').trim();
		return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
	}

	function documentUrl(id: string): string {
		return `/notes/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(page.url.pathname + page.url.search)}`;
	}

	function filterUrl(overrides: Record<string, string | null>): string {
		const params = new SvelteURLSearchParams();
		if (tagSearch) params.set('tagSearch', tagSearch);
		if (data.filters.q) params.set('q', data.filters.q);
		if (data.filters.kind) params.set('kind', data.filters.kind);
		if (data.filters.tag) params.set('tag', data.filters.tag);
		if (data.filters.passage) params.set('passage', data.filters.passage);
		if (data.filters.resourceId) params.set('resource', data.filters.resourceId);
		if (data.filters.book) params.set('book', String(data.filters.book));
		if (data.filters.view === 'list') params.set('view', 'list');
		if (data.filters.deleted) params.set('deleted', '1');
		for (const [key, value] of Object.entries(overrides)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		const query = params.toString();
		return query ? `/notes?${query}` : '/notes';
	}

	function bookFilterHref(book: number): string {
		return filterUrl({
			book: data.filters.book === book ? null : String(book),
			page: null
		});
	}

	function bookFilterLabel(book: number): string {
		return t('documents.library.filterBook', { book: bookShortName(book) });
	}

	function hasTagChildren(id: string): boolean {
		return data.tagTree.some((tag) => tag.parentId === id);
	}

	function tagIsVisible(path: string): boolean {
		if (tagQuery) return matchingTagPaths.has(path);
		const segments = path.split('/');
		for (let length = 1; length < segments.length; length += 1) {
			if (!expandedTags.has(segments.slice(0, length).join('/'))) return false;
		}
		return true;
	}

	function toggleTag(path: string): void {
		if (expandedTags.has(path)) expandedTags.delete(path);
		else expandedTags.add(path);
	}
</script>

<svelte:head>
	<meta
		name="description"
		content="Private und veröffentlichbare Notizen mit Bibelstellen und Schlagwörtern."
	/>
</svelte:head>

<main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-9" data-testid="notes-library">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-xs font-bold tracking-[0.16em] text-accent-700 uppercase dark:text-accent-300">
				{t('app.name')}
			</p>
			<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
				{t('documents.library.title')}
			</h1>
			<p class="mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
				{t('documents.library.subtitle')}
			</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<a
				href="/notes/published"
				class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-[color:var(--surface-raised)] px-3 py-2 text-sm font-semibold shadow-sm hover:border-accent-400 dark:border-white/12"
			>
				<Icon name="globe" class="size-4" />
				Veröffentlichte Notizen
			</a>
			<a
				href="/notes/import"
				class="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-[color:var(--surface-raised)] px-3 py-2 text-sm font-semibold shadow-sm hover:border-accent-400 dark:border-white/12"
			>
				<Icon name="upload" class="size-4" />
				{t('action.import')}
			</a>
		</div>
	</header>

	<DocumentAreaNav active="notes" />

	{#if form?.error}
		<p
			class="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
			role="alert"
		>
			{form.error}
		</p>
	{/if}

	<div class="mt-7 grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
		<aside
			class="space-y-5 rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-4 shadow-[var(--shadow-soft)] lg:sticky lg:top-[calc(var(--header-height)+1rem)] dark:border-white/8"
		>
			<section>
				<h2 class="text-sm font-semibold">{t('documents.library.new')}</h2>
				<form method="POST" action="?/create" class="mt-2">
					<input type="hidden" name="kind" value="note" />
					<button
						type="submit"
						class="dark:hover:bg-accent-950/25 flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50/70 px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:border-accent-300 hover:bg-accent-50/60 dark:border-white/8 dark:bg-white/3"
					>
						<Icon name="file-text" class="size-4.5 text-accent-600" />
						{t('documents.create.note')}
					</button>
				</form>
			</section>

			<section
				class="border-t border-stone-200 pt-4 dark:border-white/8"
				data-tour-target="documents-tags"
			>
				<h2 class="text-sm font-semibold">{t('documents.tags.title')}</h2>
				<input
					type="search"
					value={tagSearch}
					oninput={(event) => searchTags(event.currentTarget.value)}
					aria-label={t('documents.tags.search')}
					placeholder={t('documents.tags.search')}
					class="mt-2 w-full rounded-lg border border-stone-200 bg-transparent px-3 py-2 text-sm dark:border-white/15"
				/>
				{#if tagQuery && matchingTagPaths.size === 0}
					<p class="mt-2 text-xs text-stone-500" role="status">{t('documents.tags.noResults')}</p>
				{/if}
				<nav
					class="tag-tree mt-2 space-y-0.5 overflow-y-auto"
					aria-label={t('documents.tags.title')}
				>
					<a href={filterUrl({ tag: null })} class:active={!data.filters.tag} class="tag-filter">
						<Icon name="tag" class="size-3.5" />
						{t('documents.library.all')}
					</a>
					{#each data.tagTree as tag (tag.id)}
						{#if tagIsVisible(tag.path)}
							<div
								class="tag-row"
								style="padding-left: {Math.min(7, tag.path.split('/').length - 1) * 0.75}rem"
							>
								{#if hasTagChildren(tag.id)}
									<button
										type="button"
										class="tag-toggle"
										aria-label={!tagQuery && !expandedTags.has(tag.path)
											? t('documents.tags.expand')
											: t('documents.tags.collapse')}
										aria-expanded={Boolean(tagQuery) || expandedTags.has(tag.path)}
										disabled={Boolean(tagQuery)}
										onclick={() => toggleTag(tag.path)}
									>
										<Icon name="chevron-down" class="size-3.5" />
									</button>
								{:else}
									<span class="tag-spacer" aria-hidden="true"></span>
								{/if}
								<a
									href={filterUrl({ tag: tag.path })}
									class:active={data.filters.tag === tag.path}
									class="tag-filter min-w-0 flex-1"
								>
									<span class="truncate">{tag.name}</span>
									<span class="tag-count">({tag.documentCount})</span>
								</a>
							</div>
						{/if}
					{/each}
				</nav>
			</section>

			<section class="border-t border-stone-200 pt-4 dark:border-white/8">
				<a
					href={filterUrl({ deleted: data.filters.deleted ? null : '1' })}
					class:active={data.filters.deleted}
					class="tag-filter"
				>
					<Icon name="trash" class="size-3.5" />
					{t('documents.library.trash')}
				</a>
			</section>
		</aside>

		<section class="min-w-0">
			<form
				method="GET"
				data-tour-target="documents-search"
				class="rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-4 shadow-[var(--shadow-soft)] dark:border-white/8"
				aria-label={t('action.search')}
			>
				<div
					class="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1.5fr)_minmax(11rem,1fr)_12rem_auto]"
				>
					<label class="relative block sm:col-span-2 xl:col-span-1">
						<span class="sr-only">{t('documents.library.search')}</span>
						<Icon
							name="search"
							class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400"
						/>
						<input
							type="search"
							name="q"
							value={data.filters.q}
							placeholder={t('documents.library.search')}
							class="filter-control search-control"
						/>
					</label>

					<label>
						<span class="sr-only">{t('documents.passageFilter')}</span>
						<input
							name="passage"
							value={data.filters.passage}
							placeholder={t('documents.passageFilter')}
							class="filter-control"
						/>
					</label>

					<label>
						<span class="sr-only">{t('documents.passages.translation')}</span>
						<select name="resource" class="filter-control" value={data.filters.resourceId ?? ''}>
							<option value="">{t('documents.library.all')}</option>
							<option value="canonical">{t('documents.passages.canonical')}</option>
							{#each data.bibles as bible (bible.id)}
								<option value={bible.id}>{bible.tabTitle ?? bible.abbrev}</option>
							{/each}
						</select>
					</label>

					<input type="hidden" name="tag" value={data.filters.tag} />
					{#if tagSearch}<input type="hidden" name="tagSearch" value={tagSearch} />{/if}
					{#if data.filters.book}<input type="hidden" name="book" value={data.filters.book} />{/if}
					{#if data.filters.view === 'list'}<input type="hidden" name="view" value="list" />{/if}
					{#if data.filters.deleted}<input type="hidden" name="deleted" value="1" />{/if}
					<button
						type="submit"
						class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-accent-700"
					>
						<Icon name="search" class="size-4" />
						{t('action.search')}
					</button>
				</div>
			</form>

			{#if data.filterError}
				<p
					class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
					role="alert"
				>
					{t('documents.library.noResults')}
				</p>
			{/if}

			{#if data.bookCounts.some((entry) => entry.count > 0) || data.filters.book}
				<div
					class="book-summary mt-4 overflow-x-auto rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] p-4 shadow-[var(--shadow-soft)] dark:border-white/8"
				>
					<BookDistribution
						counts={data.bookCounts}
						label={t('documents.library.byBook')}
						countLabel={(count) =>
							count === 1 ? t('documents.library.oneNote') : t('documents.library.notesCount')}
						hrefForBook={bookFilterHref}
						filterLabel={bookFilterLabel}
						activeBook={data.filters.book}
					/>
					{#if data.filters.book}
						<a class="clear-book-filter" href={filterUrl({ book: null, page: null })}>
							{t('documents.library.clearBookFilter')}
						</a>
					{/if}
				</div>
			{/if}

			<div class="mt-4 flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold text-stone-600 dark:text-stone-300">
					{data.filters.deleted ? t('documents.library.trash') : t('documents.library.active')}
				</h2>
				<div class="flex items-center gap-2">
					<span class="text-xs text-stone-400">{data.pagination.total}</span>
					<nav class="view-switch" aria-label={t('documents.library.view')}>
						<a
							href={filterUrl({ view: null, page: null })}
							aria-current={data.filters.view === 'cards' ? 'page' : undefined}
							aria-label={t('documents.library.cards')}
							title={t('documents.library.cards')}
						>
							<Icon name="layout" class="size-4" />
						</a>
						<a
							href={filterUrl({ view: 'list', page: null })}
							aria-current={data.filters.view === 'list' ? 'page' : undefined}
							aria-label={t('documents.library.list')}
							title={t('documents.library.list')}
						>
							<Icon name="list" class="size-4" />
						</a>
					</nav>
				</div>
			</div>
			{#if data.pagination.pageCount > 1}
				<nav
					aria-label={t('documents.pagination.label')}
					class="mt-3 flex items-center justify-between gap-3 text-sm"
				>
					{#if data.pagination.page > 1}
						<a class="tag-filter" href={filterUrl({ page: String(data.pagination.page - 1) })}
							>{t('documents.pagination.previous')}</a
						>
					{:else}<span></span>{/if}
					<span aria-current="page"
						>{t('documents.pagination.page', {
							page: data.pagination.page,
							total: data.pagination.pageCount
						})}</span
					>
					{#if data.pagination.page < data.pagination.pageCount}
						<a class="tag-filter" href={filterUrl({ page: String(data.pagination.page + 1) })}
							>{t('documents.pagination.next')}</a
						>
					{:else}<span></span>{/if}
				</nav>
			{/if}

			{#if data.documents.length === 0}
				<div
					class="mt-3 rounded-2xl border border-dashed border-stone-300 bg-[color:var(--surface)] px-6 py-16 text-center dark:border-stone-700"
				>
					<Icon name="file-text" class="mx-auto size-9 text-stone-300 dark:text-stone-600" />
					<p class="mt-4 font-semibold">
						{data.filters.q ||
						data.filters.kind ||
						data.filters.tag ||
						data.filters.passage ||
						data.filters.book
							? t('documents.library.noResults')
							: t('documents.library.empty')}
					</p>
					{#if !(data.filters.q || data.filters.kind || data.filters.tag || data.filters.passage || data.filters.book)}
						<p class="mx-auto mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">
							{t('documents.library.emptyHint')}
						</p>
					{/if}
				</div>
			{:else}
				<ul class="document-results mt-3" class:list-view={data.filters.view === 'list'}>
					{#each data.documents as document (document.id)}
						<li
							class="document-card group relative flex min-h-48 flex-col rounded-2xl border border-stone-200/80 bg-[color:var(--surface)] shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md dark:border-white/8"
						>
							<a
								href={documentUrl(document.id)}
								class="document-card-link flex min-h-0 flex-1 flex-col p-5"
							>
								<div class="document-title-block">
									<div class="flex items-center justify-between gap-2">
										<span
											class="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-700 dark:text-accent-300"
										>
											<Icon name={kindIcon(document.kind)} class="size-3.5" />
											{kindLabel(document.kind)}
										</span>
										<span
											class="rounded-full bg-stone-100 px-2 py-0.5 text-[0.68rem] text-stone-500 dark:bg-white/6 dark:text-stone-400"
										>
											{visibilityLabel(document.visibility)}
										</span>
									</div>
									<h3 class="mt-3 line-clamp-2 font-serif text-lg leading-snug font-semibold">
										{document.title}
									</h3>
								</div>
								{#if document.plainText}
									<p
										class="document-excerpt mt-2 line-clamp-3 text-sm leading-relaxed text-stone-500 dark:text-stone-400"
									>
										{excerpt(document.plainText)}
									</p>
								{/if}
								<div class="document-timestamp mt-auto pt-4 text-xs text-stone-400">
									<span>
										{t('documents.library.updated', {
											date: dateFormat.format(new Date(document.updatedAt))
										})}
									</span>
									{#if document.source === 'legacy-verse-comment'}
										<span class="mt-1 block text-[0.68rem] text-stone-400">
											{t('documents.library.sourceLegacy')}
										</span>
									{/if}
								</div>
							</a>

							<form
								method="POST"
								action={data.filters.deleted ? '?/restore' : '?/softDelete'}
								class="absolute right-3 bottom-3 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100"
								onsubmit={(event) => {
									if (!data.filters.deleted && !confirm(t('documents.deleteConfirm'))) {
										event.preventDefault();
									}
								}}
							>
								<input type="hidden" name="id" value={document.id} />
								<input type="hidden" name="revision" value={document.revision} />
								<button
									type="submit"
									class="icon-button bg-[color:var(--surface-raised)] shadow-sm"
									aria-label={data.filters.deleted ? t('documents.restore') : t('documents.delete')}
									title={data.filters.deleted ? t('documents.restore') : t('documents.delete')}
								>
									<Icon name={data.filters.deleted ? 'arrow-right' : 'trash'} class="size-4" />
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

<style>
	.filter-control {
		width: 100%;
		min-height: 2.5rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.75rem;
		background: var(--surface-raised);
		padding: 0.45rem 0.75rem;
		font-size: 0.82rem;
		outline: none;
	}
	.filter-control:focus {
		border-color: var(--color-accent-500);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}
	.search-control {
		padding-left: 2.25rem;
	}
	.clear-book-filter {
		display: inline-flex;
		margin-top: 0.25rem;
		border-radius: 0.6rem;
		padding: 0.4rem 0.65rem;
		color: var(--color-accent-700);
		font-size: 0.75rem;
		font-weight: 650;
	}
	.clear-book-filter:hover,
	.clear-book-filter:focus-visible {
		background: var(--color-accent-50);
	}
	.view-switch {
		display: inline-flex;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.6rem;
		background: var(--surface-raised);
		padding: 0.15rem;
	}
	.view-switch a {
		display: inline-flex;
		width: 1.9rem;
		height: 1.9rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.45rem;
		color: var(--color-stone-400);
	}
	.view-switch a:hover,
	.view-switch a:focus-visible,
	.view-switch a[aria-current='page'] {
		background: var(--color-stone-100);
		color: var(--color-accent-700);
	}
	.document-results {
		display: grid;
		gap: 0.75rem;
	}
	.document-results.list-view .document-card {
		min-height: 0;
	}
	@media (min-width: 640px) {
		.document-results:not(.list-view) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 768px) {
		.document-results.list-view .document-card-link {
			display: grid;
			grid-template-columns: minmax(12rem, 0.8fr) minmax(0, 1.2fr) minmax(9rem, auto);
			align-items: center;
			gap: 1.25rem;
		}
		.document-results.list-view .document-title-block h3 {
			margin-top: 0.35rem;
			font-size: 1rem;
		}
		.document-results.list-view .document-excerpt {
			margin-top: 0;
			line-clamp: 2;
			-webkit-line-clamp: 2;
		}
		.document-results.list-view .document-timestamp {
			margin-top: 0;
			padding: 0 2.5rem 0 0;
			text-align: right;
		}
	}
	@media (min-width: 1536px) {
		.document-results:not(.list-view) {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.tag-tree {
		max-height: min(34rem, calc(100dvh - 18rem));
		min-height: min(18rem, 40dvh);
	}
	.tag-row {
		display: flex;
		align-items: center;
	}
	.tag-toggle,
	.tag-spacer {
		display: inline-flex;
		width: 1.65rem;
		height: 2rem;
		flex: 0 0 1.65rem;
		align-items: center;
		justify-content: center;
		color: var(--color-stone-400);
	}
	.tag-toggle[aria-expanded='false'] :global(svg) {
		transform: rotate(-90deg);
	}
	.tag-filter {
		display: flex;
		min-height: 2rem;
		align-items: center;
		gap: 0.4rem;
		border-radius: 0.5rem;
		padding: 0.35rem 0.55rem;
		color: var(--color-stone-600);
		font-size: 0.78rem;
	}
	.tag-filter:hover,
	.tag-filter.active {
		background: var(--color-stone-100);
		color: var(--color-accent-800);
	}
	.tag-count {
		flex: 0 0 auto;
		color: var(--color-stone-400);
		font-variant-numeric: tabular-nums;
	}
	:global(.dark) .filter-control {
		border-color: var(--color-stone-700);
		background: color-mix(in oklab, white 4%, transparent);
	}
	:global(.dark) .clear-book-filter:hover,
	:global(.dark) .clear-book-filter:focus-visible,
	:global(.dark) .view-switch a:hover,
	:global(.dark) .view-switch a:focus-visible,
	:global(.dark) .view-switch a[aria-current='page'] {
		background: color-mix(in oklab, white 7%, transparent);
		color: var(--color-accent-300);
	}
	:global(.dark) .view-switch {
		border-color: var(--color-stone-700);
	}
	:global(.dark) .tag-filter {
		color: var(--color-stone-400);
	}
	:global(.dark) .tag-filter:hover,
	:global(.dark) .tag-filter.active {
		background: color-mix(in oklab, white 7%, transparent);
		color: var(--color-accent-300);
	}
</style>
