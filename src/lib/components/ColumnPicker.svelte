<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { ReadableResource } from '$lib/server/repositories/resources';

	/**
	 * Column header and translation switcher.
	 *
	 * Picking a translation opens the shared `TranslationDialog` at the reader page level rather than a
	 * menu of its own — the dialog needs to know which column it is editing, which only the page (the
	 * one place that has every column) can supply.
	 *
	 * The close button stays a plain form, so removing a column works without JavaScript and the choice
	 * is stored server-side in a cookie that server rendering can already see. `use:enhance` upgrades it
	 * to a fetch when scripting is available.
	 *
	 * The sticky bar lives on the row wrapper in the reader, not here: a sticky element needs a
	 * containing block taller than itself, and one header cell never is.
	 */
	let {
		index,
		selected,
		canRemove,
		canAdd = false,
		linked,
		onOpenTranslation,
		onOpenAdd,
		onToggleLink
	}: {
		index: number;
		selected: ReadableResource;
		canRemove: boolean;
		/** Shows the "add a column" button; set on the last column only, so the grid keeps its shape. */
		canAdd?: boolean;
		/** Undefined outside the flow layout, where there is no independent per-column scrolling to link. */
		linked?: boolean;
		onOpenTranslation: (index: number) => void;
		onOpenAdd: () => void;
		onToggleLink?: () => void;
	} = $props();
</script>

<div class="column-control flex min-h-10 min-w-0 items-center gap-0.5">
	<span
		class="drag-handle inline-flex cursor-grab touch-none items-center px-1 text-stone-300
		       active:cursor-grabbing dark:text-stone-600"
		title={t('reader.dragColumn')}
		aria-hidden="true"
	>
		<svg viewBox="0 0 12 20" class="h-5 w-3" fill="currentColor">
			<circle cx="3" cy="5" r="1.2" /><circle cx="9" cy="5" r="1.2" />
			<circle cx="3" cy="10" r="1.2" /><circle cx="9" cy="10" r="1.2" />
			<circle cx="3" cy="15" r="1.2" /><circle cx="9" cy="15" r="1.2" />
		</svg>
	</span>

	<button
		id="column-{index}"
		type="button"
		class="group flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-sm
		       font-semibold text-stone-700 transition-colors hover:bg-accent-50/80 hover:text-accent-800
		       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-stone-200
		       dark:hover:bg-accent-900/20 dark:hover:text-accent-200"
		aria-label={t('reader.chooseTranslation')}
		aria-haspopup="dialog"
		onclick={() => onOpenTranslation(index)}
	>
		<span class="truncate">{selected.tabTitle}</span>
		<svg
			viewBox="0 0 20 20"
			class="size-3.5 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			aria-hidden="true"
		>
			<path d="m7.5 5 5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	<div class="ml-auto flex shrink-0 items-center gap-0.5">
		{#if canRemove}
			<form
				method="POST"
				action="?/removeColumn"
				use:enhance
				class="flex items-center self-stretch"
			>
				<input type="hidden" name="index" value={index} />
				<button
					type="submit"
					title={t('reader.removeColumn')}
					aria-label="{t('reader.removeColumn')}: {selected.tabTitle}"
					class="inline-flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700
				       dark:hover:bg-stone-800 dark:hover:text-stone-200"
				>
					<svg viewBox="0 0 20 20" class="size-4" fill="currentColor" aria-hidden="true">
						<path
							d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
						/>
					</svg>
				</button>
			</form>
		{/if}

		{#if linked !== undefined}
			<button
				type="button"
				title={linked ? t('reader.flowSyncDisable') : t('reader.flowSyncEnable')}
				aria-label="{linked
					? t('reader.flowSyncDisable')
					: t('reader.flowSyncEnable')}: {selected.tabTitle}"
				aria-pressed={linked}
				class="relative inline-flex size-7 shrink-0 items-center justify-center rounded hover:bg-stone-100
			       dark:hover:bg-stone-800"
				class:text-accent-600={linked}
				class:dark:text-accent-400={linked}
				class:text-stone-400={!linked}
				onclick={onToggleLink}
			>
				<svg viewBox="0 0 20 20" class="size-4" fill="currentColor" aria-hidden="true">
					<path
						d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3ZM7.768 15.768a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 0 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3Z"
					/>
				</svg>
				{#if !linked}
					<svg viewBox="0 0 20 20" class="absolute size-4.5" aria-hidden="true">
						<line
							x1="4"
							y1="16"
							x2="16"
							y2="4"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
				{/if}
			</button>
		{/if}

		{#if canAdd}
			<button
				type="button"
				title={t('reader.addColumn')}
				aria-label={t('reader.addColumn')}
				class="inline-flex size-7 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-accent-600
			       dark:hover:bg-stone-800 dark:hover:text-accent-400"
				onclick={onOpenAdd}
			>
				<svg viewBox="0 0 20 20" class="size-4" fill="currentColor" aria-hidden="true">
					<path
						d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
					/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	@media (min-width: 640px) and (max-width: 1280px), (update: slow), (monochrome) {
		.column-control {
			min-height: 3rem;
			color: var(--color-stone-800);
		}

		.column-control :global(button) {
			min-width: 2.5rem;
			min-height: 2.5rem;
		}

		.drag-handle {
			color: var(--color-stone-600);
		}
	}
</style>
