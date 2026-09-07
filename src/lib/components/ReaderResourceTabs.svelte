<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formatReference, type VerseRef } from '$lib/bible/reference';
	import { activeReaderTab, type ReaderTab, type ReaderTile } from '$lib/reader/workspace';
	import {
		readerActionUrl,
		readerStateFromActionData,
		readerStateFromPage,
		readerUrl as readerUrlWithState
	} from '$lib/reader/url-state';
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';

	let {
		tile,
		tileIndex,
		tiles,
		resources,
		readerUrl,
		currentReference,
		referenceForTab,
		onOpenResource,
		mobile = false,
		selectedTileIndex = tileIndex,
		onSelectTile = () => {}
	}: {
		tile: ReaderTile;
		tileIndex: number;
		tiles: ReaderTile[];
		resources: ReadableResource[];
		readerUrl: (reference?: VerseRef) => string;
		currentReference: VerseRef;
		referenceForTab: (tileId: string, tab: ReaderTab) => VerseRef;
		onOpenResource: (tileId: string, anchor: HTMLElement) => void;
		mobile?: boolean;
		selectedTileIndex?: number;
		onSelectTile?: (tileIndex: number) => void;
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
					const state = readerStateFromActionData(result.data);
					if (!state) return;
					const path =
						result.data &&
						typeof result.data === 'object' &&
						'path' in result.data &&
						typeof result.data.path === 'string'
							? result.data.path
							: new URL(url, window.location.origin).pathname;
					const targetUrl = readerUrlWithState(path, state);
					if (`${window.location.pathname}${window.location.search}` === targetUrl) {
						// A scroll may already have shallowly installed this exact URL while the action was
						// in flight. In that one case there is no navigation to refresh the active tab.
						await invalidateAll();
					} else {
						await goto(targetUrl, {
							replaceState: true,
							invalidateAll: true,
							noScroll: true,
							keepFocus: true
						});
					}
				}
			};
		};
	}

	function actionUrl(action: string): string {
		return readerActionUrl(action, readerStateFromPage(page), page.data.activeSavedWorkspaceId);
	}

	function referenceAfterClose(ownerTile: ReaderTile, tabId: string): VerseRef | undefined {
		const index = ownerTile.tabs.findIndex((tab) => tab.id === tabId);
		return ownerTile.tabs[index + 1]?.reference ?? ownerTile.tabs[index - 1]?.reference;
	}

	function isSelected(ownerTile: ReaderTile, ownerTileIndex: number, tab: ReaderTab): boolean {
		return (
			tab.id === activeReaderTab(ownerTile)?.id && (!mobile || ownerTileIndex === selectedTileIndex)
		);
	}

	function referenceForActiveTab(ownerTile: ReaderTile): VerseRef {
		const ownerActiveTab = activeReaderTab(ownerTile);
		return ownerActiveTab ? referenceForTab(ownerTile.id, ownerActiveTab) : currentReference;
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
	class:mobile
	data-testid={mobile ? 'mobile-resource-tabs' : 'resource-tabs'}
	role="group"
	aria-label={mobile ? 'Reader-Tabs' : `Tabs für Bereich ${tileIndex + 1}`}
	ondragover={(event) => event.preventDefault()}
	ondrop={(event) => {
		if (!mobile) dropTab(event, tile.tabs.length);
	}}
>
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		role="tablist"
		aria-label={mobile ? 'Reader-Ressourcen' : `Ressourcen in Bereich ${tileIndex + 1}`}
		class="tab-strip"
		onkeydown={onTabKeydown}
	>
		{#each mobile ? tiles : [tile] as ownerTile (ownerTile.id)}
			{@const ownerTileIndex = mobile ? tiles.indexOf(ownerTile) : tileIndex}
			{#each ownerTile.tabs as tab, tabIndex (tab.id)}
				{@const resource = byId.get(tab.resourceId)}
				{@const targetReference = referenceForTab(ownerTile.id, tab)}
				{@const selected = isSelected(ownerTile, ownerTileIndex, tab)}
				{#if resource}
					<div
						role="group"
						aria-label={resource.tabTitle}
						class="resource-tab"
						class:active={selected}
						class:dragging={!mobile && tab.id === draggedTabId}
						draggable={!mobile}
						ondragstart={(event) => {
							if (!mobile) startDrag(event, tab.id);
						}}
						ondragend={() => (draggedTabId = null)}
						ondragover={(event) => event.preventDefault()}
						ondrop={(event) => {
							if (mobile) return;
							event.stopPropagation();
							dropTab(event, tabIndex);
						}}
					>
						<form
							method="POST"
							action={actionUrl('activateTab')}
							use:enhance={submitEnhancement(targetReference)}
						>
							<input type="hidden" name="tileId" value={ownerTile.id} />
							<input type="hidden" name="tabId" value={tab.id} />
							<input
								type="hidden"
								name="currentReference"
								value={formatReference(referenceForActiveTab(ownerTile))}
							/>
							<input
								type="hidden"
								name="targetReference"
								value={formatReference(targetReference)}
							/>
							<button
								type="submit"
								role="tab"
								id={mobile ? `mobile-resource-tab-${tab.id}` : undefined}
								aria-controls={mobile ? `mobile-tabpanel-${ownerTileIndex}` : undefined}
								aria-selected={selected}
								tabindex={selected ? 0 : -1}
								class="tab-title"
								title={resource.tabTitle}
								onclick={() => {
									if (mobile) onSelectTile(ownerTileIndex);
								}}
							>
								<span>{resource.tabTitle}</span>
								{#if tab.linkSet}
									<span class="tab-link-set link-{tab.linkSet.toLowerCase()}">{tab.linkSet}</span>
								{/if}
							</button>
						</form>
						<form
							method="POST"
							action={actionUrl('closeTab')}
							use:enhance={submitEnhancement(referenceAfterClose(ownerTile, tab.id))}
						>
							<input type="hidden" name="tileId" value={ownerTile.id} />
							<input type="hidden" name="tabId" value={tab.id} />
							<button type="submit" class="close-tab" aria-label={`${resource.tabTitle} schließen`}>
								<Icon name="x" class="size-3" />
							</button>
						</form>
					</div>
				{/if}
			{/each}
		{/each}
	</div>

	<button
		type="button"
		class="add-tab"
		aria-label={mobile ? 'Ressource öffnen' : `Ressource in Bereich ${tileIndex + 1} öffnen`}
		title="Ressource öffnen"
		data-tour-target={!mobile && tileIndex === 0 ? 'column-add' : undefined}
		onclick={(event) =>
			onOpenResource(tiles[selectedTileIndex]?.id ?? tile.id, event.currentTarget)}
	>
		<Icon name="plus" class="size-4" />
	</button>

	{#if !mobile && activeTab && tiles.length > 1}
		<button
			type="button"
			class="move-tab"
			aria-label="Tab verschieben"
			title="Tab verschieben"
			onclick={(event) => moveMenu?.openAt(event.currentTarget)}
			><Icon name="more-horizontal" class="size-4" /></button
		>
		<Menu bind:this={moveMenu} label="Tab verschieben">
			<p class="move-label">Verschieben nach</p>
			{#each tiles as target, targetIndex (target.id)}
				{#if target.id !== tile.id}
					<form
						method="POST"
						action={actionUrl('moveTab')}
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
	action={actionUrl('moveTab')}
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
	.resource-tabs.mobile {
		width: 100%;
		border-bottom: 0;
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
	.resource-tab form:last-child {
		display: flex;
		height: 100%;
		align-items: center;
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
		background: color-mix(in oklab, var(--link-color) 78%, var(--surface));
		font-size: 0.6rem;
		font-weight: 800;
		color: white;
	}
	.tab-link-set.link-a {
		--link-color: #b9683f;
	}
	.tab-link-set.link-b {
		--link-color: #55759b;
	}
	.tab-link-set.link-c {
		--link-color: #60836d;
	}
	.tab-link-set.link-d {
		--link-color: #776b91;
	}
	.tab-link-set.link-e {
		--link-color: #9a6572;
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
	.close-tab {
		width: 1.7rem;
		height: 1.7rem;
		margin-right: 0.12rem;
		border-radius: 0.35rem;
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
		.close-tab {
			height: 2.5rem;
			margin-right: 0;
		}
	}
</style>
