<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import type { ReadableResource } from '$lib/server/repositories/resources';

	/**
	 * Full-screen picker for adding a resource tab to a reader tile instead of a small anchored
	 * dropdown — the list of Bibles, commentaries and
	 * cross-reference works is long enough, and important enough a choice, to deserve its own screen
	 * rather than a menu that clips at the edge of the viewport.
	 *
	 * One instance lives at the reader page level and is reused for every tile: `openAt()` carries
	 * the per-call context (which tile and what is already open there) rather than static props.
	 */
	let {
		resources,
		label
	}: {
		resources: ReadableResource[];
		label: string;
	} = $props();

	type Context = {
		action: '?/addTab';
		readerUrl: string;
		tileId: string;
		chosen: string[];
	};

	const GROUPS = [
		{ kind: 'bible', labelKey: 'resource.group.bibles', icon: 'book' },
		{ kind: 'commentary', labelKey: 'resource.group.commentaries', icon: 'chat' },
		{ kind: 'xrefs', labelKey: 'resource.group.xrefs', icon: 'link' },
		{ kind: 'lexicon', labelKey: 'resource.kind.lexicon', icon: 'book' }
	] as const;

	let dialog: HTMLDialogElement | undefined = $state();
	let context: Context | undefined = $state();
	let activeKind: string | undefined = $state();
	let query = $state('');

	const groups = $derived(
		GROUPS.map((group) => ({
			...group,
			label: t(group.labelKey),
			resources: resources.filter((resource) => resource.kind === group.kind)
		})).filter((group) => group.resources.length > 0)
	);

	const activeGroup = $derived(groups.find((group) => group.kind === activeKind) ?? groups[0]);

	const visible = $derived(
		(activeGroup?.resources ?? []).filter((resource) => {
			// Within one tile a resource only needs one tab. The same resource remains available in every
			// other tile, which is useful for comparing independent link sets.
			if (context?.chosen.includes(resource.id)) return false;

			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			return (
				resource.selectionTitle.toLowerCase().includes(needle) ||
				(resource.selectionSubtitle?.toLowerCase().includes(needle) ?? false) ||
				resource.coverTitle.toLowerCase().includes(needle) ||
				resource.tabTitle.toLowerCase().includes(needle)
			);
		})
	);

	export function openAt(next: Context): void {
		context = next;
		query = '';
		activeKind = groups[0]?.kind;
		dialog?.showModal();
	}

	export function close(): void {
		dialog?.close();
	}
</script>

