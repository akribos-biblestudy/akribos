/**
 * Shows a verse's text in a floating tooltip when a `.verse-ref` link is hovered or receives
 * keyboard focus.
 *
 * Bible, lexicon and document prose can be injected via `{@html}` or rendered by ProseMirror, so
 * there is no live Svelte element per reference. This action delegates events from the containing
 * element and reuses one plain DOM popup. Returned Bible text is assigned with `textContent`, never
 * injected as HTML.
 */

import { segmentsToText, type VerseSegment } from '../bible/segments.ts';
import { formatReference } from '../bible/reference.ts';

type ChapterVerseRow = { verse: number; verseEnd?: number; segments: VerseSegment[] };

/** One fetch per chapter, shared across every popup on the page for as long as it stays open. */
const chapterCache = new Map<string, Promise<ChapterVerseRow[]>>();

function loadChapterVerses(
	bibleId: string,
	book: number,
	chapter: number
): Promise<ChapterVerseRow[]> {
	const key = `${bibleId}/${book}/${chapter}`;
	const cached = chapterCache.get(key);
	if (cached) return cached;

	const pending = fetch(`/api/v1/bibles/${encodeURIComponent(bibleId)}/${book}/${chapter}`)
		.then((response) => (response.ok ? response.json() : Promise.reject(new Error('not found'))))
		.then((data: { verses: ChapterVerseRow[] }) => data.verses);

	chapterCache.set(key, pending);
	pending.catch(() => chapterCache.delete(key));
	return pending;
}

type ResourceLabel = { id: string; tabTitle: string };

/** Every readable resource's id and abbreviation, fetched once and shared across every popup. */
let resourceLabelsPromise: Promise<ResourceLabel[]> | null = null;

function loadResourceLabels(): Promise<ResourceLabel[]> {
	resourceLabelsPromise ??= fetch('/api/v1/resources')
		.then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
		.then((data: { resources: ResourceLabel[] }) => data.resources)
		.catch((error) => {
			resourceLabelsPromise = null;
			throw error;
		});
	return resourceLabelsPromise;
}

/** Verses overlapping `[verse, verseEnd]`, joined — covers both a plain single verse and a translation
 *  that prints a range (e.g. 16-17) as one row the reader asked for by either endpoint. */
function collectVerseText(rows: ChapterVerseRow[], verse: number, verseEnd?: number): string {
	const to = verseEnd ?? verse;
	return rows
		.filter((row) => row.verse <= to && (row.verseEnd ?? row.verse) >= verse)
		.map((row) => segmentsToText(row.segments))
		.join(' ');
}

export type VerseHoverParams = {
	/** Resource id of the reader's primary translation; previewing does nothing without one. */
	bibleId: string | null;
	/** Stable id when links already carry an `aria-describedby` relation (notably ProseMirror). */
	tooltipId?: string;
};

let popupSequence = 0;

