<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A popup menu anchored to an element.
	 *
	 * Built on the native `popover` attribute, so the menu is painted in the top layer and cannot be
	 * clipped by an ancestor's overflow — which matters in the reader, where the anchor is a verse
	 * number deep inside a CSS grid. `popover="auto"` also brings outside-click dismissal and Escape
	 * without a keydown listener of our own.
	 *
	 * Open it from the parent through `bind:this`:
	 *
	 *   <Menu bind:this={menu}>…</Menu>
	 *   <button onclick={(event) => menu.openAt(event.currentTarget)}>…</button>
	 */
	let {
		label,
		children
	}: {
		/** Accessible name for the menu itself. */
		label: string;
		children: Snippet;
	} = $props();

	let element: HTMLDivElement | undefined = $state();
	let anchor: HTMLElement | null = null;
	let open = $state(false);
	let restoreFocusOnClose = true;

	export function openAt(target: HTMLElement, { focus = true }: { focus?: boolean } = {}): void {
		if (!element) return;
		const alreadyOpen = element.matches(':popover-open');
		// The anchor is a toggle: clicking the same button a second time closes its menu. Native
		// popovers only provide outside-click dismissal, so this small bit is ours.
		if (alreadyOpen && anchor === target) {
			close();
			return;
		}
		anchor = target;
		restoreFocusOnClose = focus;
		// Placed off-screen first, so measuring it does not make the page jump.
		element.style.left = '-9999px';
		element.style.top = '0px';
		if (!alreadyOpen) element.showPopover();
		place();
		if (focus) items()[0]?.focus();
	}

	export function close(): void {
		element?.hidePopover();
	}

	export function isOpen(): boolean {
		return open;
	}

	/** Keeps the menu next to its anchor, flipping above it when there is no room below. */
	function place(): void {
		if (!element || !anchor) return;

		const gap = 4;
		const margin = 8;
		const target = anchor.getBoundingClientRect();

		// Scrolled past its anchor: clamping would leave the menu pinned to the viewport edge, pointing
		// at nothing.
		if (target.bottom < 0 || target.top > window.innerHeight) {
			close();
			return;
		}

		const menu = element.getBoundingClientRect();

		let left = target.left;
		if (left + menu.width > window.innerWidth - margin) {
			left = window.innerWidth - menu.width - margin;
		}
		left = Math.max(margin, left);

		let top = target.bottom + gap;
		if (top + menu.height > window.innerHeight - margin) {
			const above = target.top - menu.height - gap;
			top = above >= margin ? above : Math.max(margin, window.innerHeight - menu.height - margin);
		}

		element.style.left = `${left}px`;
		element.style.top = `${top}px`;
	}

	function items(): HTMLElement[] {
		return [
			...(element?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])
		].filter((item) => item.offsetParent !== null);
	}

	function onToggle(event: ToggleEvent): void {
		open = event.newState === 'open';
		if (!open) {
			if (restoreFocusOnClose) anchor?.focus();
			anchor = null;
			restoreFocusOnClose = true;
		}
	}

	/** Arrow keys walk the menu; Escape and outside clicks are the popover's own business. */
	function onKeydown(event: KeyboardEvent): void {
		const all = items();
		if (all.length === 0) return;

		const current = all.indexOf(document.activeElement as HTMLElement);
		let next: number | null = null;

		if (event.key === 'ArrowDown') next = (current + 1) % all.length;
		else if (event.key === 'ArrowUp') next = (current - 1 + all.length) % all.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = all.length - 1;

		if (next !== null) {
			event.preventDefault();
			all[next]?.focus();
		}
	}
</script>

<svelte:window onscroll={() => open && place()} onresize={() => open && place()} />

<div
	bind:this={element}
	popover="auto"
	role="menu"
	aria-label={label}
	tabindex="-1"
	class="menu"
	ontoggle={onToggle}
	onkeydown={onKeydown}
>
	{@render children()}
</div>

<style>
	/* The user-agent stylesheet centres a popover with `inset: 0; margin: auto`; both have to go for
	   the left/top set in `place()` to mean anything. */
	.menu {
		position: fixed;
		inset: auto;
		margin: 0;
		z-index: 50;
		min-width: 12rem;
		max-width: min(20rem, calc(100vw - 1rem));
		max-height: calc(100dvh - 1rem);
		overflow-y: auto;
		padding: 0.35rem;
		border: 1px solid var(--color-stone-200);
		border-radius: 0.75rem;
		background: var(--surface-raised);
		box-shadow:
			0 10px 15px -3px rgb(0 0 0 / 0.1),
			0 4px 6px -4px rgb(0 0 0 / 0.1);
		font-family: var(--font-sans);
		font-size: 0.8125rem;
		color: var(--color-stone-800);
	}

	.menu:not(:popover-open) {
		display: none;
	}

	:global(.dark) .menu {
		border-color: var(--color-stone-700);
		background: var(--surface-raised);
		color: var(--color-stone-100);
	}

	/* Items are styled here rather than by every caller, so a menu looks the same wherever it opens.
	   Wrapping <form>s carry role="none" so the menu/menuitem relationship survives them. */
	.menu :global([role='menuitem']),
	.menu :global([role='menuitemradio']) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.48rem 0.6rem;
		border: 0;
		border-radius: 0.5rem;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.menu :global([role='menuitem']:hover),
	.menu :global([role='menuitem']:focus-visible),
	.menu :global([role='menuitemradio']:hover),
	.menu :global([role='menuitemradio']:focus-visible) {
		background: var(--color-stone-100);
	}

	:global(.dark) .menu :global([role='menuitem']:hover),
	:global(.dark) .menu :global([role='menuitem']:focus-visible),
	:global(.dark) .menu :global([role='menuitemradio']:hover),
	:global(.dark) .menu :global([role='menuitemradio']:focus-visible) {
		background: var(--color-stone-800);
	}

	.menu :global(form) {
		margin: 0;
	}

	.menu :global(hr) {
		margin: 0.25rem -0.25rem;
		border: 0;
		border-top: 1px solid var(--color-stone-200);
	}

	:global(.dark) .menu :global(hr) {
		border-color: var(--color-stone-700);
	}

	.menu :global(.menu-label) {
		padding: 0.375rem 0.5rem 0.125rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-stone-500);
	}

	.menu :global(.menu-check) {
		margin-left: auto;
		color: var(--color-accent-500);
	}
</style>
