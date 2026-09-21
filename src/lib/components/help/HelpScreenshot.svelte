<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { HelpScreenshot } from '$lib/help/types';

	let {
		src,
		alt,
		caption,
		width,
		height,
		portrait = false,
		eager = false
	}: HelpScreenshot & { eager?: boolean } = $props();
	let dialog: HTMLDialogElement;
	let trigger: HTMLAnchorElement;
	let originalSize = $state(false);

	function enlarge(event: MouseEvent) {
		if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		if (typeof dialog?.showModal !== 'function') return;
		event.preventDefault();
		originalSize = false;
		dialog.showModal();
	}
</script>

<figure class="help-screenshot" class:portrait style:width={`min(100%, ${width}px)`}>
	<a
		bind:this={trigger}
		class="image-link"
		href={src}
		onclick={enlarge}
		aria-label={`${alt} Screenshot vergrößern`}
	>
		<img {src} {alt} {width} {height} loading={eager ? 'eager' : 'lazy'} decoding="async" />
		<span class="zoom-label"><Icon name="maximize" class="size-4" />Vergrößern</span>
	</a>
	<figcaption>{caption}</figcaption>
</figure>

<dialog
	bind:this={dialog}
	class="screenshot-dialog"
	aria-label="Screenshot vergrößert"
	onclose={() => trigger?.focus({ preventScroll: true })}
>
	<div class="dialog-toolbar">
		<p>{caption}</p>
		<button type="button" onclick={() => dialog.close()} aria-label="Screenshot schließen"
			><Icon name="x" class="size-5" /></button
		>
	</div>
	<button
		type="button"
		class="size-toggle"
		aria-pressed={originalSize}
		onclick={() => (originalSize = !originalSize)}
	>
		<Icon name={originalSize ? 'minimize' : 'maximize'} class="size-4" />
		{originalSize ? 'An Fenster anpassen' : 'In Originalgröße anzeigen'}
	</button>
	<div class="image-scroll" class:original-size={originalSize}>
		<img {src} {alt} {width} {height} loading="lazy" />
	</div>
	<a href={src} target="_blank" rel="noreferrer" class="original-link"
		>Bild in Originalgröße öffnen <Icon name="open-external" class="size-4" /></a
	>
</dialog>

<style>
	.help-screenshot {
		margin: 1.75rem auto 2.25rem;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
		background: var(--surface-raised);
		box-shadow: 0 8px 30px rgb(28 25 23 / 0.05);
	}
	.help-screenshot.portrait {
		max-width: 25rem;
		margin-inline: auto;
	}
	.image-link {
		position: relative;
		display: block;
		color: inherit;
	}
	.image-link img {
		display: block;
		width: 100%;
		height: auto;
	}
	.image-link:focus-visible {
		outline: 3px solid var(--color-accent-500);
		outline-offset: -3px;
	}
	.zoom-label {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
		padding: 0.6rem 0.85rem;
		border-top: 1px solid var(--line);
		background: var(--surface-raised);
		color: var(--color-stone-800);
		font: 600 0.75rem/1.2 var(--font-sans);
	}
	.help-screenshot figcaption {
		padding: 0.85rem 1rem;
		border-top: 1px solid var(--line);
		color: var(--color-stone-600);
		font: 400 0.8125rem/1.6 var(--font-sans);
	}
	.screenshot-dialog {
		width: min(96vw, 110rem);
		max-width: none;
		max-height: 94dvh;
		margin: auto;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
		background: var(--surface-raised);
		color: var(--color-stone-800);
	}
	.screenshot-dialog::backdrop {
		background: rgb(10 15 12 / 0.75);
	}
	.dialog-toolbar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.dialog-toolbar p {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.dialog-toolbar button {
		display: grid;
		place-items: center;
		min-width: 2.75rem;
		min-height: 2.75rem;
		flex-shrink: 0;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		cursor: pointer;
	}
	.image-scroll {
		max-height: 73dvh;
		overflow: auto;
		background: var(--surface);
	}
	.image-scroll img {
		display: block;
		max-width: 100%;
		height: auto;
		margin: auto;
	}
	.image-scroll.original-size img {
		max-width: none;
	}
	.size-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.original-link {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: fit-content;
		padding-block: 0.85rem 0.2rem;
		color: var(--color-accent-700);
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	:global(.dark) .zoom-label,
	:global(.dark) .screenshot-dialog {
		color: var(--color-stone-100);
	}
	:global(.dark) .help-screenshot figcaption {
		color: var(--color-stone-400);
	}
	:global(.dark) .original-link {
		color: var(--color-accent-300);
	}
</style>
