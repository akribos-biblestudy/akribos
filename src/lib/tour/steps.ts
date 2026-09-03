import type { MessageKey } from '$lib/i18n';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
	id: string;
	/**
	 * CSS selector for the element the tooltip attaches to. `ProductTour` uses the first match that is
	 * actually visible (`offsetParent !== null`); a step whose target cannot be found — a narrow
	 * viewport that hides the search helper, a chapter without a single Strong's word — is skipped
	 * rather than shown pointing at nothing.
	 */
	selector: string;
	titleKey: MessageKey;
	bodyKey: MessageKey;
	placement: TourPlacement;
	/**
	 * Focuses the site search field before this step is measured, which is what opens the book/chapter
	 * chooser underneath it (see the `onfocus` handler in `SiteHeader.svelte`). Consecutive steps that
	 * both set this keep the chooser open between them; the next step that omits it blurs the field
	 * again first, so the chooser does not linger over whatever it should show instead.
	 */
	focusSearch?: boolean;
};

/**
 * Explained to every reader, signed in or not: the search field's two-step chooser and its quote/`-`
 * syntax, word study, resource tabs, A–E link sets and opening another tab.
 */
export const GUEST_TOUR_STEPS: TourStep[] = [
	{
		id: 'search-chooser',
		selector: '[data-tour-target="search-chooser"]',
		titleKey: 'tour.searchChooser.title',
		bodyKey: 'tour.searchChooser.body',
		placement: 'bottom',
		focusSearch: true
	},
	{
		id: 'search-syntax',
		selector: '[data-tour-target="search-syntax"]',
		titleKey: 'tour.searchSyntax.title',
		bodyKey: 'tour.searchSyntax.body',
		placement: 'top',
		focusSearch: true
	},
	{
		id: 'word-study',
		selector: '[data-strong]',
		titleKey: 'tour.wordStudy.title',
		bodyKey: 'tour.wordStudy.body',
		placement: 'bottom'
	},
	{
		id: 'resource-picker',
		selector: '[data-tour-target="resource-picker"]',
		titleKey: 'tour.resourcePicker.title',
		bodyKey: 'tour.resourcePicker.body',
		placement: 'bottom'
	},
	{
		id: 'column-link',
		selector: '[data-tour-target="column-link"]',
		titleKey: 'tour.columnLink.title',
		bodyKey: 'tour.columnLink.body',
		placement: 'bottom'
	},
	{
		id: 'column-add',
		selector: '[data-tour-target="column-add"]',
		titleKey: 'tour.columnAdd.title',
		bodyKey: 'tour.columnAdd.body',
		placement: 'left'
	}
];

/**
 * Additional steps shown only once signed in: the verse menu (highlight, comment, verse lists) and
 * where the account's verse lists, comments and appearance settings live.
 */
export const MEMBER_TOUR_STEPS: TourStep[] = [
	{
		id: 'verse-menu',
		selector: '.flow-chapter-number',
		titleKey: 'tour.verseMenu.title',
		bodyKey: 'tour.verseMenu.body',
		placement: 'right'
	},
	{
		id: 'user-menu',
		selector: '[data-tour-target="user-menu"]',
		titleKey: 'tour.userMenu.title',
		bodyKey: 'tour.userMenu.body',
		placement: 'bottom'
	}
];

/** The complete sequence for the current sign-in state — what "Produkt-Tour" restarts from scratch. */
export function tourStepsFor(signedIn: boolean): TourStep[] {
	return signedIn ? [...GUEST_TOUR_STEPS, ...MEMBER_TOUR_STEPS] : GUEST_TOUR_STEPS;
}
