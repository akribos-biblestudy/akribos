<script module lang="ts">
	/** The verse a menu is open for. */
	export type VerseContext = {
		/** Short form for the action's `reference` field and for the URL, e.g. `Joh3,16`. */
		reference: string;
		/** Full form for headings and copied text, e.g. `Johannes 3,16`. */
		label: string;
		path: string;
		text: string;
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { BibleQuotation } from '$lib/actions/verse-hover-popover';
	import { formatCopiedVerses } from '$lib/bible/copy-verse';
	import { t } from '$lib/i18n';
	import { flushSync, tick } from 'svelte';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';

	/**
	 * What a verse number does when you click it.
	 *
	 * One instance for the whole chapter, opened with the verse in question — a menu per verse would
	 * mean a few hundred popovers and a few hundred forms per page. It replaces the star that used to
	 * sit next to every verse: that was a `<form>` inside inline text, which is block-level content in
	 * a `<p>` and therefore always broke the line.
	 */
	let {
		lists,
		signedIn,
		/** Keys are `${book}:${chapter}:${verse}:${listId}` for every loaded verse in a list. */
		marks,
		/** The reader's own highlight palette, in display order. */
		highlightStyles,
		onInsertVerseInNote
	}: {
		lists: { id: string; title: string }[];
		signedIn: boolean;
		marks: Set<string>;
		highlightStyles: { id: string; color: string; name: string | null }[];
		onInsertVerseInNote?: (quotation: BibleQuotation) => void | Promise<void>;
	} = $props();

	let menu: Menu | undefined = $state();
	let context = $state<VerseContext | null>(null);
	let source = $state('');
	let translation = $state('');
	let copied = $state<'text' | 'link' | null>(null);
	let activeStyleId = $state<string | null>(null);
	let onHighlightChange: ((styleId: string | null) => void) | undefined;
	const collectionGroupId = $props.id();
	let collectionsOpen = $state(false);
	// Start from the server's updated-at order, refreshed by navigation and list creation.
	let recentLists = $derived(lists.slice(0, 10));

	/**
	 * `highlight` is the style currently on this verse, if any (null for none); `onChange` fires
	 * optimistically the moment a swatch is picked, before the form submit resolves — the reader who
	 * owns `streamChapters` (the reader route) is what actually holds the coloured state, this menu
	 * only reports the change up.
	 */
	export function openAt(
		anchor: HTMLElement,
		next: VerseContext,
		highlight: string | null,
		onChange: (styleId: string | null) => void,
		resource: { id: string; name: string }
	): void {
		context = next;
		source =
			page.data.readerResources.find((item: { id: string }) => item.id === resource.id)?.abbrev ??
			'';
		copied = null;
		activeStyleId = highlight;
		onHighlightChange = onChange;
		translation = resource.name;
		collectionsOpen = false;
		// The anchored menu measures its contents and focuses its first item synchronously.
		flushSync();
		menu?.openAt(anchor);
	}

	function insertVerseInNote(): void {
		if (!context || !onInsertVerseInNote) return;
		menu?.close();
		void onInsertVerseInNote({ reference: context.label, translation, text: context.text });
	}

	const linkUrl = $derived(context ? new URL(context.path, page.url.origin).toString() : '');

	async function toggleCollections(): Promise<void> {
		collectionsOpen = !collectionsOpen;
		await tick();
		menu?.reposition();
	}

	async function copy(what: 'text' | 'link', value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			copied = what;
		} catch {
			// A denied clipboard permission is not worth an error message; the menu just stays open.
			return;
		}
		setTimeout(() => menu?.close(), 700);
	}

	/** Optimistic, so the check mark flips at once instead of after a chapter reload. */
	function mark(listId: string, present: boolean): void {
		if (!context) return;
		if (present) marks.add(`${context.reference}:${listId}`);
		else marks.delete(`${context.reference}:${listId}`);
	}

	/** Clicking the active swatch again clears the highlight instead of re-picking the same colour. */
	function pickHighlight(styleId: string): void {
		const next = activeStyleId === styleId ? null : styleId;
		activeStyleId = next;
		onHighlightChange?.(next);
		menu?.close();
	}
</script>

<Menu
	bind:this={menu}
	label={context ? t('verse.menu', { reference: context.label }) : ''}
	minWidth={signedIn ? '20rem' : undefined}