export function verseHoverPopover(node: HTMLElement, params: VerseHoverParams) {
	let bibleId = params.bibleId;
	let popup: HTMLDivElement | undefined;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let requestToken = 0;
	let activeAnchor: HTMLElement | null = null;
	let hoveredAnchor: HTMLElement | null = null;
	let focusedAnchor: HTMLElement | null = null;
	let escapeDismissedReference: string | null = null;
	let describedAnchor: { element: HTMLElement; addedByAction: boolean } | null = null;
	const ownerDocument = node.ownerDocument;
	const ownerWindow = ownerDocument.defaultView ?? window;
	const popupId = params.tooltipId?.trim() || `bible-reference-preview-${++popupSequence}`;

	function ensurePopup(): HTMLDivElement {
		if (!popup) {
			popup = ownerDocument.createElement('div');
			popup.id = popupId;
			popup.className = 'verse-hover-popup';
			popup.setAttribute('role', 'tooltip');
			popup.dataset.testid = 'bible-reference-preview';
			popup.style.display = 'none';
			ownerDocument.body.appendChild(popup);
		}
		return popup;
	}

	function place(anchor: HTMLElement, box: HTMLDivElement): void {
		const anchorRect = anchor.getBoundingClientRect();
		const boxRect = box.getBoundingClientRect();
		const margin = 8;
		const gap = 6;

		let left = anchorRect.left;
		left = Math.max(margin, Math.min(left, ownerWindow.innerWidth - boxRect.width - margin));

		let top = anchorRect.bottom + gap;
		if (top + boxRect.height > ownerWindow.innerHeight - margin) {
			top = Math.max(margin, anchorRect.top - boxRect.height - gap);
		}

		box.style.left = `${left}px`;
		box.style.top = `${top}px`;
	}

	function removeDescription(): void {
		if (!describedAnchor) return;
		if (describedAnchor.addedByAction) {
			const ids = (describedAnchor.element.getAttribute('aria-describedby') ?? '')
				.split(/\s+/u)
				.filter((id) => id && id !== popupId);
			if (ids.length > 0) describedAnchor.element.setAttribute('aria-describedby', ids.join(' '));
			else describedAnchor.element.removeAttribute('aria-describedby');
		}
		describedAnchor = null;
	}

	function addDescription(anchor: HTMLElement): void {
		removeDescription();
		const ids = new Set(
			(anchor.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean)
		);
		if (ids.has(popupId)) {
			describedAnchor = { element: anchor, addedByAction: false };
			return;
		}
		ids.add(popupId);
		anchor.setAttribute('aria-describedby', [...ids].join(' '));
		describedAnchor = { element: anchor, addedByAction: true };
	}

	function hide(resetInteraction = false): void {
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
		requestToken += 1;
		if (popup) popup.style.display = 'none';
		removeDescription();
		activeAnchor = null;
		if (resetInteraction) {
			hoveredAnchor = null;
			focusedAnchor = null;
		}
	}

	function scheduleHide(): void {
		clearTimeout(hideTimer);
		if (hoveredAnchor || focusedAnchor) return;
		hideTimer = setTimeout(() => hide(), 50);
	}

	/** Rebuilds the popup's content: the reference plus the translation name, then the verse text. */
	function renderContent(
		box: HTMLDivElement,
		referenceLabel: string,
		translationLabel: string,
		text: string
	): void {
		box.replaceChildren();
		const heading = ownerDocument.createElement('div');
		heading.className = 'verse-hover-popup-ref';
		heading.textContent = translationLabel
			? `${referenceLabel} · ${translationLabel}`
			: referenceLabel;
		const body = ownerDocument.createElement('div');
		body.textContent = text;
		box.append(heading, body);
	}

	async function show(target: HTMLElement): Promise<void> {
		if (!bibleId) return;
		const book = Number(target.dataset.book);
		const chapter = Number(target.dataset.chapter);
		const verse = Number(target.dataset.verse);
		const verseEnd = target.dataset.verseEnd ? Number(target.dataset.verseEnd) : undefined;
		// Whole-chapter references remain links, but deliberately do not open a chapter-sized tooltip.
		if (!book || !chapter || !verse) return;

		const token = ++requestToken;
		activeAnchor = target;
		const box = ensurePopup();
		addDescription(target);
		const referenceLabel = formatReference(
			{ book, chapter, verse, ...(verseEnd ? { verseEnd } : {}) },
			{ style: 'full' }
		);
		renderContent(box, referenceLabel, '', '…');
		box.style.display = 'block';
		place(target, box);

		try {
			const [rows, labels] = await Promise.all([
				loadChapterVerses(bibleId, book, chapter),
				loadResourceLabels().catch(() => [] as ResourceLabel[])
			]);
			if (token !== requestToken || activeAnchor !== target || !target.isConnected) return;
			const translationLabel = labels.find((label) => label.id === bibleId)?.tabTitle ?? '';
			renderContent(
				box,
				referenceLabel,
				translationLabel,
				collectVerseText(rows, verse, verseEnd) || '…'
			);
			place(target, box);
		} catch {
			if (token === requestToken) hide();
		}
	}

	function referenceTarget(event: Event): HTMLElement | null {
		const source = event.target;
		if (!(source instanceof Element)) return null;
		const target = source.closest<HTMLElement>('.verse-ref');
		return target && node.contains(target) ? target : null;
	}

	function referenceIdentity(target: HTMLElement): string {
		return (
			target.dataset.reference ??
			`${target.dataset.book ?? ''}:${target.dataset.chapter ?? ''}:${target.dataset.verse ?? ''}:${target.dataset.verseEnd ?? ''}`
		);
	}

	function onOver(event: PointerEvent): void {
		if (event.pointerType === 'touch') return;
		const target = referenceTarget(event);
		if (!target) return;
		// Do not let SvelteKit preload the cookie-aware Reader layout merely because a reference is
		// being previewed. Generated document links already carry this attribute; this covers legacy
		// `.verse-ref` markup as well.
		if (target.dataset.sveltekitPreloadData !== 'off') {
			target.dataset.sveltekitPreloadData = 'off';
		}
		if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
		// A genuine new pointer interaction intentionally re-opens a preview that Escape dismissed
		// while its reference retained keyboard focus.
		escapeDismissedReference = null;
		hoveredAnchor = target;
		clearTimeout(hideTimer);
		if (activeAnchor === target && popup?.style.display !== 'none') return;
		clearTimeout(showTimer);
		showTimer = setTimeout(() => void show(target), 150);
	}

	function onOut(event: PointerEvent): void {
		const target = referenceTarget(event);
		if (!target) return;
		if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
		if (hoveredAnchor === target) hoveredAnchor = null;
		if (escapeDismissedReference === referenceIdentity(target)) {
			escapeDismissedReference = null;
		}
		clearTimeout(showTimer);
		scheduleHide();
	}

	function onFocusIn(event: FocusEvent): void {
		const target = referenceTarget(event);
		if (!target) return;
		focusedAnchor = target;
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
		// ProseMirror may replace a decoration anchor without moving logical focus. Escape must keep
		// the tooltip closed through that replacement instead of the delegated focusin reopening it.
		if (escapeDismissedReference === referenceIdentity(target)) return;
		escapeDismissedReference = null;
		void show(target);
	}

	function onFocusOut(event: FocusEvent): void {
		const target = referenceTarget(event);
		if (!target) return;
		queueMicrotask(() => {
			const active = ownerDocument.activeElement;
			const replacement =
				active instanceof Element ? active.closest<HTMLElement>('.verse-ref') : null;
			if (
				replacement &&
				node.contains(replacement) &&
				referenceIdentity(replacement) === referenceIdentity(target)
			) {
				focusedAnchor = replacement;
				return;
			}
			if (focusedAnchor === target) focusedAnchor = null;
			if (escapeDismissedReference === referenceIdentity(target)) {
				escapeDismissedReference = null;
			}
			scheduleHide();
		});
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !popup || popup.style.display === 'none') return;
		event.preventDefault();
		event.stopPropagation();
		const anchor = activeAnchor;
		if (anchor) escapeDismissedReference = referenceIdentity(anchor);
		hide(true);
		if (anchor && ownerDocument.activeElement !== anchor) {
			anchor.focus({ preventScroll: true });
		}
	}

	function onDocumentPointerDown(event: PointerEvent): void {
		if (!activeAnchor) return;
		if (event.target instanceof Node && activeAnchor.contains(event.target)) return;
		escapeDismissedReference = null;
		hide(true);
	}

	node.addEventListener('pointerover', onOver);
	node.addEventListener('pointerout', onOut);
	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('focusout', onFocusOut);
	// Capture Escape before a contenteditable/ProseMirror keymap can move focus away from the link.
	node.addEventListener('keydown', onKeyDown, true);
	ownerDocument.addEventListener('pointerdown', onDocumentPointerDown);

	return {
		update(next: VerseHoverParams): void {
			if (bibleId !== next.bibleId) hide(true);
			bibleId = next.bibleId;
		},
		destroy(): void {
			node.removeEventListener('pointerover', onOver);
			node.removeEventListener('pointerout', onOut);
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', onFocusOut);
			node.removeEventListener('keydown', onKeyDown, true);
			ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown);
			clearTimeout(showTimer);
			clearTimeout(hideTimer);
			removeDescription();
			popup?.remove();
		}
	};
}