<dialog
	bind:this={dialog}
	aria-label={label}
	class="translation-dialog"
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
>
	{#if context}
		<div class="flex h-full min-h-0 flex-col sm:flex-row">
			<nav
				class="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-200/80 p-3
				       sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0 sm:p-4 dark:border-white/8"
			>
				<p
					class="mb-2 hidden px-2 text-[0.68rem] font-bold tracking-[0.12em] text-stone-400 uppercase sm:block dark:text-stone-500"
				>
					{t('dialog.categories')}
				</p>
				{#each groups as group (group.kind)}
					<button
						type="button"
						class="category"
						class:active={group.kind === activeGroup?.kind}
						onclick={() => {
							activeKind = group.kind;
							query = '';
						}}
					>
						<svg viewBox="0 0 20 20" class="size-4 shrink-0" fill="currentColor" aria-hidden="true">
							{#if group.icon === 'book'}
								<path
									d="M3.5 3.75A1.75 1.75 0 0 1 5.25 2h2.5c.966 0 1.822.46 2.25 1.166A2.75 2.75 0 0 1 12.25 2h2.5a1.75 1.75 0 0 1 1.75 1.75v9.5a1.75 1.75 0 0 1-1.75 1.75h-2.19c-.7 0-1.368.29-1.849.8l-.336.355a.75.75 0 0 1-1.09 0l-.336-.355a2.5 2.5 0 0 0-1.849-.8H5.25a1.75 1.75 0 0 1-1.75-1.75v-9.5ZM9.25 5a1.25 1.25 0 0 0-1.25-1.25h-2.5a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2.19c.63 0 1.234.183 1.75.516L9.25 5Z"
								/>
							{:else if group.icon === 'chat'}
								<path
									fill-rule="evenodd"
									d="M2 10c0-3.5 3.36-6 8-6s8 2.5 8 6-3.36 6-8 6a9.7 9.7 0 0 1-2.4-.298L4.5 17l.6-2.87A5.6 5.6 0 0 1 2 10Z"
									clip-rule="evenodd"
								/>
							{:else}
								<path
									d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3ZM7.768 15.768a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 0 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3Z"
								/>
							{/if}
						</svg>
						<span class="truncate">{group.label}</span>
						<span class="category-count">{group.resources.length}</span>
					</button>
				{/each}
			</nav>

			<div class="flex min-w-0 flex-1 flex-col">
				<div class="flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-5">
					<div>
						<p
							class="text-[0.68rem] font-bold tracking-[0.12em] text-accent-700 uppercase dark:text-accent-300"
						>
							Ressource öffnen
						</p>
						<h2
							class="mt-0.5 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50"
						>
							{activeGroup?.label}
						</h2>
					</div>
					<button
						type="button"
						onclick={close}
						aria-label={t('action.close')}
						class="icon-button -mt-1"
					>
						<svg viewBox="0 0 20 20" class="size-5" fill="currentColor" aria-hidden="true">
							<path
								d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
							/>
						</svg>
					</button>
				</div>

				<div class="px-4 py-4 sm:px-6">
					<div class="relative">
						<svg
							viewBox="0 0 20 20"
							class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-stone-400"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fill-rule="evenodd"
								d="M9 3.5a5.5 5.5 0 1 0 3.66 9.605l3.617 3.618a.75.75 0 1 0 1.06-1.06l-3.617-3.618A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
							/>
						</svg>
						<input
							type="search"
							bind:value={query}
							placeholder={t('dialog.searchTranslation')}
							autocomplete="off"
							spellcheck="false"
							class="w-full rounded-xl border border-stone-300 bg-white py-2.5 pr-3 pl-9 text-sm shadow-sm
							       focus:border-accent-500 focus:ring-3 focus:ring-accent-500/10 focus:outline-none
							       dark:border-white/12 dark:bg-white/5 dark:text-stone-100 dark:placeholder:text-stone-500"
						/>
					</div>
				</div>

				<ul class="resource-grid min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6">
					{#each visible as resource (resource.id)}
						{@const isSelected = false}
						{@const isChosen = false}
						<li>
							<form
								method="POST"
								action={context.action}
								use:enhance={() => {
									const readerUrl = context?.readerUrl;
									return async ({ result, update }) => {
										close();
										await update({ reset: false, invalidateAll: result.type !== 'success' });
										if (result.type === 'success' && readerUrl) {
											await goto(readerUrl, { replaceState: true, invalidateAll: true });
										}
									};
								}}
							>
								<input type="hidden" name="tileId" value={context.tileId} />
								<input type="hidden" name="resource" value={resource.id} />
								<button type="submit" class="entry" class:selected={isSelected}>
									<span
										class="cover"
										class:commentary={resource.kind === 'commentary'}
										class:xrefs={resource.kind === 'xrefs'}
										aria-hidden="true"
									>
										<span class="cover-mark" aria-hidden="true">✦</span>
										<span class="cover-title">{resource.coverTitle}</span>
										<span class="cover-rule"></span>
										<span class="cover-kind">{activeGroup?.label}</span>
									</span>
									<span class="resource-meta">
										<span class="resource-name">{resource.selectionTitle}</span>
										{#if resource.selectionSubtitle}
											<span class="resource-abbrev">{resource.selectionSubtitle}</span>
										{/if}
									</span>
									{#if isSelected}
										<svg
											viewBox="0 0 20 20"
											class="selected-check"
											fill="currentColor"
											aria-hidden="true"
										>
											<path
												fill-rule="evenodd"
												d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
												clip-rule="evenodd"
											/>
										</svg>
									{/if}
									{#if isChosen}
										<span class="in-use" title={t('resource.inUse')}>{t('resource.inUse')}</span>
									{/if}
								</button>
							</form>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
</dialog>

<style>
	.translation-dialog {
		box-sizing: border-box;
		/* The app's global CSS reset zeroes every element's margin, which is also how the UA stylesheet
		   centers an open <dialog> (`margin: auto` against `inset: 0`) — restoring both here explicitly
		   is what keeps it centered instead of pinned to the top-left corner. */
		position: fixed;
		inset: 0;
		margin: auto;
		width: min(64rem, calc(100vw - 2rem));
		height: min(42rem, calc(100dvh - 2rem));
		max-width: none;
		max-height: none;
		padding: 0;
		border: 1px solid var(--color-stone-200);
		border-radius: 1rem;
		background: var(--surface-raised);
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.15),
			0 8px 10px -6px rgb(0 0 0 / 0.1);
	}

	.translation-dialog::backdrop {
		background: rgb(17 24 18 / 0.55);
		backdrop-filter: blur(7px);
	}

	:global(.dark) .translation-dialog {
		border-color: var(--color-stone-700);
		background: var(--surface-raised);
	}

	.category {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.625rem;
		padding: 0.6rem 0.7rem;
		color: var(--color-stone-600);
		font-size: 0.875rem;
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
	}

	:global(.dark) .category {
		color: var(--color-stone-300);
	}

	.category:hover {
		background: var(--color-stone-100);
	}

	:global(.dark) .category:hover {
		background: var(--color-stone-800);
	}

	.category.active {
		background: color-mix(in oklab, var(--color-accent-500) 10%, transparent);
		color: var(--color-accent-700);
	}

	.category-count {
		margin-left: auto;
		min-width: 1.45rem;
		padding: 0.08rem 0.35rem;
		border-radius: 999px;
		background: color-mix(in oklab, currentColor 8%, transparent);
		font-size: 0.68rem;
		text-align: center;
	}

	.resource-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-content: start;
		gap: 1rem;
	}

	:global(.dark) .category.active {
		color: var(--color-accent-300);
	}

	.entry {
		position: relative;
		display: grid;
		grid-template-columns: 4.35rem minmax(0, 1fr);
		width: 100%;
		min-height: 7.2rem;
		align-items: stretch;
		gap: 0.9rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.8rem;
		padding: 0.65rem;
		background: color-mix(in oklab, var(--surface) 88%, transparent);
		box-shadow: 0 1px 2px rgb(28 25 23 / 0.04);
		color: var(--color-stone-900);
		text-align: left;
		transition:
			transform 150ms ease,
			border-color 150ms ease,
			box-shadow 150ms ease;
	}

	:global(.dark) .entry {
		border-color: var(--color-stone-700);
		color: var(--color-stone-100);
	}

	.entry:hover {
		border-color: color-mix(in oklab, var(--color-accent-500) 50%, var(--color-stone-200));
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgb(28 25 23 / 0.09);
	}

	.entry.selected {
		border-color: var(--color-accent-500);
		background: color-mix(in oklab, var(--color-accent-500) 6%, transparent);
	}

	.cover {
		display: flex;
		min-width: 0;
		flex-direction: column;
		justify-content: flex-end;
		padding: 0.55rem;
		border-radius: 0.35rem 0.55rem 0.55rem 0.35rem;
		background: linear-gradient(145deg, #397a49, #173e2a);
		box-shadow:
			inset 3px 0 rgb(255 255 255 / 0.13),
			0 3px 7px rgb(28 25 23 / 0.18);
		color: white;
	}

	.cover.commentary {
		background: linear-gradient(145deg, #786547, #46351f);
	}
	.cover.xrefs {
		background: linear-gradient(145deg, #526b78, #293c47);
	}
	.cover-mark {
		margin-bottom: auto;
		font-size: 0.7rem;
		opacity: 0.72;
	}
	.cover-title {
		overflow: hidden;
		font-family: var(--font-serif);
		font-size: 0.8rem;
		font-weight: 700;
		line-height: 1.15;
		text-overflow: ellipsis;
	}
	.cover-rule {
		width: 1.25rem;
		margin: 0.32rem 0;
		border-top: 1px solid rgb(255 255 255 / 0.45);
	}
	.cover-kind {
		overflow: hidden;
		font-size: 0.48rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-overflow: ellipsis;
		opacity: 0.72;
	}
	.resource-meta {
		display: flex;
		min-width: 0;
		flex-direction: column;
		justify-content: center;
	}
	.resource-name {
		display: -webkit-box;
		overflow: hidden;
		font-weight: 650;
		line-height: 1.3;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
	.resource-abbrev {
		margin-top: 0.35rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}

	:global(.dark) .resource-abbrev {
		color: var(--color-stone-400);
	}
	.selected-check {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		width: 1.25rem;
		color: var(--color-accent-600);
	}
	.in-use {
		position: absolute;
		right: 0.55rem;
		bottom: 0.55rem;
		color: var(--color-stone-400);
		font-size: 0.62rem;
	}

	@media (max-width: 639px) {
		.translation-dialog {
			width: calc(100vw - 1rem);
			height: calc(100dvh - 1rem);
		}
		.resource-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.category {
			flex: 0 0 auto;
		}
		.category-count {
			display: none;
		}
	}
</style>
