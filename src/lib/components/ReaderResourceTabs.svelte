<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formatReference, type VerseRef } from '$lib/bible/reference';
	import type { ReaderTile } from '$lib/reader/workspace';
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import Menu from './Menu.svelte';

	let {
		tile,
		tileIndex,
		tiles,
		resources,
		readerUrl,
		currentReference,
		onOpenResource
	}: {
		tile: ReaderTile;
		tileIndex: number;
		tiles: ReaderTile[];
		resources: ReadableResource[];
		readerUrl: (reference?: VerseRef) => string;
		currentReference: VerseRef;
		onOpenResource: (tileId: string) => void;
	} = $props();

	let moveForm = $state<HTMLFormElement>();
	let moveFromTile = $state<HTMLInputElement>();
	let moveTab = $state<HTMLInputElement>();
	let moveToTile = $state<HTMLInputElement>();
	let moveToIndex = $state<HTMLInputElement>();
	let draggedTabId = $state<string | null>(null);
	let moveMenu = $state<Menu>();

	const byId = $derived(new Map(resources.map((resource) => [resource.id, resource])));
	const activeTab = $derived(tile.tabs.find((tab) => tab.id === tile.activeTabId) ?? tile.tabs[0]);

	function submitEnhancement(reference?: VerseRef): SubmitFunction {
		const url = readerUrl(reference);
		return () => {
			return async ({ result, update }) => {
				moveMenu?.close();
				await update({ reset: false, invalidateAll: result.type !== 'success' });
				if (result.type === 'success') {
					const path =
						result.data &&
						typeof result.data === 'object' &&
						'path' in result.data &&
						typeof result.data.path === 'string'
							? `${result.data.path}${window.location.search}${window.location.hash}`
							: url;
					await goto(path, {
						replaceState: true,
						invalidateAll: true,
						noScroll: true,
						keepFocus: true
					});
					// A scroll may already have shallowly replaced the address bar with `path` while this
					// action was in flight. In that case `goto()` is intentionally a no-op; force the
					// server data refresh so the newly active tab cannot keep its pre-scroll props.
					await invalidateAll();
				}
			};
		};
	}

	function referenceAfterClose(tabId: string): VerseRef | undefined {
		const index = tile.tabs.findIndex((tab) => tab.id === tabId);
		return tile.tabs[index + 1]?.reference ?? tile.tabs[index - 1]?.reference;
	}

	function onTabKeydown(event: KeyboardEvent): void {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		const tablist = event.currentTarget as HTMLElement;
		const buttons = [...tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
		if (buttons.length === 0) return;
		const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
		const index =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
		event.preventDefault();
		buttons[index]?.focus();
		buttons[index]?.click();
	}

	function startDrag(event: DragEvent, tabId: string): void {
		draggedTabId = tabId;
		event.dataTransfer?.setData(
			'application/x-akribos-tab',
			JSON.stringify({ fromTileId: tile.id, tabId })
		);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function dropTab(event: DragEvent, targetIndex: number): void {
		event.preventDefault();
		let payload: { fromTileId?: string; tabId?: string };
		try {
			payload = JSON.parse(event.dataTransfer?.getData('application/x-akribos-tab') ?? '{}');
		} catch {
			return;
		}
		if (
			!payload.fromTileId ||
			!payload.tabId ||
			!moveForm ||
			!moveFromTile ||
			!moveTab ||
			!moveToTile ||
			!moveToIndex
		)
			return;
		moveFromTile.value = payload.fromTileId;
		moveTab.value = payload.tabId;
		moveToTile.value = tile.id;
		moveToIndex.value = String(targetIndex);
		moveForm.requestSubmit();
		draggedTabId = null;
	}
</script>

<header
	class="resource-tabs"
	data-testid="resource-tabs"
	role="group"
	aria-label="Tabs für Bereich {tileIndex + 1}"
	ondragover={(event) => event.preventDefault()}
	ondrop={(event) => dropTab(event, tile.tabs.length)}
>
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		role="tablist"
		aria-label="Ressourcen in Bereich {tileIndex + 1}"
		class="tab-strip"
		onkeydown={onTabKeydown}
	>
		{#each tile.tabs as tab, tabIndex (tab.id)}
			{@const resource = byId.get(tab.resourceId)}
			{#if resource}
				<div
					role="group"
					aria-label={resource.tabTitle}
					class="resource-tab"
					class:active={tab.id === activeTab?.id}
					class:dragging={tab.id === draggedTabId}
					draggable="true"
					ondragstart={(event) => startDrag(event, tab.id)}
					ondragend={() => (draggedTabId = null)}
					ondragover={(event) => event.preventDefault()}
					ondrop={(event) => {
						event.stopPropagation();
						dropTab(event, tabIndex);
					}}
				>
					<form method="POST" action="?/activateTab" use:enhance={submitEnhancement(tab.reference)}>
						<input type="hidden" name="tileId" value={tile.id} />
						<input type="hidden" name="tabId" value={tab.id} />
						<input
							type="hidden"
							name="currentReference"
							value={formatReference(currentReference)}
						/>
						<button
							type="submit"
							role="tab"
							aria-selected={tab.id === activeTab?.id}
							tabindex={tab.id === activeTab?.id ? 0 : -1}
							class="tab-title"
							title={resource.selectionTitle}
						>
							<span>{resource.tabTitle}</span>
							{#if tab.linkSet}
								<span class="tab-link-set link-{tab.linkSet.toLowerCase()}">{tab.linkSet}</span>
							{/if}
						</button>
					</form>
					<form
						method="POST"
						action="?/closeTab"
						use:enhance={submitEnhancement(referenceAfterClose(tab.id))}
					>
						<input type="hidden" name="tileId" value={tile.id} />
						<input type="hidden" name="tabId" value={tab.id} />
						<button type="submit" class="close-tab" aria-label={`${resource.tabTitle} schließen`}>
							<svg viewBox="0 0 16 16" class="size-3" fill="currentColor" aria-hidden="true">
								<path
									d="M4.47 3.53a.75.75 0 0 0-1.06 1.06L6.82 8l-3.41 3.41a.75.75 0 1 0 1.06 1.06L7.88 9.06l3.41 3.41a.75.75 0 0 0 1.06-1.06L8.94 8l3.41-3.41a.75.75 0 0 0-1.06-1.06L7.88 6.94 4.47 3.53Z"
								/>
							</svg>
						</button>
					</form>
				</div>
			{/if}
		{/each}
	</div>

	<button
		type="button"
		class="add-tab"
		aria-label="Ressource in Bereich {tileIndex + 1} öffnen"
		title="Ressource öffnen"
		data-tour-target={tileIndex === 0 ? 'column-add' : undefined}
		onclick={() => onOpenResource(tile.id)}
	>
		<svg viewBox="0 0 16 16" class="size-4" fill="currentColor" aria-hidden="true">
			<path
				d="M8.75 3a.75.75 0 0 0-1.5 0v4.25H3a.75.75 0 0 0 0 1.5h4.25V13a.75.75 0 0 0 1.5 0V8.75H13a.75.75 0 0 0 0-1.5H8.75V3Z"
			/>
		</svg>
	</button>

	{#if activeTab && tiles.length > 1}
		<button
			type="button"
			class="move-tab"
			aria-label="Tab verschieben"
			title="Tab verschieben"
			onclick={(event) => moveMenu?.openAt(event.currentTarget)}>•••</button
		>
		<Menu bind:this={moveMenu} label="Tab verschieben">
			<p class="move-label">Verschieben nach</p>
			{#each tiles as target, targetIndex (target.id)}
				{#if target.id !== tile.id}
					<form
						method="POST"
						action="?/moveTab"
						use:enhance={submitEnhancement(activeTab.reference)}
						role="none"
					>
						<input type="hidden" name="fromTileId" value={tile.id} />
						<input type="hidden" name="tabId" value={activeTab.id} />
						<input type="hidden" name="toTileId" value={target.id} />
						<input type="hidden" name="toIndex" value={target.tabs.length} />
						<button type="submit" role="menuitem">Bereich {targetIndex + 1}</button>
					</form>
				{/if}
			{/each}
		</Menu>
	{/if}
</header>

<form
	bind:this={moveForm}
	method="POST"
	action="?/moveTab"
	use:enhance={submitEnhancement()}
	class="hidden"
>
	<input bind:this={moveFromTile} type="hidden" name="fromTileId" />
	<input bind:this={moveTab} type="hidden" name="tabId" />
	<input bind:this={moveToTile} type="hidden" name="toTileId" />
	<input bind:this={moveToIndex} type="hidden" name="toIndex" />
</form>

<style>
	.resource-tabs {
		display: flex;
		min-width: 0;
		height: 2.65rem;
		flex: none;
		align-items: stretch;
		gap: 0.15rem;
		overflow: hidden;
		border-bottom: 1px solid var(--line);
		background: color-mix(in oklab, var(--surface) 94%, var(--color-stone-100));
	}

	.tab-strip {
		display: flex;
		min-width: 0;
		flex: 1;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	.tab-strip::-webkit-scrollbar {
		display: none;
	}

	.resource-tab {
		position: relative;
		display: flex;
		min-width: 5.25rem;
		max-width: 10rem;
		flex: 0 1 8rem;
		align-items: center;
		border-right: 1px solid var(--line);
		color: var(--color-stone-500);
	}
	.resource-tab.active {
		background: var(--surface);
		color: var(--color-stone-900);
	}
	.resource-tab.active::after {
		position: absolute;
		right: 0.4rem;
		bottom: -1px;
		left: 0.4rem;
		height: 2px;
		border-radius: 2px;
		background: var(--color-accent-500);
		content: '';
	}
	.resource-tab.dragging {
		opacity: 0.35;
	}
	.resource-tab form:first-child {
		min-width: 0;
		flex: 1;
	}

	.tab-title {
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: center;
		gap: 0.38rem;
		padding: 0.68rem 0.2rem 0.62rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 650;
	}
	.tab-title > span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tab-link-set {
		display: inline-flex;
		width: 1.15rem;
		height: 1.15rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 0.22rem;
		background: var(--link-color);
		font-size: 0.6rem;
		font-weight: 800;
		color: white;
	}
	.tab-link-set.link-a {
		--link-color: #f97316;
	}
	.tab-link-set.link-b {
		--link-color: #2563eb;
	}
	.tab-link-set.link-c {
		--link-color: #16a34a;
	}
	.tab-link-set.link-d {
		--link-color: #9333ea;
	}
	.tab-link-set.link-e {
		--link-color: #e11d48;
	}

	.close-tab,
	.add-tab,
	.move-tab {
		display: inline-flex;
		width: 1.75rem;
		height: 100%;
		flex: none;
		align-items: center;
		justify-content: center;
		color: var(--color-stone-400);
	}
	.close-tab:hover,
	.add-tab:hover,
	.move-tab:hover {
		background: var(--color-stone-100);
		color: var(--color-accent-700);
	}
	.move-tab {
		font-size: 0.68rem;
		letter-spacing: 0.05em;
	}
	.move-label {
		padding: 0.3rem 0.6rem;
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--color-stone-400);
		text-transform: uppercase;
	}

	:global(.dark) .resource-tab.active {
		color: var(--color-stone-50);
	}
	:global(.dark) .close-tab:hover,
	:global(.dark) .add-tab:hover,
	:global(.dark) .move-tab:hover {
		background: var(--color-stone-800);
	}

	@media (update: slow), (monochrome) {
		.resource-tabs {
			height: 3rem;
			background: var(--surface);
		}
		.close-tab,
		.add-tab,
		.move-tab {
			min-width: 2.5rem;
		}
	}
</style>
