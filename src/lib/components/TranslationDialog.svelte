<script lang="ts">
	import { announceTabHistoryMutation } from '$lib/reader/tab-history-navigation';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import {
		readerStateFromActionData,
		readerUrl as readerUrlWithState
	} from '$lib/reader/url-state';
	import type { ReadableResource } from '$lib/server/repositories/resources';
	import Icon from './Icon.svelte';
	import ResourceKindIcon from './ResourceKindIcon.svelte';

	/**
	 * Compact, anchored resource picker. A delayed hover/focus preview carries the metadata that used
	 * to make every list item a large card. One instance handles adding and replacing tabs; duplicate
	 * resources remain valid.
	 */
	let { resources, label }: { resources: ReadableResource[]; label: string } = $props();

	type Context = {
		action: string;
		readerUrl: string;
		tileId: string;
		tabId?: string;
	};

	const GROUPS = [
		{ kind: 'bible', labelKey: 'resource.group.bibles' },
		{ kind: 'commentary', labelKey: 'resource.group.commentaries' },
		{ kind: 'xrefs', labelKey: 'resource.group.xrefs' },
		{ kind: 'lexicon', labelKey: 'resource.kind.lexicon' }
	] as const;

	let dialog: HTMLDialogElement | undefined = $state();
	let searchInput: HTMLInputElement | undefined = $state();
	let context: Context | undefined = $state();
	let activeKind: string | undefined = $state();
	let query = $state('');
	let chooserStyle = $state('');
	let previewStyle = $state('');
	let previewResource: ReadableResource | undefined = $state();
	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	const groups = $derived(
		GROUPS.map((group) => ({
			...group,
			label: t(group.labelKey),
			resources: resources.filter((resource) => resource.kind === group.kind)
		})).filter((group) => group.resources.length > 0)
	);
	const activeGroup = $derived(groups.find((group) => group.kind === activeKind) ?? groups[0]);
	const visible = $derived(
		(query.trim() ? resources : (activeGroup?.resources ?? [])).filter((resource) => {
			const needle = query.trim().toLowerCase();
			return (
				!needle ||
				resource.selectionTitle.toLowerCase().includes(needle) ||
				(resource.selectionSubtitle?.toLowerCase().includes(needle) ?? false) ||
				resource.coverTitle.toLowerCase().includes(needle) ||
				resource.tabTitle.toLowerCase().includes(needle)
			);
		})
	);

	function placeChooser(anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const width = Math.min(368, window.innerWidth - 16);
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
		const highestTop = Math.max(8, window.innerHeight - 248);
		const top = Math.min(Math.max(8, rect.bottom + 6), highestTop);
		const maxHeight = Math.max(180, window.innerHeight - top - 8);
		chooserStyle = `--chooser-left:${left}px;--chooser-top:${top}px;--chooser-width:${width}px;--chooser-max-height:${maxHeight}px`;
	}

	function clearPreviewTimers(): void {
		if (previewTimer) clearTimeout(previewTimer);
		if (hideTimer) clearTimeout(hideTimer);
		previewTimer = undefined;
		hideTimer = undefined;
	}

	function closePreview(): void {
		clearPreviewTimers();
		previewResource = undefined;
	}

	function showPreview(resource: ReadableResource, anchor: HTMLElement): void {
		clearPreviewTimers();
		const chooser = dialog?.getBoundingClientRect();
		const row = anchor.getBoundingClientRect();
		const width = Math.min(360, window.innerWidth - 16);
		let left = (chooser?.right ?? row.right) + 8;
		if (left + width > window.innerWidth - 8) left = (chooser?.left ?? row.left) - width - 8;
		if (left < 8) left = 8;
		const top = Math.max(8, Math.min(row.top - 12, window.innerHeight - 280));
		const maxHeight = Math.max(220, window.innerHeight - top - 8);
		previewStyle = `--preview-left:${left}px;--preview-top:${top}px;--preview-width:${width}px;--preview-max-height:${maxHeight}px`;
		previewResource = resource;
	}

	function schedulePreview(resource: ReadableResource, anchor: HTMLElement, delay = 450): void {
		clearPreviewTimers();
		previewTimer = setTimeout(() => showPreview(resource, anchor), delay);
	}

	function schedulePreviewClose(): void {
		if (previewTimer) clearTimeout(previewTimer);
		if (hideTimer) clearTimeout(hideTimer);
		previewTimer = undefined;
		hideTimer = setTimeout(() => {
			previewResource = undefined;
			hideTimer = undefined;
		}, 180);
	}

	export function openAt(next: Context, anchor: HTMLElement): void {
		context = next;
		query = '';
		activeKind = groups[0]?.kind;
		closePreview();
		placeChooser(anchor);
		dialog?.showModal();
		requestAnimationFrame(() => searchInput?.focus());
	}

	export function close(): void {
		closePreview();
		dialog?.close();
	}