>
	{#if context}
		<p class="menu-label">{context.label}</p>

		{#if signedIn && highlightStyles.length > 0}
			<p class="menu-label">{t('highlights.menuLabel')}</p>
			<div class="swatches" role="group" aria-label={t('highlights.menuLabel')}>
				{#each highlightStyles as style (style.id)}
					{@const active = activeStyleId === style.id}
					<form
						method="POST"
						action={active ? '?/removeHighlight' : '?/setHighlight'}
						role="none"
						use:enhance={() => {
							pickHighlight(style.id);
							return async ({ update }) => update({ reset: false, invalidateAll: false });
						}}
					>
						<input type="hidden" name="reference" value={context.reference} />
						{#if !active}<input type="hidden" name="styleId" value={style.id} />{/if}
						<button
							type="submit"
							role="menuitemcheckbox"
							class="swatch"
							class:active
							style:--swatch-color={style.color}
							title={style.name ?? t('highlights.unnamed')}
							aria-label={style.name ?? t('highlights.unnamed')}
							aria-checked={active}
						></button>
					</form>
				{/each}
			</div>
			<hr />
		{/if}

		<button
			type="button"
			role="menuitem"
			onclick={() =>
				copy(
					'text',
					formatCopiedVerses([{ reference: context!.label, text: context!.text, source }], {
						copyReferencePosition: page.data.copyReferencePosition,
						copyIncludeSource: page.data.copyIncludeSource
					})
				)}
		>
			{copied === 'text' ? t('action.copied') : t('verse.copyText')}
		</button>

		<button type="button" role="menuitem" onclick={() => copy('link', linkUrl)}>
			{copied === 'link' ? t('action.copied') : t('verse.copyLink')}
		</button>
		{#if signedIn && onInsertVerseInNote && context.text.trim()}
			<button type="button" role="menuitem" onclick={insertVerseInNote}>
				<Icon name="quote" class="size-4 shrink-0" />
				<span>{t('documents.reader.insertVerse')}</span>
			</button>
		{/if}

		<hr />

		{#if !signedIn}
			<a role="menuitem" href="/login?redirectTo={encodeURIComponent(page.url.pathname)}">
				{t('verse.signInToSave')}
			</a>
		{:else}
			<button
				type="button"
				role="menuitem"
				aria-expanded={collectionsOpen}
				aria-controls={collectionGroupId}
				onclick={toggleCollections}
			>
				<Icon name="list" class="size-4 shrink-0" />
				<span>{t('lists.title')}</span>
				<Icon
					name={collectionsOpen ? 'chevron-down' : 'chevron-right'}
					class="ml-auto size-4 shrink-0"
				/>
			</button>

			<div
				id={collectionGroupId}
				class="collections"
				role="group"
				aria-label={t('lists.title')}
				hidden={!collectionsOpen}
			>
				{#each recentLists as list (list.id)}
					{@const present = marks.has(`${context.reference}:${list.id}`)}
					<form
						method="POST"
						action={present ? '?/removeFromList' : '?/addToList'}
						role="none"
						use:enhance={() => {
							mark(list.id, !present);
							menu?.close();
							return async ({ result, update }) => {
								// These actions update the collection's timestamp on success without moving
								// the reader. Reflect that order in the next menu opening.
								if (result.type === 'success') {
									recentLists = [list, ...recentLists.filter((item) => item.id !== list.id)];
								}
								await update({ reset: false, invalidateAll: false });
							};
						}}
					>
						<input type="hidden" name="listId" value={list.id} />
						<input type="hidden" name="reference" value={context.reference} />
						<button
							type="submit"
							role="menuitemcheckbox"
							aria-checked={present}
							title={present ? t('lists.removeVerse') : t('lists.addVerse')}
						>
							<span class="truncate">{list.title}</span>
							{#if present}
								<Icon name="check" class="menu-check size-4 shrink-0" />
							{/if}
						</button>
					</form>
				{/each}

				<!-- The first verse a reader wants to keep is the moment they need a list, so the list is
				     created here rather than on the settings page. -->
				<form
					method="POST"
					action="?/addToList"
					role="none"
					use:enhance={() => {
						menu?.close();
						return async ({ update }) => update({ reset: false });
					}}
				>
					<input type="hidden" name="listId" value="" />
					<input type="hidden" name="reference" value={context.reference} />
					<input type="hidden" name="title" value={context.label} />
					<button type="submit" role="menuitem" class="new-list">
						<Icon name="plus" class="size-4 shrink-0" />
						{t('lists.newWithVerse')}
					</button>
				</form>
			</div>
		{/if}
	{/if}
</Menu>

<style>
	.new-list {
		color: var(--color-accent-600);
	}

	:global(.dark) .new-list {
		color: var(--color-accent-400);
	}

	.collections {
		margin-inline-start: 0.65rem;
		padding-inline-start: 0.25rem;
		border-inline-start: 1px solid var(--color-stone-200);
	}

	:global(.dark) .collections {
		border-color: var(--color-stone-700);
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		gap: 0.2rem;
		padding: 0.15rem 0.45rem 0.35rem;
	}

	.swatches .swatch[role] {
		display: grid;
		min-height: 1.8rem;
		place-items: center;
		padding: 0;
	}

	.swatch::before {
		content: '';
		width: min(100%, 1.5rem);
		aspect-ratio: 1;
		border-radius: 50%;
		border: 1px solid rgb(28 25 23 / 0.2);
		background: var(--swatch-color);
	}

	.swatch.active::before {
		box-shadow: inset 0 0 0 2px var(--color-stone-700);
	}
</style>
