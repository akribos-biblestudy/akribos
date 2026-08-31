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

	/**
	 * What a selected section covers. `words` is a run inside one translation's own rendering and so
	 * only means something there; `verses` covers whole verses and applies to every translation, the
	 * same distinction the stored highlights make.
	 *
	 * `endVerse` is null while the section stays inside the verse its reference names.
	 */
	export type SelectionTarget =
		| { kind: 'words'; resourceId: string; start: number; end: number; endVerse: number | null }
		| { kind: 'verses'; endVerse: number | null };
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
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
		/** Keys are `${verse}:${listId}` for every verse of this chapter that sits in a list. */
		marks,
		/** The reader's own highlight palette, in display order. */
		highlightStyles
	}: {
		lists: { id: string; title: string }[];
		signedIn: boolean;
		marks: Set<string>;
		highlightStyles: { id: string; color: string; name: string | null }[];
	} = $props();

	let menu: Menu | undefined = $state();
	let context = $state<VerseContext | null>(null);
	let verse = $state(0);
	let copied = $state<'text' | 'link' | null>(null);
	let activeStyleId = $state<string | null>(null);
	let onHighlightChange: ((styleId: string | null) => void) | undefined;
	let commentResource: { id: string; name: string } | null = $state(null);
	let onAddComment: (() => void) | undefined;
	let onStartSection: (() => void) | undefined = $state(undefined);
	/** Set only when the menu was opened for a selection rather than a verse-number click; then it
	 *  shows the palette and copying, but nothing that needs a single verse to point at. */
	let selection = $state<SelectionTarget | null>(null);

	/**
	 * `highlight` is the style currently on this verse, if any (null for none); `onChange` fires
	 * optimistically the moment a swatch is picked, before the form submit resolves — the reader who
	 * owns `streamChapters` (the reader route) is what actually holds the coloured state, this menu
	 * only reports the change up.
	 */
	export function openAt(
		anchor: HTMLElement,
		verseNumber: number,
		next: VerseContext,
		highlight: string | null,
		onChange: (styleId: string | null) => void,
		resource: { id: string; name: string } | null,
		addComment: (() => void) | undefined,
		startSection: (() => void) | undefined,
		focusMenu = true
	): void {
		context = next;
		verse = verseNumber;
		copied = null;
		activeStyleId = highlight;
		onHighlightChange = onChange;
		commentResource = resource;
		onAddComment = addComment;
		onStartSection = startSection;
		selection = null;
		menu?.openAt(anchor, { focus: focusMenu });
	}

	/**
	 * Opens the menu for a selected section. Everything that needs one verse to point at — showing it
	 * alone, adding it to a list, commenting on it — is hidden while `selection` is set; copying and
	 * the palette are what remain, and copying matters more here than it used to, since the reader's
	 * own selection replaced the browser's (see `src/lib/reader/selection.ts`).
	 *
	 * `highlight` is the style already on this exact section, if any; a selection that does not match
	 * a stored one shows no active swatch, since picking a colour then creates a new section rather
	 * than replacing an unrelated one.
	 */
	export function openForSelection(
		anchor: HTMLElement,
		next: VerseContext,
		target: SelectionTarget,
		highlight: string | null,
		onChange: (styleId: string | null) => void,
		focusMenu = false
	): void {
		context = next;
		verse = 0;
		copied = null;
		activeStyleId = highlight;
		onHighlightChange = onChange;
		commentResource = null;
		onAddComment = undefined;
		onStartSection = undefined;
		selection = target;
		// A selection's menu is the one that must never cover what it was opened for, so on a phone or
		// an e-ink reader it opens as a sheet across the bottom instead.
		menu?.openAt(anchor, { focus: focusMenu, allowSheet: true });
	}

	/** Closing from outside, for when the reader dismisses whatever the menu was opened for. */
	export function close(): void {
		menu?.close();
	}

	const linkUrl = $derived(context ? new URL(context.path, page.url.origin).toString() : '');

	const inList = $derived(
		new Set(lists.filter((list) => marks.has(`${verse}:${list.id}`)).map((list) => list.id))
	);

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
		if (present) marks.add(`${verse}:${listId}`);
		else marks.delete(`${verse}:${listId}`);
	}

	/** Clicking the active swatch again clears the highlight instead of re-picking the same colour. */
	function pickHighlight(styleId: string): void {
		const next = activeStyleId === styleId ? null : styleId;
		activeStyleId = next;
		onHighlightChange?.(next);
		menu?.close();
	}
</script>

