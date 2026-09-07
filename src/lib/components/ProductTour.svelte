<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '$lib/i18n';
	import { tourState } from '$lib/tour/tour-state.svelte';
	import type { TourStep } from '$lib/tour/steps';

	/**
	 * A small, self-built step-by-step tour: a dimmed overlay with a cut-out around the current target
	 * (a plain CSS `box-shadow`, the usual trick — no canvas or SVG mask needed) and a tooltip next to
	 * it with "Weiter"/"Zurück"/"Überspringen". No tour library is pulled in for this; the sequence is
	 * short and every target already exists as an ordinary DOM element, so a dependency would buy
	 * little over the couple of hundred lines here.
	 *
	 * Mounted once by `SiteHeader`; route-specific step sets point at the Reader, document workspace,
	 * import preview or sermon tools. `tourState` is the shared, reactive run state; the
	 * "Produkt-Tour" menu item in `SiteHeader` starts it, this component only renders and drives it.
	 */
	let {
		signedIn = false,
		autoStart = []
	}: {
		signedIn?: boolean;
		/** Steps to start automatically once, on mount — empty when this device/account already saw them. */
		autoStart?: TourStep[];
	} = $props();

	let autoStarted = false;
	$effect(() => {
		if (autoStarted || autoStart.length === 0) return;
		autoStarted = true;
		tourState.steps = autoStart;
		tourState.index = 0;
		tourState.signedIn = signedIn;
		tourState.open = true;
	});

	let panel: HTMLDivElement | undefined = $state();
	let visible = $state(false);
	let spotlight = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let tooltipPos = $state<{ top: number; left: number } | null>(null);

	const step = $derived(tourState.open ? (tourState.steps[tourState.index] ?? null) : null);
	const isLast = $derived(tourState.index >= tourState.steps.length - 1);

	function findTarget(candidate: TourStep): HTMLElement | null {
		const element = document.querySelector<HTMLElement>(candidate.selector);
		if (!element || element.offsetParent === null) return null;
		return element;
	}

	/**
	 * Reacts to every change of the run state — the initial auto-start above, the "Produkt-Tour" menu
	 * item calling `startTour()` from `SiteHeader`, and this component's own `next()`/`back()` — so
	 * every caller only has to set `tourState` and this picks it up, rather than each of them also
	 * having to remember to trigger a re-resolve. `resolving` guards against the re-entrancy this causes
	 * on its own: the loop below advances `tourState.index`, which re-runs this very effect while the
	 * first call is still awaiting a `tick()`.
	 */
	let resolving = false;
	$effect(() => {
		void (tourState.open, tourState.index, tourState.steps);
		if (resolving) return;
		void resolveStep();
	});

	/**
	 * Walks forward from the current step until it finds one whose target actually exists and is
	 * visible, skipping the rest silently — a step with nothing to point at would otherwise show an
	 * empty spotlight. Running past the last step ends the tour exactly like pressing "Fertig".
	 */
	async function resolveStep(): Promise<void> {
		if (!tourState.open) {
			visible = false;
			return;
		}

		resolving = true;
		try {
			await walkToVisibleStep();
		} finally {
			resolving = false;
		}
	}

	async function walkToVisibleStep(): Promise<void> {
		while (tourState.index < tourState.steps.length) {
			const current = tourState.steps[tourState.index]!;
			await tick();
			const element = findTarget(current);
			if (element) {
				position(element, current);
				visible = true;
				await tick();
				panel?.focus();
				return;
			}
			tourState.index += 1;
		}

		await complete();
	}

	function position(element: HTMLElement, current: TourStep): void {
		const target = element.getBoundingClientRect();
		spotlight = { top: target.top, left: target.left, width: target.width, height: target.height };

		const margin = 12;
		const gap = 14;
		const panelRect = panel?.getBoundingClientRect();
		const panelWidth = panelRect && panelRect.width > 0 ? panelRect.width : 320;
		const panelHeight = panelRect && panelRect.height > 0 ? panelRect.height : 150;

		let top: number;
		let left: number;

		if (current.placement === 'top') {
			top = target.top - panelHeight - gap;
			left = target.left + target.width / 2 - panelWidth / 2;
		} else if (current.placement === 'left') {
			top = target.top + target.height / 2 - panelHeight / 2;
			left = target.left - panelWidth - gap;
		} else if (current.placement === 'right') {
			top = target.top + target.height / 2 - panelHeight / 2;
			left = target.right + gap;
		} else {
			top = target.bottom + gap;
			left = target.left + target.width / 2 - panelWidth / 2;
		}

		top = Math.min(Math.max(margin, top), window.innerHeight - panelHeight - margin);
		left = Math.min(Math.max(margin, left), window.innerWidth - panelWidth - margin);
		tooltipPos = { top, left };
	}

	function next(): void {
		if (isLast) {
			void complete();
			return;
		}
		tourState.index += 1;
	}

	function back(): void {
		if (tourState.index === 0) return;
		tourState.index -= 1;
	}

	/**
	 * Ends the tour and records it as seen for the current scope: this device's cookie always (so a
	 * later sign-in on the same browser knows the signed-out part is already known), and — while signed
	 * in — the account too, which is what makes the "done" state follow across devices. An actively
	 * closed tour counts exactly the same as a finished one; only the "Produkt-Tour" menu item shows it
	 * again after this.
	 */
	async function complete(): Promise<void> {
		tourState.open = false;
		visible = false;

		try {
			document.cookie = 'tour-guest-done=1; path=/; max-age=31536000; samesite=lax';
		} catch {
			// Private browsing can refuse storage; the tour still ran for this visit.
		}
		try {
			// `keepalive` lets this request finish even if the page unloads right after — closing the
			// tour is very often immediately followed by a navigation (this very function just blurred
			// the search field, or a reader clicks "Fertig" and moves on), and without it the browser can
			// cancel an in-flight request in a plain `fetch`, silently losing the signed-in completion.
			await fetch('/api/tour', { method: 'POST', keepalive: true });
		} catch {
			// Best-effort — worst case the tour offers itself again next time.
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		if (!tourState.open || event.key !== 'Escape') return;
		event.preventDefault();
		void complete();
	}

	/** Keeps the spotlight and tooltip aligned with their target across a resize. */
	function onResize(): void {
		if (!tourState.open || !step) return;
		const element = findTarget(step);
		if (element) position(element, step);
	}
</script>

<svelte:window onkeydown={onKeydown} onresize={onResize} />

{#if tourState.open && visible && spotlight && tooltipPos && step}
	<div
		class="tour-spotlight"
		style:top="{spotlight.top - 4}px"
		style:left="{spotlight.left - 4}px"
		style:width="{spotlight.width + 8}px"
		style:height="{spotlight.height + 8}px"
		aria-hidden="true"
	></div>

	<div
		bind:this={panel}
		class="tour-panel"
		style:top="{tooltipPos.top}px"
		style:left="{tooltipPos.left}px"
		role="dialog"
		aria-modal="false"
		aria-labelledby="tour-panel-title"
		tabindex="-1"
	>
		<p class="tour-step-count">
			{t('tour.progress', { index: tourState.index + 1, total: tourState.steps.length })}
		</p>
		<h2 id="tour-panel-title" class="tour-title">{t(step.titleKey)}</h2>
		<p class="tour-body">{t(step.bodyKey)}</p>
		<div class="tour-actions">
			<button type="button" class="tour-skip" onclick={() => complete()}>{t('tour.skip')}</button>
			<div class="tour-nav">
				{#if tourState.index > 0}
					<button type="button" class="tour-back" onclick={back}>{t('tour.back')}</button>
				{/if}
				<button type="button" class="tour-next" onclick={next}>
					{isLast ? t('tour.finish') : t('tour.next')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.tour-spotlight {
		position: fixed;
		z-index: 70;
		border-radius: 0.65rem;
		box-shadow: 0 0 0 9999px rgb(20 18 16 / 0.55);
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
		pointer-events: none;
		transition:
			top 160ms ease,
			left 160ms ease,
			width 160ms ease,
			height 160ms ease;
	}

	.tour-panel {
		position: fixed;
		z-index: 71;
		width: min(20rem, calc(100vw - 1.5rem));
		border-radius: 0.85rem;
		border: 1px solid var(--color-stone-200);
		background: var(--surface-raised);
		padding: 1rem 1.1rem;
		color: var(--color-stone-800);
		font-family: var(--font-sans);
		box-shadow:
			0 20px 40px -12px rgb(0 0 0 / 0.28),
			0 4px 12px -4px rgb(0 0 0 / 0.16);
	}

	:global(.dark) .tour-panel {
		border-color: var(--color-stone-700);
		color: var(--color-stone-100);
	}

	.tour-step-count {
		margin: 0 0 0.2rem;
		color: var(--color-stone-500);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.tour-title {
		margin: 0 0 0.35rem;
		font-size: 0.95rem;
		font-weight: 700;
	}

	.tour-body {
		margin: 0;
		font-size: 0.83rem;
		line-height: 1.45;
		color: var(--color-stone-600);
	}

	:global(.dark) .tour-body {
		color: var(--color-stone-300);
	}

	.tour-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}

	.tour-nav {
		display: flex;
		gap: 0.4rem;
	}

	.tour-skip {
		border: 0;
		background: none;
		padding: 0.4rem 0.3rem;
		color: var(--color-stone-500);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.tour-skip:hover,
	.tour-skip:focus-visible {
		color: var(--color-stone-800);
		text-decoration: underline;
	}

	:global(.dark) .tour-skip:hover,
	:global(.dark) .tour-skip:focus-visible {
		color: var(--color-stone-100);
	}

	.tour-back,
	.tour-next {
		border: 0;
		border-radius: 0.5rem;
		padding: 0.45rem 0.75rem;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tour-back {
		background: var(--color-stone-100);
		color: var(--color-stone-700);
	}

	:global(.dark) .tour-back {
		background: rgb(255 255 255 / 0.08);
		color: var(--color-stone-200);
	}

	.tour-next {
		background: var(--color-accent-600);
		color: white;
	}

	.tour-next:hover {
		background: var(--color-accent-700);
	}
</style>
