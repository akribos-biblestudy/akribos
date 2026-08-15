import type { TourStep } from './steps';

/**
 * The product tour's run state, shared outside the component tree the same way `reader-location.svelte.ts`
 * shares the visible reference: the menu item that (re)starts the tour lives in `SiteHeader`, while the
 * overlay that renders it is `ProductTour`, mounted next to it — both need one shared, reactive place to
 * agree on what is currently open.
 */
export const tourState: {
	steps: TourStep[];
	index: number;
	open: boolean;
	/** Whether this run started while signed in — decides which completion gets persisted on close. */
	signedIn: boolean;
} = $state({ steps: [], index: 0, open: false, signedIn: false });

/** Starts (or restarts) the tour from its first step. A closed tour with a duplicate call is a no-op. */
export function startTour(steps: TourStep[], signedIn: boolean): void {
	if (steps.length === 0) return;
	tourState.steps = steps;
	tourState.index = 0;
	tourState.signedIn = signedIn;
	tourState.open = true;
}

/**
 * Ends the tour without recording anything as seen — used when the reader route it depends on
 * unmounts from under it (navigating away mid-tour is not the same as actively closing it).
 */
export function abandonTour(): void {
	tourState.open = false;
}