<Menu bind:this={menu} label={context ? t('verse.menu', { reference: context.label }) : ''}>
	{#if context}
		{#if selection}
			<p class="menu-label">{context.label}</p>

			<button
				type="button"
				role="menuitem"
				onclick={() => copy('text', `${context!.label}\n${context!.text}`)}
			>
				{copied === 'text' ? t('action.copied') : t('highlights.copySelection')}
			</button>
		{:else}
			<p class="menu-label">{context.label}</p>

			<button
				type="button"
				role="menuitem"
				onclick={() => {
					menu?.close();
					void goto(context!.path);
				}}
			>
				{t('verse.showOnly')}
			</button>

			{#if onStartSection}
				<button
					type="button"
					role="menuitem"
					onclick={() => {
						menu?.close();
						onStartSection?.();
					}}
				>
					{t('verse.sectionFromHere')}
				</button>
			{/if}

			<button
				type="button"
				role="menuitem"
				onclick={() => copy('text', `${context!.label}\n${context!.text}`)}
			>
				{copied === 'text' ? t('action.copied') : t('verse.copyText')}
			</button>

			<button type="button" role="menuitem" onclick={() => copy('link', linkUrl)}>
				{copied === 'link' ? t('action.copied') : t('verse.copyLink')}
			</button>
		{/if}

		{#if signedIn && highlightStyles.length > 0}
			{#if !selection}<hr />{/if}
			<p class="menu-label">{t('highlights.menuLabel')}</p>
			<div class="swatches" role="none">
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
						{#if selection}
							{#if selection.kind === 'words'}
								<input type="hidden" name="resourceId" value={selection.resourceId} />
								<input type="hidden" name="startWord" value={selection.start} />
								<input type="hidden" name="endWord" value={selection.end} />
							{/if}
							{#if selection.endVerse !== null}
								<input type="hidden" name="endVerse" value={selection.endVerse} />
							{/if}
						{/if}
						{#if !active}<input type="hidden" name="styleId" value={style.id} />{/if}
						<button
							type="submit"
							class="swatch"
							class:active
							style:background-color={style.color}
							title={style.name ?? t('highlights.unnamed')}
							aria-label={style.name ?? t('highlights.unnamed')}
							aria-pressed={active}
						></button>
					</form>
				{/each}
			</div>
		{/if}

		{#if selection}
			<!-- Nothing else applies to a section: there is no single verse to show, list or comment on. -->
		{:else if signedIn && commentResource}
			<hr />
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					onAddComment?.();
					menu?.close();
				}}
			>
				{t('comments.addForTranslation', { translation: commentResource.name })}
			</button>
		{/if}

		{#if !selection}
			<hr />

			{#if !signedIn}
				<a role="menuitem" href="/login?redirectTo={encodeURIComponent(page.url.pathname)}">
					{t('verse.signInToSave')}
				</a>
			{:else}
				<p class="menu-label">{t('lists.title')}</p>

				{#each lists as list (list.id)}
					{@const present = inList.has(list.id)}
					<form
						method="POST"
						action={present ? '?/removeFromList' : '?/addToList'}
						role="none"
						use:enhance={() => {
							mark(list.id, !present);
							menu?.close();
							// The chapter itself has not changed, so nothing needs re-fetching.
							return async ({ update }) => update({ reset: false, invalidateAll: false });
						}}
					>
						<input type="hidden" name="listId" value={list.id} />
						<input type="hidden" name="reference" value={context.reference} />
						<button
							type="submit"
							role="menuitem"
							title={present ? t('lists.removeVerse') : t('lists.addVerse')}
						>
							<span class="truncate">{list.title}</span>
							{#if present}
								<svg
									viewBox="0 0 20 20"
									class="menu-check size-4 shrink-0"
									fill="currentColor"
									aria-hidden="true"
								>
									<path
										fill-rule="evenodd"
										d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 0 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
									/>
								</svg>
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
						<svg viewBox="0 0 20 20" class="size-4 shrink-0" fill="currentColor" aria-hidden="true">
							<path
								d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
							/>
						</svg>
						{t('lists.newWithVerse')}
					</button>
				</form>
			{/if}
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

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.2rem 0.75rem 0.5rem;
	}

	.swatch {
		box-sizing: border-box;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		border: 1px solid rgb(28 25 23 / 0.15);
		cursor: pointer;
	}

	.swatch.active {
		border: 2px solid var(--color-stone-700);
		box-shadow: 0 0 0 2px var(--color-stone-50);
	}

	/* A finger, and especially a stylus on a slow-refreshing screen, needs a target it can hit first
	   time; there is room for it in the bottom sheet the selection menu opens as. */
	@media (pointer: coarse) {
		.swatches {
			gap: 0.6rem;
		}

		.swatch {
			width: 2.25rem;
			height: 2.25rem;
		}
	}

	:global(.dark) .swatch.active {
		border-color: var(--color-stone-200);
		box-shadow: 0 0 0 2px var(--color-stone-900);
	}
</style>