</script>

<dialog
	bind:this={dialog}
	aria-label={label}
	class="translation-dialog"
	style={chooserStyle}
	onclose={closePreview}
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
>
	{#if context}
		<div class="chooser-shell">
			<div class="search-row">
				<div class="search-field">
					<Icon name="search" class="search-icon" />
					<input
						bind:this={searchInput}
						type="search"
						bind:value={query}
						placeholder={t('dialog.searchTranslation')}
						autocomplete="off"
						spellcheck="false"
					/>
				</div>
				<button type="button" onclick={close} aria-label={t('action.close')} class="close-button">
					<Icon name="x" class="size-4" />
				</button>
			</div>

			<nav class="categories" aria-label={t('dialog.categories')}>
				{#each groups as group (group.kind)}
					<button
						type="button"
						class="category"
						class:active={!query.trim() && group.kind === activeGroup?.kind}
						aria-pressed={!query.trim() && group.kind === activeGroup?.kind}
						onclick={() => {
							activeKind = group.kind;
							query = '';
							closePreview();
						}}
					>
						<ResourceKindIcon kind={group.kind} class="category-icon" />
						<span>{group.label}</span>
						<small>{group.resources.length}</small>
					</button>
				{/each}
			</nav>

			<ul class="resource-list">
				{#each visible as resource (resource.id)}
					<li
						class="resource-row"
						onpointerenter={(event) => {
							if (event.pointerType === 'mouse') schedulePreview(resource, event.currentTarget);
						}}
						onpointerleave={schedulePreviewClose}
						onfocusin={(event) => schedulePreview(resource, event.currentTarget, 250)}
						onfocusout={schedulePreviewClose}
					>
						<form
							method="POST"
							action={context.action}
							use:enhance={() => {
								const readerUrl = context?.readerUrl;
								return async ({ result, update }) => {
									close();
									await update({ reset: false, invalidateAll: result.type !== 'success' });
									if (result.type === 'success' && readerUrl) {
										const state = readerStateFromActionData(result.data);
										if (!state) return;
										announceTabHistoryMutation(result.data);
										const path = new URL(readerUrl, window.location.origin).pathname;
										await goto(readerUrlWithState(path, state), {
											replaceState: true,
											invalidateAll: true
										});
									}
								};
							}}
						>
							<input type="hidden" name="tileId" value={context.tileId} />
							{#if context.tabId}<input type="hidden" name="tabId" value={context.tabId} />{/if}
							<input type="hidden" name="resource" value={resource.id} />
							<button type="submit" class="entry">
								<ResourceKindIcon kind={resource.kind} class="entry-icon" />
								<span class="resource-meta">
									<span class="resource-name">{resource.selectionTitle}</span>
									{#if resource.selectionSubtitle}
										<span class="resource-subtitle">{resource.selectionSubtitle}</span>
									{/if}
								</span>
							</button>
						</form>
						<button
							type="button"
							class="preview-trigger"
							aria-label="Informationen zu {resource.selectionTitle}"
							title="Werk-Informationen"
							onclick={(event) => showPreview(resource, event.currentTarget)}
						>
							<Icon name="info" class="size-3.5" />
						</button>
					</li>
				{:else}
					<li class="empty-result">Kein passendes Werk gefunden.</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if previewResource}
		<aside
			class="resource-preview"
			style={previewStyle}
			aria-label="Informationen zu {previewResource.selectionTitle}"
			onpointerenter={clearPreviewTimers}
			onpointerleave={schedulePreviewClose}
		>
			<button
				type="button"
				class="preview-close"
				aria-label="Werk-Informationen schließen"
				onclick={closePreview}
			>
				<Icon name="x" class="size-4" />
			</button>
			<div class="preview-heading">
				<span class="cover kind-{previewResource.kind}" aria-hidden="true">
					<span class="cover-mark">✦</span>
					<span class="cover-title">{previewResource.coverTitle}</span>
					<span class="cover-rule"></span>
				</span>
				<div>
					<strong>{previewResource.selectionTitle}</strong>
					{#if previewResource.selectionSubtitle}
						<em>{previewResource.selectionSubtitle}</em>
					{/if}
				</div>
			</div>
			<div class="preview-body">
				{#if previewResource.licenseHtml}
					<p>{previewResource.licenseHtml}</p>
				{:else}
					<p>Für dieses Werk sind keine weiteren Copyright-Hinweise hinterlegt.</p>
				{/if}
				{#if previewResource.usageNotesHtml}
					<!-- Dictionary usage notes come from the escaping/allow-listing import parser. -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="resource-notes">{@html previewResource.usageNotesHtml}</div>
				{/if}
			</div>
		</aside>
	{/if}
</dialog>

<style>
	.translation-dialog {
		position: fixed;
		inset: auto;
		top: var(--chooser-top, 3.5rem);
		left: var(--chooser-left, 0.5rem);
		box-sizing: border-box;
		width: var(--chooser-width, min(23rem, calc(100vw - 1rem)));
		height: auto;
		max-width: none;
		max-height: var(--chooser-max-height, calc(100dvh - 4rem));
		margin: 0;
		padding: 0;
		overflow: visible;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.75rem;
		background: var(--surface-raised);
		box-shadow: 0 18px 42px rgb(28 25 23 / 0.16);
	}
	.translation-dialog::backdrop {
		background: transparent;
	}
	:global(.dark) .translation-dialog,
	:global(.dark) .resource-preview {
		border-color: var(--color-stone-700);
	}
	.chooser-shell {
		display: flex;
		max-height: inherit;
		min-height: 14rem;
		flex-direction: column;
		overflow: hidden;
		border-radius: inherit;
		background: var(--surface-raised);
	}
	.search-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.55rem;
	}
	.search-field {
		position: relative;
		min-width: 0;
		flex: 1;
	}
	.search-field :global(.search-icon) {
		position: absolute;
		top: 50%;
		left: 0.65rem;
		width: 0.9rem;
		height: 0.9rem;
		transform: translateY(-50%);
		color: var(--color-stone-400);
		pointer-events: none;
	}
	.search-field input {
		width: 100%;
		border: 0;
		border-radius: 0.45rem;
		background: var(--color-stone-100);
		padding: 0.55rem 0.65rem 0.55rem 2rem;
		font-size: 0.82rem;
		outline: none;
	}
	.search-field input:focus {
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-accent-500) 38%, transparent);
	}
	.close-button,
	.preview-trigger,
	.preview-close {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 0.35rem;
		color: var(--color-stone-500);
	}
	.close-button {
		width: 2rem;
		height: 2rem;
	}
	.close-button:hover,
	.preview-trigger:hover,
	.preview-close:hover,
	.resource-row:hover,
	.resource-row:focus-within {
		background: var(--color-stone-100);
	}
	.categories {
		display: flex;
		gap: 0.1rem;
		overflow-x: auto;
		padding: 0 0.55rem 0.45rem;
		border-bottom: 1px solid var(--line);
		scrollbar-width: none;
	}
	.category {
		display: inline-flex;
		min-width: max-content;
		align-items: center;
		gap: 0.28rem;
		padding: 0.32rem 0.38rem;
		border-radius: 0.4rem;
		color: var(--color-stone-600);
		font-size: 0.69rem;
		font-weight: 550;
	}
	.category:hover,
	.category.active {
		background: color-mix(in oklab, var(--color-accent-500) 10%, transparent);
		color: var(--color-accent-700);
	}
	.category :global(.category-icon) {
		width: 0.85rem;
		height: 1rem;
	}
	.category small {
		color: var(--color-stone-400);
		font-size: 0.6rem;
	}
	.resource-list {
		min-height: 0;
		overflow-y: auto;
		padding: 0.25rem 0.4rem 0.45rem;
	}
	.resource-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 1.8rem;
		align-items: stretch;
		border-radius: 0.35rem;
	}
	.resource-row form {
		min-width: 0;
	}
	.entry {
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 1fr);
		width: 100%;
		min-height: 2.7rem;
		align-items: center;
		gap: 0.55rem;
		padding: 0.3rem 0.35rem;
		color: var(--color-stone-900);
		text-align: left;
	}
	.entry :global(.entry-icon) {
		width: 1.15rem;
		height: 1.35rem;
	}
	.resource-meta {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}
	.resource-name,
	.resource-subtitle {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.resource-name {
		font-size: 0.82rem;
		font-weight: 600;
	}
	.resource-subtitle {
		color: var(--color-stone-500);
		font-size: 0.65rem;
	}
	.preview-trigger {
		width: 1.8rem;
		min-height: 2.7rem;
	}
	.empty-result {
		padding: 1.5rem 0.75rem;
		color: var(--color-stone-500);
		font-size: 0.75rem;
		text-align: center;
	}
	.resource-preview {
		position: fixed;
		top: var(--preview-top);
		left: var(--preview-left);
		z-index: 1;
		box-sizing: border-box;
		width: var(--preview-width);
		max-height: var(--preview-max-height);
		overflow-y: auto;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.75rem;
		background: var(--surface-raised);
		box-shadow: 0 16px 38px rgb(28 25 23 / 0.18);
		color: var(--color-stone-900);
	}
	.preview-close {
		position: absolute;
		top: 0.45rem;
		right: 0.45rem;
		width: 1.8rem;
		height: 1.8rem;
	}
	.preview-heading {
		display: grid;
		grid-template-columns: 4.6rem minmax(0, 1fr);
		align-items: center;
		gap: 0.8rem;
		padding: 1rem 2.5rem 0.85rem 1rem;
	}
	.preview-heading strong,
	.preview-heading em {
		display: block;
	}
	.preview-heading strong {
		font-size: 0.95rem;
		line-height: 1.25;
	}
	.preview-heading em {
		margin-top: 0.3rem;
		color: var(--color-stone-500);
		font-size: 0.72rem;
	}
	.cover {
		display: flex;
		width: 4.6rem;
		height: 6.3rem;
		flex-direction: column;
		padding: 0.5rem;
		border-radius: 0.2rem 0.35rem 0.35rem 0.2rem;
		background: linear-gradient(145deg, #397a49, #173e2a);
		box-shadow:
			inset 3px 0 rgb(255 255 255 / 0.13),
			0 3px 8px rgb(28 25 23 / 0.2);
		color: white;
	}
	.cover.kind-commentary {
		background: linear-gradient(145deg, #786547, #46351f);
	}
	.cover.kind-xrefs {
		background: linear-gradient(145deg, #526b78, #293c47);
	}
	.cover.kind-lexicon {
		background: linear-gradient(145deg, #3879ad, #1d466b);
	}
	.cover-mark {
		margin-bottom: auto;
		font-size: 0.65rem;
		opacity: 0.72;
	}
	.cover-title {
		overflow: hidden;
		font-family: var(--font-serif);
		font-size: 0.7rem;
		font-weight: 700;
		line-height: 1.15;
	}
	.cover-rule {
		width: 1.2rem;
		margin-top: 0.4rem;
		border-top: 1px solid rgb(255 255 255 / 0.45);
	}
	.preview-body {
		margin: 0 1rem 1rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--line);
		font-size: 0.75rem;
		line-height: 1.55;
	}
	.preview-body :global(.resource-notes) {
		margin-top: 0.75rem;
	}
	:global(.dark) .search-field input,
	:global(.dark) .resource-row:hover,
	:global(.dark) .resource-row:focus-within,
	:global(.dark) .close-button:hover,
	:global(.dark) .preview-trigger:hover,
	:global(.dark) .preview-close:hover {
		background: var(--color-stone-800);
	}
	:global(.dark) .entry,
	:global(.dark) .resource-preview {
		color: var(--color-stone-100);
	}
	@media (max-width: 639px) {
		.translation-dialog {
			top: 0.5rem;
			left: 0.5rem;
			width: calc(100vw - 1rem);
			max-height: calc(100dvh - 1rem);
		}
		.resource-preview {
			top: auto;
			right: 0.5rem;
			bottom: 0.5rem;
			left: 0.5rem;
			width: auto;
			max-height: calc(100dvh - 1rem);
		}
	}
</style>
