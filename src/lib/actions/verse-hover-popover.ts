/**
 * Shows a verse's text in a floating tooltip when a `.verse-ref` link is hovered or receives
 * keyboard focus.
 *
 * Bible, lexicon and document prose can be injected via `{@html}` or rendered by ProseMirror, so
 * there is no live Svelte element per reference. This action delegates events from the containing
 * element and reuses one plain DOM popup. Returned Bible text is assigned with `textContent`, never
 * injected as HTML.
 */

import { safeLinkHref } from '../notes/document-markdown.ts';
import { segmentsToText, type VerseSegment } from '../bible/segments.ts';
import { formatPassage, parsePassage, MAX_PASSAGE_VERSE, type Passage } from '../bible/passage.ts';
import {
	formatReference,
	nextChapter,
	parseReference,
	isReferenceInCanon,
	type VerseRef
} from '../bible/reference.ts';

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

export type BibleQuotation = {
	reference: string;
	translation: string;
	text: string;
};

/** Loads an inclusive, potentially cross-chapter passage without ever injecting resource HTML. */
export async function loadBibleQuotation(
	bibleId: string,
	reference: string
): Promise<BibleQuotation> {
	const direct = parseReference(reference);
	const chapter =
		direct && direct.verse === undefined && isReferenceInCanon(direct) ? direct : null;
	const passage =
		parsePassage(reference) ??
		(chapter
			? {
					start: { ...chapter, verse: 1 },
					end: { ...chapter, verse: MAX_PASSAGE_VERSE }
				}
			: null);
	if (!passage) throw new Error('invalid reference');
	const chunks: string[] = [];
	let cursor = { book: passage.start.book, chapter: passage.start.chapter };
	let chapterCount = 0;
	while (chapterCount++ < 50) {
		const rows = await loadChapterVerses(bibleId, cursor.book, cursor.chapter);
		const firstVerse =
			cursor.book === passage.start.book && cursor.chapter === passage.start.chapter
				? passage.start.verse
				: 1;
		const lastVerse =
			cursor.book === passage.end.book && cursor.chapter === passage.end.chapter
				? passage.end.verse
				: Number.MAX_SAFE_INTEGER;
		const text = collectVerseText(rows, firstVerse, lastVerse);
		if (text) chunks.push(text);
		if (cursor.book === passage.end.book && cursor.chapter === passage.end.chapter) break;
		const following = nextChapter(cursor.book, cursor.chapter);
		if (!following) throw new Error('passage unavailable');
		cursor = following;
	}
	if (
		cursor.book !== passage.end.book ||
		cursor.chapter !== passage.end.chapter ||
		chunks.length === 0
	) {
		throw new Error('passage unavailable');
	}
	const labels = await loadResourceLabels().catch(() => [] as ResourceLabel[]);
	return {
		reference: chapter
			? formatReference(chapter, { style: 'full' })
			: (formatPassage(passage, { style: 'full' }) ?? reference),
		translation: labels.find((label) => label.id === bibleId)?.tabTitle ?? '',
		text: chunks.join(' ')
	};
}

