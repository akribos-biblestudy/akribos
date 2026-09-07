import type { MessageKey } from '$lib/i18n';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
	id: string;
	/**
	 * CSS selector for the element the tooltip attaches to. `ProductTour` uses the first match that is
	 * actually visible (`offsetParent !== null`); a step whose target cannot be found — a narrow
	 * viewport that hides a control, a chapter without a single Strong's word — is skipped
	 * rather than shown pointing at nothing.
	 */
	selector: string;
	titleKey: MessageKey;
	bodyKey: MessageKey;
	placement: TourPlacement;
};

/**
 * Explained to every reader, signed in or not: each tab's combined location/resource search, word
 * study, work replacement, A–E link sets and opening another tab.
 */
export const GUEST_TOUR_STEPS: TourStep[] = [
	{
		id: 'reader-layout',
		selector: '[data-testid="layout-picker"]',
		titleKey: 'tour.readerLayout.title',
		bodyKey: 'tour.readerLayout.body',
		placement: 'bottom'
	},
	{
		id: 'search-chooser',
		selector: '[data-tour-target="search-chooser"]',
		titleKey: 'tour.searchChooser.title',
		bodyKey: 'tour.searchChooser.body',
		placement: 'bottom'
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
 * Additional steps shown only once signed in: the verse menu (highlight, note,
 * verse lists) and the account entry point.
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

const DOCUMENT_LIBRARY_TOUR_STEPS: TourStep[] = [
	{
		id: 'documents-unified',
		selector: '[data-tour-target="documents-unified-view"]',
		titleKey: 'tour.documentsUnified.title',
		bodyKey: 'tour.documentsUnified.body',
		placement: 'bottom'
	},
	{
		id: 'documents-tags',
		selector: '[data-tour-target="documents-tags"]',
		titleKey: 'tour.documentsTags.title',
		bodyKey: 'tour.documentsTags.body',
		placement: 'right'
	},
	{
		id: 'documents-search',
		selector: '[data-tour-target="documents-search"]',
		titleKey: 'tour.documentsSearch.title',
		bodyKey: 'tour.documentsSearch.body',
		placement: 'bottom'
	}
];

const DOCUMENT_EDITOR_TOUR_STEPS: TourStep[] = [
	{
		id: 'document-editor',
		selector: '[data-testid="document-editor"]',
		titleKey: 'tour.documentEditor.title',
		bodyKey: 'tour.documentEditor.body',
		placement: 'right'
	},
	{
		id: 'document-details',
		selector: '[data-testid="document-details"]',
		titleKey: 'tour.documentDetails.title',
		bodyKey: 'tour.documentDetails.body',
		placement: 'left'
	},
	{
		id: 'document-export',
		selector: '[data-tour-target="document-export"]',
		titleKey: 'tour.documentExport.title',
		bodyKey: 'tour.documentExport.body',
		placement: 'left'
	},
	{
		id: 'publication',
		selector: '[data-testid="publication-controls"]',
		titleKey: 'tour.publication.title',
		bodyKey: 'tour.publication.body',
		placement: 'left'
	},
	{
		id: 'sermon-deliveries',
		selector: '[data-testid="sermon-deliveries"]',
		titleKey: 'tour.sermonDeliveries.title',
		bodyKey: 'tour.sermonDeliveries.body',
		placement: 'left'
	}
];

const IMPORT_TOUR_STEPS: TourStep[] = [
	{
		id: 'import-upload',
		selector: '[data-tour-target="import-upload"]',
		titleKey: 'tour.importUpload.title',
		bodyKey: 'tour.importUpload.body',
		placement: 'bottom'
	},
	{
		id: 'import-preview',
		selector: '[data-testid="import-preview"]',
		titleKey: 'tour.importPreview.title',
		bodyKey: 'tour.importPreview.body',
		placement: 'left'
	}
];

const SERMON_TOUR_STEPS: TourStep[] = [
	{
		id: 'sermon-create',
		selector: '[data-tour-target="sermon-create"]',
		titleKey: 'tour.sermonCreate.title',
		bodyKey: 'tour.sermonCreate.body',
		placement: 'bottom'
	},
	{
		id: 'sermon-board',
		selector: '.sermon-board',
		titleKey: 'tour.sermonBoard.title',
		bodyKey: 'tour.sermonBoard.body',
		placement: 'top'
	}
];

const TEMPLATE_TOUR_STEPS: TourStep[] = [
	{
		id: 'template-create',
		selector: '[data-tour-target="sermon-template-create"]',
		titleKey: 'tour.sermonTemplates.title',
		bodyKey: 'tour.sermonTemplates.body',
		placement: 'bottom'
	},
	{
		id: 'template-list',
		selector: '[data-tour-target="sermon-template-list"]',
		titleKey: 'tour.sermonTemplateList.title',
		bodyKey: 'tour.sermonTemplateList.body',
		placement: 'top'
	}
];

export function tourStepsForRoute(
	pathname: string,
	signedIn: boolean,
	isReader: boolean
): TourStep[] {
	if (isReader) return tourStepsFor(signedIn);
	if (!signedIn) return [];
	if (pathname === '/notes') return DOCUMENT_LIBRARY_TOUR_STEPS;
	if (pathname === '/notes/import') return IMPORT_TOUR_STEPS;
	if (/^\/notes\/[0-9a-f-]+$/iu.test(pathname)) return DOCUMENT_EDITOR_TOUR_STEPS;
	if (pathname === '/sermons') return SERMON_TOUR_STEPS;
	if (pathname === '/sermons/templates') return TEMPLATE_TOUR_STEPS;
	return [];
}