export type VerseHoverParams = {
	/** Resource id of the reader's primary translation; previewing does nothing without one. */
	bibleId: string | null;
	/** Stable id when links already carry an `aria-describedby` relation (notably ProseMirror). */
	tooltipId?: string;
	/** Makes the otherwise read-only preview actionable inside a document editor. */
	onInsert?: (quotation: BibleQuotation) => void;
	/** Opens a reference in the current application workspace instead of a separate browser tab. */
	onOpen?: (reference: VerseRef) => Promise<boolean>;
	insertLabel?: string;
	openLabel?: string;
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
	let popupHovered = false;
	let popupFocused = false;
	let onInsert = params.onInsert;
	let onOpen = params.onOpen;
	let openLabel = params.openLabel ?? 'Bibelstelle öffnen';
	let insertLabel = params.insertLabel ?? 'Bibeltext einfügen';
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
			popup.addEventListener('pointerenter', () => {
				popupHovered = true;
				clearTimeout(hideTimer);
			});
			popup.addEventListener('pointerleave', () => {
				popupHovered = false;
				scheduleHide();
			});
			popup.addEventListener('focusin', () => {
				popupFocused = true;
				clearTimeout(hideTimer);
			});
			popup.addEventListener('focusout', () => {
				queueMicrotask(() => {
					popupFocused = Boolean(popup && popup.contains(ownerDocument.activeElement));
					scheduleHide();
				});
			});
			popup.addEventListener('keydown', (event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					const anchor = activeAnchor;
					hide(true);
					anchor?.focus({ preventScroll: true });
				} else if (
					event.key === 'Tab' &&
					event.shiftKey &&
					activeAnchor &&
					event.target === popup?.querySelector('button, a[href]')
				) {
					event.preventDefault();
					activeAnchor.focus({ preventScroll: true });
				}
			});
			ownerDocument.body.appendChild(popup);
		}
		// A Zen editor lives in a modal top layer; its preview must be inside that dialog as well.
		const container = node.closest('dialog') ?? ownerDocument.body;
		if (popup.parentElement !== container) container.append(popup);
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
		describedAnchor.element.removeEventListener('keydown', onKeyDown);
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
		// ProseMirror owns the surrounding contenteditable's keyboard handling. Keep a listener on
		// the generated anchor itself as well as the delegated document listener so Tab can enter the
		// interactive preview before an editor keymap handles it.
		anchor.addEventListener('keydown', onKeyDown);
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
		popupFocused = false;
		removeDescription();
		activeAnchor = null;
		if (resetInteraction) {
			hoveredAnchor = null;
			focusedAnchor = null;
		}
	}

	function scheduleHide(): void {
		clearTimeout(hideTimer);
		if (hoveredAnchor || focusedAnchor || popupHovered || popupFocused) return;
		hideTimer = setTimeout(() => hide(), 50);
	}

	/** Rebuilds the popup's content: the reference plus the translation name, then the verse text. */
	function renderContent(
		box: HTMLDivElement,
		referenceLabel: string,
		translationLabel: string,
		text: string,
		quotation?: BibleQuotation
	): void {
		box.dataset.reference = referenceLabel;
		if (bibleId) box.dataset.bibleId = bibleId;
		else delete box.dataset.bibleId;
		box.replaceChildren();
		const heading = ownerDocument.createElement('div');
		heading.className = 'verse-hover-popup-ref';
		heading.textContent = translationLabel
			? `${referenceLabel} · ${translationLabel}`
			: referenceLabel;
		const body = ownerDocument.createElement('div');
		body.textContent = text;
		box.append(heading, body);
		if (onInsert || onOpen) {
			box.classList.add('interactive');
			box.setAttribute('role', 'dialog');
			box.setAttribute('aria-label', `${referenceLabel}: ${quotation ? insertLabel : openLabel}`);
			if (quotation && onInsert) {
				const button = ownerDocument.createElement('button');
				button.type = 'button';
				button.className = 'verse-hover-popup-insert';
				button.textContent = insertLabel;
				button.addEventListener('pointerdown', (event) => event.preventDefault());
				button.addEventListener('click', () => {
					onInsert?.(quotation);
					hide(true);
				});
				box.append(button);
			}
			const href = safeLinkHref(activeAnchor?.getAttribute('href') ?? '');
			if (href) {
				const open = ownerDocument.createElement('a');
				open.className = 'verse-hover-popup-insert';
				open.textContent = openLabel;
				open.href = href;
				if (onOpen && activeAnchor) {
					const reference: VerseRef = {
						book: Number(activeAnchor.dataset.book),
						chapter: Number(activeAnchor.dataset.chapter),
						...(activeAnchor.dataset.verse ? { verse: Number(activeAnchor.dataset.verse) } : {}),
						...(activeAnchor.dataset.verseEnd
							? { verseEnd: Number(activeAnchor.dataset.verseEnd) }
							: {})
					};
					let opening = false;
					open.addEventListener('click', async (event) => {
						if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
						event.preventDefault();
						if (opening) return;
						opening = true;
						try {
							if (await onOpen?.(reference)) hide(true);
						} catch {
							body.textContent =
								'Die Bibelstelle konnte nicht geöffnet werden. Versuche es erneut.';
						} finally {
							opening = false;
						}
					});
				} else {
					open.target = '_blank';
					open.rel = 'noopener noreferrer';
				}
				box.append(open);
			}
		} else {
			box.classList.remove('interactive');
			box.setAttribute('role', 'tooltip');
			box.removeAttribute('aria-label');
		}
	}

	async function show(target: HTMLElement): Promise<void> {
		if (!bibleId && !onInsert && !onOpen) return;
		const book = Number(target.dataset.book);
		const chapter = Number(target.dataset.chapter);
		const verse = Number(target.dataset.verse);
		const verseEnd = target.dataset.verseEnd ? Number(target.dataset.verseEnd) : undefined;
		// Chapter-only references in editors still need an explicit way to open their destination.
		if (!book || !chapter || (!verse && !onInsert && !onOpen)) return;

		const token = ++requestToken;
		activeAnchor = target;
		const box = ensurePopup();
		addDescription(target);
		if (!verse || !bibleId) {
			renderContent(box, target.dataset.reference ?? target.textContent ?? '', '', '');
			box.style.display = 'block';
			place(target, box);
			return;
		}
		const endBook = Number(target.dataset.endBook || book);
		const endChapter = Number(target.dataset.endChapter || chapter);
		const endVerse = Number(target.dataset.endVerse || verseEnd || verse);
		const passage: Passage = {
			start: { book, chapter, verse },
			end: { book: endBook, chapter: endChapter, verse: endVerse }
		};
		const referenceLabel =
			formatPassage(passage, { style: 'full' }) ??
			formatReference(
				{ book, chapter, verse, ...(verseEnd ? { verseEnd } : {}) },
				{ style: 'full' }
			);
		renderContent(box, referenceLabel, '', '…');
		box.style.display = 'block';
		place(target, box);

		try {
			const quotation = await loadBibleQuotation(
				bibleId,
				target.dataset.reference ?? referenceLabel
			);
			if (token !== requestToken || activeAnchor !== target || !target.isConnected) return;
			renderContent(box, quotation.reference, quotation.translation, quotation.text, quotation);
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

	function onClick(event: MouseEvent): void {
		if (!onInsert) return;
		const target = referenceTarget(event);
		if (!target) return;
		event.preventDefault();
		focusedAnchor = target;
		escapeDismissedReference = null;
		void show(target);
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
			// ProseMirror moves DOM focus from an inline decoration back to its editing host even
			// though the user has not left the reference. Retain the logical reference focus until a
			// real pointer/focus move occurs, so the next Tab can enter the interactive preview.
			if (
				active instanceof Element &&
				node.contains(active) &&
				activeAnchor !== null &&
				referenceIdentity(activeAnchor) === referenceIdentity(target) &&
				popup?.style.display !== 'none'
			) {
				focusedAnchor = target;
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
		const eventTarget = event.target;
		if (
			event.key === 'Tab' &&
			!event.shiftKey &&
			activeAnchor !== null &&
			eventTarget instanceof Node &&
			node.contains(eventTarget) &&
			popup &&
			popup.style.display !== 'none'
		) {
			const insertButton = popup.querySelector<HTMLElement>('button, a[href]');
			if (insertButton) {
				event.preventDefault();
				event.stopPropagation();
				insertButton.focus({ preventScroll: true });
				return;
			}
		}
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
		if (event.target instanceof Node && popup?.contains(event.target)) return;
		escapeDismissedReference = null;
		hide(true);
	}

	node.addEventListener('click', onClick);
	node.addEventListener('pointerover', onOver);
	node.addEventListener('pointerout', onOut);
	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('focusout', onFocusOut);
	// Capture Escape before a contenteditable/ProseMirror keymap can move focus away from the link.
	ownerDocument.addEventListener('keydown', onKeyDown, true);
	ownerDocument.addEventListener('pointerdown', onDocumentPointerDown);

	return {
		update(next: VerseHoverParams): void {
			if (bibleId !== next.bibleId) hide(true);
			bibleId = next.bibleId;
			onInsert = next.onInsert;
			onOpen = next.onOpen;
			insertLabel = next.insertLabel ?? 'Bibeltext einfügen';
			openLabel = next.openLabel ?? 'Bibelstelle öffnen';
		},
		destroy(): void {
			node.removeEventListener('click', onClick);
			node.removeEventListener('pointerover', onOver);
			node.removeEventListener('pointerout', onOut);
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', onFocusOut);
			ownerDocument.removeEventListener('keydown', onKeyDown, true);
			ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown);
			clearTimeout(showTimer);
			clearTimeout(hideTimer);
			removeDescription();
			popup?.remove();
		}
	};
}
