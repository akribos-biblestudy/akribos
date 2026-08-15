<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, beforeNavigate, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatReference, referencePath, type VerseRef } from '$lib/bible/reference';
	import {
		countVerseWords,
		segmentsToText,
		splitVerseLead,
		wordRangeForCharSpan
	} from '$lib/bible/segments';
	import { readerLocation, setJumpToVerse } from '$lib/reader-location.svelte';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { t } from '$lib/i18n';
	import ColumnPicker from '$lib/components/ColumnPicker.svelte';
	import CommentBubble from '$lib/components/CommentBubble.svelte';
	import CommentToggle from '$lib/components/CommentToggle.svelte';
	import StudySidebar from '$lib/components/StudySidebar.svelte';
	import TranslationDialog from '$lib/components/TranslationDialog.svelte';
	import VerseMenu from '$lib/components/VerseMenu.svelte';
	import VerseText from '$lib/components/VerseText.svelte';

	let { data } = $props();

	/**
	 * The verse grid.
	 *
	 * One CSS grid holds every column, with each cell placed explicitly at its verse row. That gives
	 * true alignment across translations, including verses one translation merges and another does
	 * not — the job `jquery.matchHeight` used to do after paint, badly.
	 */
	/**
	 * Which verses of this chapter are in which list, as `${verse}:${listId}`.
	 *
	 * A reactive set the verse menu writes to, so ticking a list flips the mark immediately; it is
	 * derived from page data, so it is rebuilt from the server's answer on every navigation.
	 */
	const marks = $derived(
		new SvelteSet(data.markedVerses.map((mark) => `${mark.verse}:${mark.listId}`))
	);

	/**
	 * Verses that sit in at least one list, which colours their number.
	 *
	 * Read back out of `marks` rather than from page data, so ticking a list in the menu recolours the
	 * number at once — the add does not re-run `load`, since the chapter itself has not changed.
	 */
	const inAnyList = $derived(new Set([...marks].map((key) => Number(key.split(':')[0]))));

	let verseMenu = $state<VerseMenu | undefined>();
	let translationDialog = $state<TranslationDialog | undefined>();

	/** Columns excluded from the flow layout's cross-column scroll sync — empty means everyone follows. */
	const unlinkedColumns = new SvelteSet<number>();

	function toggleLink(index: number) {
		if (unlinkedColumns.has(index)) unlinkedColumns.delete(index);
		else unlinkedColumns.add(index);
	}

	/** The translation the commentary auto-link popover fetches verse text from: whichever Bible
	 *  translation is actually showing in a column right now, so hovering a reference in a commentary
	 *  shows the same text the reader is already reading, not some other fixed pick. */
	const primaryBibleId = $derived(
		data.columns.find((column) => column.resource.kind === 'bible')?.resource.id ?? null
	);

	const unusedResources = $derived(
		data.readerResources.filter(
			(resource) => !data.columns.some((column) => column.resource.id === resource.id)
		)
	);
	const canAddColumn = $derived(
		data.columns.length < data.maxColumns && unusedResources.length > 0
	);
	const visibleColumnCount = $derived(data.columns.length);
	const chosenResourceIds = $derived(data.columns.map((column) => column.resource.id));
	function currentReaderUrl(): string {
		const path = referencePath(readerLocation.reference ?? data.reference);
		return `${path}${window.location.search}${window.location.hash}`;
	}

	function openTranslationDialog(index: number) {
		translationDialog?.openAt({
			action: '?/setColumn',
			readerUrl: currentReaderUrl(),
			index,
			selectedId: data.columns[index]?.resource.id,
			chosen: chosenResourceIds
		});
	}

	function openAddDialog() {
		translationDialog?.openAt({
			action: '?/addColumn',
			readerUrl: currentReaderUrl(),
			chosen: chosenResourceIds
		});
	}

	function commentaryAt(
		referenceResources: typeof data.referenceResources,
		resourceId: string,
		verse: number
	) {
		return referenceResources.commentaries.filter(
			(entry) => entry.resourceId === resourceId && (entry.verseStart ?? 1) === verse
		);
	}

	function crossReferencesAt(
		referenceResources: typeof data.referenceResources,
		resourceId: string,
		verse: number
	) {
		return referenceResources.crossReferences.filter(
			(entry) => entry.resourceId === resourceId && entry.fromVerse === verse
		);
	}

	let draggedColumn = $state<number | null>(null);
	let dropColumn = $state<number | null>(null);
	let reorderForm = $state<HTMLFormElement | undefined>();
	let reorderFromInput = $state<HTMLInputElement | undefined>();
	let reorderToInput = $state<HTMLInputElement | undefined>();

	function startColumnDrag(event: DragEvent, index: number) {
		draggedColumn = index;
		event.dataTransfer?.setData('text/plain', String(index));
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function dropOnColumn(event: DragEvent, index: number) {
		event.preventDefault();
		const from = draggedColumn ?? Number(event.dataTransfer?.getData('text/plain'));
		draggedColumn = null;
		dropColumn = null;
		if (
			!Number.isInteger(from) ||
			from === index ||
			!reorderForm ||
			!reorderFromInput ||
			!reorderToInput
		)
			return;
		reorderFromInput.value = String(from);
		reorderToInput.value = String(index);
		reorderForm.requestSubmit();
	}

	/**
	 * Drag-resizable column widths, as fractions of the row that sum to 1.
	 *
	 * `null` means "not customized yet" — the grid then falls back to an even split via the
	 * `--column-track` CSS variable's own fallback, rather than this rendering an explicit (if
	 * numerically equivalent) track of its own for no reason.
	 */
	let columnWidths = $state<number[] | null>(data.columnWidths);
	/** Detects a reorder, add, remove or swap — not a mere navigation, which leaves the id list (and
	 *  therefore this key) unchanged — so a resize commit's own round trip does not clobber the widths
	 *  the reader just set. Kept separate from `streamColumnsKey` above: that one resets the *chapter*
	 *  stream, this one only cares whether the *columns* changed. */
	let columnWidthsKey = data.columns.map((column) => column.resource.id).join(',');
	const MIN_COLUMN_FRACTION = 0.12;
	/** The address/sync anchor sits at the inner edge of the top fade, not beneath its veil. */
	const FLOW_EDGE_FADE_PX = 24;

	$effect(() => {
		const key = data.columns.map((column) => column.resource.id).join(',');
		if (key !== columnWidthsKey) {
			columnWidthsKey = key;
			// The server already recomputed this in the new order (a reorder) or decided the old
			// widths no longer apply (an add/remove/swap, where it comes back `null`) — either way,
			// adopting its answer is correct, not just a reset.
			columnWidths = data.columnWidths;
		}
	});

	function equalColumnWidths(): number[] {
		return data.columns.map(() => 1 / data.columns.length);
	}

	/** The row's grid track, or `undefined` while `columnWidths` is `null` so the CSS fallback (an
	 *  even `repeat()` split) applies untouched. `minmax(0, …)` matches the original bare `1fr` tracks
	 *  so a narrow custom width can still shrink below its content's own minimum, exactly like before. */
	const columnTrack = $derived(
		columnWidths ? columnWidths.map((width) => `minmax(0, ${width}fr)`).join(' ') : undefined
	);
	/** The desktop header bar sets `grid-template-columns` inline rather than through a class, so it
	 *  cannot lean on the CSS variable's own fallback and needs the equivalent literal spelled out. */
	const headerGridTemplate = $derived(
		columnTrack ?? `repeat(${visibleColumnCount}, minmax(0, 1fr))`
	);

	/** Position of each boundary between two real columns. A pure percentage only centers the middle
	 *  splitter: CSS Grid removes every gap before distributing the fractional tracks, so the outer
	 *  splitters also need a small gap-dependent offset. */
	const columnBoundaries = $derived.by(() => {
		const fractions = columnWidths ?? equalColumnWidths();
		const totalUnits = 1;
		const gapCount = visibleColumnCount - 1;
		const boundaries: { percent: number; offsetRem: number }[] = [];
		let cumulative = 0;
		for (let index = 0; index < fractions.length - 1; index += 1) {
			cumulative += fractions[index] ?? 0;
			const fraction = cumulative / totalUnits;
			boundaries.push({
				percent: fraction * 100,
				// Both the header and reader use Tailwind's `gap-3`, i.e. 0.75rem. This moves the
				// handle from the fractional track edge to the exact centre of its adjacent gap.
				offsetRem: 0.75 * (index + 0.5 - gapCount * fraction)
			});
		}
		return boundaries;
	});

	let columnHeaderBar = $state<HTMLElement>();
	let flowReader = $state<HTMLElement>();
	let isResizingColumns = false;
	let resizeBoundaryIndex: number | null = null;
	let resizeStartX = 0;
	let resizeStartWidths: number[] = [];
	let resizeBarWidth = 0;
	let widthsForm = $state<HTMLFormElement | undefined>();
	let widthsInput = $state<HTMLInputElement | undefined>();

	function clampBoundary(widths: number[], boundaryIndex: number, nextLeft: number): number[] {
		const next = [...widths];
		const left = next[boundaryIndex] ?? 0;
		const right = next[boundaryIndex + 1] ?? 0;
		const pairTotal = left + right;
		const clampedLeft = Math.max(
			MIN_COLUMN_FRACTION,
			Math.min(pairTotal - MIN_COLUMN_FRACTION, nextLeft)
		);
		next[boundaryIndex] = clampedLeft;
		next[boundaryIndex + 1] = pairTotal - clampedLeft;
		return next;
	}

	function startColumnResize(event: PointerEvent, boundaryIndex: number) {
		if (!flowReader) return;
		isResizingColumns = true;
		resizeBoundaryIndex = boundaryIndex;
		resizeStartX = event.clientX;
		resizeStartWidths = columnWidths ?? equalColumnWidths();
		const style = getComputedStyle(flowReader);
		resizeBarWidth =
			flowReader.getBoundingClientRect().width -
			parseFloat(style.columnGap) * (visibleColumnCount - 1);
	}

	/** Bound to `<svelte:window>`, not the handle itself: a pointer that leaves the handle mid-drag
	 *  (fast movement, or the handle itself moving out from under the pointer) must keep resizing. */
	function onColumnResizeMove(event: PointerEvent) {
		if (!isResizingColumns || resizeBoundaryIndex === null || resizeBarWidth <= 0) return;
		const deltaFraction = (event.clientX - resizeStartX) / resizeBarWidth;
		columnWidths = clampBoundary(
			resizeStartWidths,
			resizeBoundaryIndex,
			(resizeStartWidths[resizeBoundaryIndex] ?? 0) + deltaFraction
		);
	}

	function onColumnResizeEnd() {
		if (!isResizingColumns) return;
		isResizingColumns = false;
		resizeBoundaryIndex = null;
		commitColumnWidths();
	}

	/** Keyboard equivalent of a pointer drag: `ArrowLeft`/`ArrowRight` nudge one boundary a couple of
	 *  percentage points and commit immediately, since there is no separate "release" event. */
	function onResizeHandleKeydown(event: KeyboardEvent, boundaryIndex: number) {
		const step = 0.02;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			columnWidths = clampBoundary(
				columnWidths ?? equalColumnWidths(),
				boundaryIndex,
				(columnWidths ?? equalColumnWidths())[boundaryIndex]! - step
			);
			commitColumnWidths();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			columnWidths = clampBoundary(
				columnWidths ?? equalColumnWidths(),
				boundaryIndex,
				(columnWidths ?? equalColumnWidths())[boundaryIndex]! + step
			);
			commitColumnWidths();
		}
	}

	function commitColumnWidths() {
		if (!columnWidths || !widthsForm || !widthsInput) return;
		widthsInput.value = columnWidths.join(',');
		widthsForm.requestSubmit();
	}

	/** Opens the whole-verse menu (verse-number click, or a selection covering the entire verse). */
	function openVerseMenuForWholeVerse(
		anchor: HTMLElement,
		book: number,
		chapter: number,
		verse: number,
		verseEnd: number | null,
		segments: Parameters<typeof segmentsToText>[0],
		resource: { id: string; name: string }
	) {
		const reference = {
			book,
			chapter,
			verse,
			...(verseEnd && verseEnd > verse ? { verseEnd } : {})
		};

		verseMenu?.openAt(
			anchor,
			verse,
			{
				reference: formatReference(reference),
				label: formatReference(reference, { style: 'full' }),
				path: referencePath(reference),
				text: segmentsToText(segments)
			},
			highlightByKey.get(`${book}:${chapter}:${verse}`)?.styleId ?? null,
			(styleId) => updateStreamHighlight(book, chapter, verse, styleId),
			resource,
			() => openVerseComment(book, chapter, verse, resource.id)
		);
	}

	/**
	 * Opens the verse menu, unless the reader meant to use the link.
	 *
	 * The verse number stays an `<a>` so it keeps working without scripting and still offers
	 * "open in new tab" and "copy link address"; only a plain left click is taken over.
	 */
	function onVerseNumberClick(
		event: MouseEvent & { currentTarget: HTMLAnchorElement },
		book: number,
		chapter: number,
		verse: number,
		verseEnd: number | null,
		segments: Parameters<typeof segmentsToText>[0],
		resource: { id: string; name: string }
	) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}

		event.preventDefault();
		openVerseMenuForWholeVerse(
			event.currentTarget,
			book,
			chapter,
			verse,
			verseEnd,
			segments,
			resource
		);
	}

	/** A throwaway, invisible element positioned over the current text selection, so `VerseMenu` (which
	 *  anchors to a real element) can open next to a selection instead of a clicked verse number. */
	let selectionAnchorEl: HTMLElement | null = null;

	function anchorSelectionRect(rect: DOMRect): HTMLElement {
		selectionAnchorEl?.remove();
		const el = document.createElement('span');
		el.style.position = 'fixed';
		el.style.left = `${rect.left}px`;
		el.style.top = `${rect.top}px`;
		el.style.width = `${Math.max(rect.width, 1)}px`;
		el.style.height = `${Math.max(rect.height, 1)}px`;
		el.style.pointerEvents = 'none';
		el.tabIndex = -1;
		el.setAttribute('aria-hidden', 'true');
		document.body.appendChild(el);
		selectionAnchorEl = el;
		return el;
	}

	/**
	 * Turns a mouse or touch text selection inside one translation's verse text into a highlight menu.
	 *
	 * A selection covering the whole verse behaves exactly like clicking the verse number (applies to
	 * every translation); anything narrower opens the selection-only menu, scoped to that one
	 * translation's word range. Selections that are collapsed, land outside a verse, span more than one
	 * verse, or cannot be matched back onto the verse's own text (e.g. they touch only whitespace) are
	 * silently ignored — a reader can still use the verse-number menu for anything this misses.
	 */
	function onVerseTextSelection() {
		if (!data.user) return;
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

		const rawSelectedText = selection.toString();
		const selectedText = rawSelectedText.replace(/\s+/g, ' ').trim();
		if (!selectedText) return;

		const range = selection.getRangeAt(0);
		const container = range.commonAncestorContainer;
		const element = container instanceof Element ? container : container.parentElement;
		const verseEl = element?.closest<HTMLElement>('.flow-verse[data-verse-key]');
		const columnEl = element?.closest<HTMLElement>('.flow-column[data-resource-id]');
		if (!verseEl || !columnEl) return;

		const [rawBook, rawChapter, rawVerse] = (verseEl.dataset.verseKey ?? '').split(':');
		const book = Number(rawBook);
		const chapter = Number(rawChapter);
		const verse = Number(rawVerse);
		const resourceId = columnEl.dataset.resourceId ?? '';
		if (![book, chapter, verse].every(Number.isInteger) || !resourceId) return;

		const stream = streamChapters.find(
			(candidate) => candidate.reference.book === book && candidate.reference.chapter === chapter
		);
		const column = data.columns.find((candidate) => candidate.resource.id === resourceId);
		const row = stream?.chapter.rows.find((candidate) => candidate.verse === verse);
		const cell =
			column?.bibleCellIndex != null ? (row?.cells[column.bibleCellIndex] ?? null) : null;
		if (!stream || !column || !cell) return;

		const flattened = segmentsToText(cell.segments);
		const charStart = flattened.indexOf(selectedText);
		if (charStart < 0) return;
		const wordRange = wordRangeForCharSpan(flattened, charStart, charStart + selectedText.length);
		if (!wordRange) return;

		const rect = range.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) return;
		const anchor = anchorSelectionRect(rect);
		selection.removeAllRanges();

		const resource = { id: column.resource.id, name: column.resource.tabTitle };
		const wordCount = countVerseWords(cell.segments);
		if (wordRange.start === 0 && wordRange.end === wordCount - 1) {
			openVerseMenuForWholeVerse(
				anchor,
				book,
				chapter,
				verse,
				cell.verseEnd,
				cell.segments,
				resource
			);
			return;
		}

		const reference = {
			book,
			chapter,
			verse,
			...(cell.verseEnd && cell.verseEnd > verse ? { verseEnd: cell.verseEnd } : {})
		};
		const activeStyleId =
			partialHighlightsByKey
				.get(`${book}:${chapter}:${verse}:${resourceId}`)
				?.find((entry) => entry.start === wordRange.start && entry.end === wordRange.end)
				?.styleId ?? null;

		verseMenu?.openForSelection(
			anchor,
			{
				reference: formatReference(reference),
				label: formatReference(reference, { style: 'full' }),
				path: referencePath(reference),
				text: rawSelectedText
			},
			{ resourceId, start: wordRange.start, end: wordRange.end },
			activeStyleId,
			(styleId) =>
				updatePartialHighlight(
					book,
					chapter,
					verse,
					resourceId,
					wordRange.start,
					wordRange.end,
					styleId
				)
		);
	}

	$effect(() => {
		document.addEventListener('mouseup', onVerseTextSelection);
		document.addEventListener('touchend', onVerseTextSelection);
		return () => {
			document.removeEventListener('mouseup', onVerseTextSelection);
			document.removeEventListener('touchend', onVerseTextSelection);
		};
	});

	onDestroy(() => selectionAnchorEl?.remove());

	/** Which column a reader is looking at on a phone, where only one fits. */
	let mobileColumn = $state(0);

	/**
	 * Whether the phone-width layout (one column visible, switched by tabs) is actually in effect —
	 * not merely "the reader happens to be on a phone", since a desktop window can be narrowed too.
	 *
	 * `mobileColumn` only means something once this is true: on desktop every column is visible at
	 * once, so gating `role="tabpanel"`/`aria-hidden` purely on `columnIndex !== mobileColumn` would
	 * incorrectly hide every non-selected column from assistive tech there too, even though a sighted
	 * desktop reader sees them all just fine.
	 */
	let isMobileViewport = $state(false);

	$effect(() => {
		const query = window.matchMedia('(max-width: 639px)');
		isMobileViewport = query.matches;
		const onChange = (event: MediaQueryListEvent) => {
			isMobileViewport = event.matches;
		};
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	});

	let mobileTablist = $state<HTMLElement | undefined>();

	/**
	 * Roving focus for the mobile column tabs, matching `Menu.svelte`'s own arrow-key handling.
	 * "Automatic activation": moving focus also switches `mobileColumn`, the same as a click — there
	 * is no separate "activate" step, matching the existing click-to-switch behaviour exactly.
	 */
	function onMobileTabKeydown(event: KeyboardEvent) {
		if (!mobileTablist) return;
		const tabs = [...mobileTablist.querySelectorAll<HTMLElement>('[role="tab"]')];
		if (tabs.length === 0) return;

		const current = tabs.indexOf(document.activeElement as HTMLElement);
		let next: number | null = null;

		if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
		else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = tabs.length - 1;

		if (next === null) return;
		event.preventDefault();
		const target = tabs[next];
		target?.focus();
		const index = Number(target?.id.replace('mobile-tab-', ''));
		if (Number.isFinite(index)) mobileColumn = index;
	}

	/** Strong's number shown in the study sidebar, kept in the URL hash so it can be shared. */
	let activeStrong = $state<{ strong: string; word: string; reference: string } | null>(null);

	/**
	 * Strong's number currently under the mouse, highlighted the same way as `activeStrong` but
	 * without opening the sidebar or touching the URL/history. Cleared again on pointer leave; see
	 * `VerseText.svelte` for why this uses pointer events rather than `mouseenter`/`mouseleave`.
	 */
	let hoverStrong = $state<string | null>(null);

	/**
	 * Restores the sidebar from the browser's real URL after a navigation.
	 *
	 * The reader also changes its address with shallow `replaceState` calls. Those deliberately do not
	 * make `page.url` reactive, so a later history traversal must read `window.location` rather than a
	 * potentially stale route URL.
	 */
	function restoreStrongFromHash(hashValue: string) {
		const hash = hashValue.replace(/^#/, '');
		if (!hash) {
			activeStrong = null;
			return;
		}
		const [strong, word, verseValue] = hash.split('/');
		if (strong) {
			const verse = Number.parseInt(verseValue ?? '', 10);
			activeStrong = {
				strong: decodeURIComponent(strong),
				word: decodeURIComponent(word ?? ''),
				reference: formatReference({
					book: data.reference.book,
					chapter: data.reference.chapter,
					...(Number.isSafeInteger(verse) && verse > 0
						? { verse }
						: data.reference.verse !== undefined
							? { verse: data.reference.verse }
							: {})
				})
			};
		}
	}

	afterNavigate(() => restoreStrongFromHash(window.location.hash));

	function openStrong(
		strong: string,
		word: string,
		verse: number,
		book = data.reference.book,
		chapter = data.reference.chapter
	) {
		activeStrong = {
			strong,
			word,
			reference: formatReference({
				book,
				chapter,
				verse
			})
		};
		const url = `${window.location.pathname}${window.location.search}#${encodeURIComponent(strong)}/${encodeURIComponent(word)}/${verse}`;
		pushState(url, { ...page.state, studySidebar: true });
	}

	function closeStrong() {
		activeStrong = null;
		pushState(`${window.location.pathname}${window.location.search}`, {
			...page.state,
			studySidebar: false
		});
	}

	const previousPath = $derived(
		data.navigation.previous ? referencePath(data.navigation.previous) : null
	);
	const nextPath = $derived(data.navigation.next ? referencePath(data.navigation.next) : null);

	type StreamChapter = {
		reference: { book: number; chapter: number };
		fullTitle: string;
		shortBookName: string;
		chapter: typeof data.chapter;
		verseComments: typeof data.verseComments;
		referenceResources: typeof data.referenceResources;
		highlights: typeof data.highlights;
		navigation: {
			previous: { book: number; chapter: number } | null;
			next: { book: number; chapter: number } | null;
		};
	};

	function initialStreamChapter(): StreamChapter {
		return {
			reference: { book: data.reference.book, chapter: data.reference.chapter },
			fullTitle: data.fullTitle,
			shortBookName: data.shortBookName,
			chapter: data.chapter,
			verseComments: data.verseComments,
			referenceResources: data.referenceResources,
			highlights: data.highlights,
			navigation: data.navigation
		};
	}

	let streamChapters = $state<StreamChapter[]>([initialStreamChapter()]);
	/** Empty editors opened through the verse menu but not saved yet. */
	const draftCommentKeys = new SvelteSet<string>();
	/** Existing comments explicitly expanded through the icon at the end of their verse. */
	const expandedCommentKeys = new SvelteSet<string>();

	function verseCommentKey(book: number, chapter: number, verse: number, resourceId: string) {
		return `${book}:${chapter}:${verse}:${resourceId}`;
	}

	function openVerseComment(book: number, chapter: number, verse: number, resourceId: string) {
		const key = verseCommentKey(book, chapter, verse, resourceId);
		expandedCommentKeys.add(key);
		draftCommentKeys.add(key);
	}

	function toggleVerseComment(key: string) {
		if (expandedCommentKeys.has(key)) {
			expandedCommentKeys.delete(key);
			draftCommentKeys.delete(key);
		} else {
			expandedCommentKeys.add(key);
		}
	}

	function verseCommentAt(stream: StreamChapter, resourceId: string, verse: number) {
		return stream.verseComments.find(
			(comment) => comment.resourceId === resourceId && comment.verse === verse
		);
	}

	function updateVerseComment(
		stream: StreamChapter,
		resourceId: string,
		verse: number,
		html: string
	) {
		const current = verseCommentAt(stream, resourceId, verse);
		if (html) {
			if (current) current.html = html;
			else stream.verseComments.push({ resourceId, verse, html });
		} else if (current) {
			stream.verseComments.splice(stream.verseComments.indexOf(current), 1);
		}
		expandedCommentKeys.add(
			verseCommentKey(stream.reference.book, stream.reference.chapter, verse, resourceId)
		);
		draftCommentKeys.delete(
			verseCommentKey(stream.reference.book, stream.reference.chapter, verse, resourceId)
		);
	}

	/** Every whole-verse highlight across every loaded chapter, keyed like `data-verse-key`. Partial,
	 *  translation-specific highlights are looked up separately through `partialHighlightsByKey`. */
	const highlightByKey = $derived(
		new Map(
			streamChapters.flatMap((stream) =>
				stream.highlights
					.filter((highlight) => highlight.resourceId === null)
					.map(
						(highlight) =>
							[
								`${stream.reference.book}:${stream.reference.chapter}:${highlight.verse}`,
								highlight
							] as const
					)
			)
		)
	);

	/** Translation-specific highlighted word ranges, keyed like `data-verse-key` plus the resource id,
	 *  each verse+resource possibly carrying several distinct coloured sections. */
	const partialHighlightsByKey = $derived.by(() => {
		const grouped: Record<
			string,
			{ start: number; end: number; color: string; styleId: string }[]
		> = {};
		for (const stream of streamChapters) {
			for (const highlight of stream.highlights) {
				if (highlight.resourceId === null) continue;
				const key = `${stream.reference.book}:${stream.reference.chapter}:${highlight.verse}:${highlight.resourceId}`;
				(grouped[key] ??= []).push({
					start: highlight.startWord!,
					end: highlight.endWord!,
					color: highlight.color,
					styleId: highlight.styleId
				});
			}
		}
		return new Map(Object.entries(grouped));
	});

	/** Applies a verse-menu highlight pick to whichever loaded chapter the verse belongs to, so the
	 *  colour appears at once instead of after a reload. */
	function updateStreamHighlight(
		book: number,
		chapter: number,
		verse: number,
		styleId: string | null
	): void {
		const stream = streamChapters.find(
			(candidate) => candidate.reference.book === book && candidate.reference.chapter === chapter
		);
		if (!stream) return;

		stream.highlights = stream.highlights.filter(
			(highlight) => !(highlight.verse === verse && highlight.resourceId === null)
		);
		const style = styleId
			? data.highlightStyles.find((candidate) => candidate.id === styleId)
			: undefined;
		if (style)
			stream.highlights.push({
				verse,
				styleId: style.id,
				color: style.color,
				name: style.name,
				resourceId: null,
				startWord: null,
				endWord: null
			});
	}

	/** Same idea as `updateStreamHighlight`, but for one translation-specific word range, which does
	 *  not replace any other section of the same verse — only the exact same range. */
	function updatePartialHighlight(
		book: number,
		chapter: number,
		verse: number,
		resourceId: string,
		start: number,
		end: number,
		styleId: string | null
	): void {
		const stream = streamChapters.find(
			(candidate) => candidate.reference.book === book && candidate.reference.chapter === chapter
		);
		if (!stream) return;

		stream.highlights = stream.highlights.filter(
			(highlight) =>
				!(
					highlight.verse === verse &&
					highlight.resourceId === resourceId &&
					highlight.startWord === start &&
					highlight.endWord === end
				)
		);
		const style = styleId
			? data.highlightStyles.find((candidate) => candidate.id === styleId)
			: undefined;
		if (style)
			stream.highlights.push({
				verse,
				styleId: style.id,
				color: style.color,
				name: style.name,
				resourceId,
				startWord: start,
				endWord: end
			});
	}
	let flowColumns = $state<HTMLElement[]>([]);
	let loadingPrevious = $state(false);
	let loadingNext = $state(false);
	let activeFlowSource = 0;
	let visibleChapterKey = $state('');
	let streamSignature = '';
	let streamColumnsKey = data.columns.map((column) => column.resource.id).join(',');
	let jumpedSignature = '';
	/** Invalidates chapter requests that were started for an earlier reader navigation. */
	let streamGeneration = 0;
	/**
	 * Columns whose next scroll events were caused by our own alignment/prepend compensation.
	 *
	 * This must be tracked per column. With one global flag, a wheel event in the column the reader is
	 * actually touching cleared the protection for every other column too. A slightly later scroll
	 * event from an automatically moved, differently laid-out translation could then become the source
	 * and pull the touched column many verses forward.
	 */
	const suppressedFlowColumns = new SvelteSet<number>();
	let suppressFlowTimers: (ReturnType<typeof setTimeout> | undefined)[] = [];
	let flowSyncTimer: ReturnType<typeof setTimeout> | undefined;
	let flowHasContentAbove = $state<boolean[]>([]);
	let flowHasContentBelow = $state<boolean[]>([]);
	const WHEEL_SCROLL_FACTOR = 0.55;
	/**
	 * The element each flow column was last aligned to, indexed by column. A ranged block (a comment
	 * spanning several verses, or a merged Bible cell) should hold still while the reader is anywhere
	 * inside its range — only actually re-aligning a column when its covering block *changes* achieves
	 * that: scrolling within the same range keeps finding the same element here and is a no-op, and only
	 * crossing into the next range's block triggers the single jump that brings it to the anchor line.
	 */
	let lastAlignedElement: (Element | null)[] = [];
	const visibleStreamChapter = $derived(
		streamChapters.find(
			(stream) => `${stream.reference.book}:${stream.reference.chapter}` === visibleChapterKey
		) ?? streamChapters[0]
	);

	$effect(() => {
		const columnsKey = data.columns.map((column) => column.resource.id).join(',');
		const signature = `${data.reference.book}:${data.reference.chapter}:${columnsKey}`;
		if (signature !== streamSignature) {
			streamGeneration += 1;
			loadingPrevious = false;
			loadingNext = false;
			cancelScheduledReaderWork();
			const columnsChanged = columnsKey !== streamColumnsKey;
			streamSignature = signature;
			streamColumnsKey = columnsKey;
			streamChapters = [initialStreamChapter()];
			if (columnsChanged) {
				// A column that merely swaps translation keeps its position but changes its
				// `column.resource.id` key, so the keyed `#each` below tears down and remounts only *that*
				// column — every other column's element is reused as-is and never re-runs `bind:this`. If
				// `flowColumns` were simply reset to `[]` here, those untouched columns would stay
				// permanently missing from it (that used to be the bug: cross-column scroll sync broke
				// after switching a translation, until a reload remounted everything). Requerying by the
				// stable position attribute instead of trusting which elements happened to remount fixes
				// every column at once, whatever combination of add/remove/reorder/swap caused the change.
				tick().then(() => {
					flowColumns = data.columns
						.map((_, index) =>
							document.querySelector<HTMLElement>(`.flow-column[data-flow-column-index="${index}"]`)
						)
						.filter((element): element is HTMLElement => element !== null);
				});
			}
			visibleChapterKey = `${data.reference.book}:${data.reference.chapter}`;
			readerLocation.reference = data.reference;
			activeFlowSource = 0;
			jumpedSignature = '';
			if (data.reference.verse === undefined) {
				// Landing on a new chapter always starts at its top.
				tick().then(() => window.scrollTo({ top: 0, behavior: 'instant' }));
			}
		}
	});

	function suppressProgrammaticFlowScroll(columnIndex: number) {
		suppressedFlowColumns.add(columnIndex);
		const currentTimer = suppressFlowTimers[columnIndex];
		if (currentTimer) clearTimeout(currentTimer);
		suppressFlowTimers[columnIndex] = setTimeout(() => {
			suppressedFlowColumns.delete(columnIndex);
			suppressFlowTimers[columnIndex] = undefined;
		}, 80);
	}

	async function fetchStreamChapter(reference: { book: number; chapter: number }) {
		const response = await fetch(`/api/reader/${reference.book}/${reference.chapter}`);
		if (!response.ok) throw new Error(`Kapitel konnte nicht geladen werden (${response.status})`);
		return (await response.json()) as StreamChapter;
	}

	async function loadStreamPrevious() {
		const reference = streamChapters[0]?.navigation.previous;
		if (!reference || flowColumns.length === 0 || loadingPrevious) return;
		const generation = streamGeneration;
		loadingPrevious = true;
		try {
			const chapter = await fetchStreamChapter(reference);
			if (generation !== streamGeneration) return;
			// Capture immediately before the mutation, not before the request: touch momentum may continue
			// while the chapter is in flight and that genuine user movement must not be rolled back.
			const oldHeights = flowColumns.map((column) => column?.scrollHeight ?? 0);
			// Keep the pre-mutation positions as well as the heights. Browsers may apply CSS scroll
			// anchoring as soon as the prepended chapter reaches the DOM and increase `scrollTop` on their
			// own. Reading `column.scrollTop` after `tick()` and adding the height delta to that value would
			// then compensate twice — the race behind the occasional multi-verse/chapter jump on the first
			// quick wheel or touch scroll after a reload.
			const oldScrollTops = flowColumns.map((column) => column?.scrollTop ?? 0);
			streamChapters.unshift(chapter);
			await tick();
			for (const [index, column] of flowColumns.entries()) {
				if (column) {
					const next = (oldScrollTops[index] ?? 0) + column.scrollHeight - (oldHeights[index] ?? 0);
					suppressProgrammaticFlowScroll(index);
					column.scrollTop = next;
				}
			}
		} finally {
			if (generation === streamGeneration) loadingPrevious = false;
		}
	}

	async function loadStreamNext() {
		const reference = streamChapters.at(-1)?.navigation.next;
		if (!reference || loadingNext) return;
		const generation = streamGeneration;
		loadingNext = true;
		try {
			const chapter = await fetchStreamChapter(reference);
			if (generation !== streamGeneration) return;
			streamChapters.push(chapter);
			await tick();
			if (generation !== streamGeneration) return;
			syncFlowColumns(activeFlowSource);
		} finally {
			if (generation === streamGeneration) loadingNext = false;
		}
	}

	function updateVisibleChapter(source: HTMLElement, inset: number) {
		const top = source.getBoundingClientRect().top + inset;
		const chapters = [...source.querySelectorAll<HTMLElement>('[data-chapter-key]')];
		const chapter =
			chapters.findLast((section) => section.getBoundingClientRect().top <= top) ?? chapters[0];
		if (chapter?.dataset.chapterKey) visibleChapterKey = chapter.dataset.chapterKey;
	}

	let addressBarTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Keeps the URL, and `readerLocation` (which the header's search field reads), in step with
	 * whatever chapter and verse are actually on screen while scrolling. A reload then lands back where
	 * the reader left off, not at the chapter the click landed on.
	 *
	 * The search field follows the visible anchor immediately. Only the actual address-bar rewrite is
	 * debounced, avoiding needless churn and `history` rate limits while scrolling continues.
	 */
	function scheduleAddressBarUpdate(verseKey: string | undefined) {
		if (!verseKey) return;
		const [book, chapter, verse] = verseKey.split(':').map(Number);
		if (!book || !chapter || !verse) return;

		// The search field follows this immediately — it already only re-syncs while unfocused (see
		// `SiteHeader.svelte`), so there is no risk of clobbering something the reader is typing. Only
		// the actual address bar write stays debounced, since rewriting `history` on every settle would
		// be needless churn.
		readerLocation.reference = { book, chapter, verse };

		if (addressBarTimer) clearTimeout(addressBarTimer);
		addressBarTimer = setTimeout(() => {
			addressBarTimer = undefined;
			const path = referencePath({ book, chapter, verse });
			if (path === window.location.pathname) return;
			replaceState(`${path}${window.location.search}${window.location.hash}`, page.state);
		}, 200);
	}

	/** Cancels delayed work before it can apply an old chapter's position to a new navigation. */
	function cancelScheduledReaderWork() {
		if (flowSyncTimer) clearTimeout(flowSyncTimer);
		flowSyncTimer = undefined;
		if (addressBarTimer) clearTimeout(addressBarTimer);
		addressBarTimer = undefined;
		for (const timer of suppressFlowTimers) {
			if (timer) clearTimeout(timer);
		}
		suppressFlowTimers = [];
		suppressedFlowColumns.clear();
	}

	beforeNavigate(() => {
		streamGeneration += 1;
		cancelScheduledReaderWork();
	});

	onDestroy(cancelScheduledReaderWork);

	/**
	 * Finds the element for a verse within a flow column, matching a ranged block (a commentary entry or
	 * a merged Bible verse cell) whenever the verse falls inside its `data-verse-key`/`data-verse-end`
	 * span, not just on an exact key match. Without this, a comment covering verses 3-5 (or a translation
	 * that prints 16-17 as one unit) is only found while the anchor verse is exactly its first verse —
	 * everywhere else in the range, sync silently does nothing and a deep link into the middle of the
	 * range finds no target to scroll to at all.
	 */
	function findVerseElement(container: Element, key: string, verse: number): HTMLElement | null {
		const exact = container.querySelector<HTMLElement>(`[data-verse-key="${key}"]`);
		if (exact) return exact;

		const prefix = key.slice(0, key.lastIndexOf(':') + 1);
		for (const candidate of container.querySelectorAll<HTMLElement>('[data-verse-end]')) {
			const candidateKey = candidate.dataset.verseKey;
			if (!candidateKey || !candidateKey.startsWith(prefix)) continue;
			const start = Number(candidateKey.slice(prefix.length));
			const end = Number(candidate.dataset.verseEnd);
			if (Number.isFinite(start) && Number.isFinite(end) && start <= verse && verse <= end) {
				return candidate;
			}
		}
		return null;
	}

	function firstVisibleVerse(source: HTMLElement): HTMLElement | undefined {
		const sourceTop = source.getBoundingClientRect().top + FLOW_EDGE_FADE_PX;
		return [...source.querySelectorAll<HTMLElement>('[data-verse-key]')].find(
			(verse) => verse.getBoundingClientRect().bottom > sourceTop
		);
	}

	/**
	 * Scrolls straight to a reference already in the loaded stream, without a navigation — used both to
	 * land on a deep-linked verse after a real navigation and, via `jumpToVerse`, to let the header's
	 * search field re-centre on a reference that a plain `goto` would treat as a no-op because the URL
	 * would not change (the reader may have scrolled away from it since).
	 *
	 * Returns whether the reference was actually found, so a caller like the header can fall back to a
	 * real navigation for anything not already loaded.
	 */
	function scrollToVerse(
		book: number,
		chapter: number,
		verse: number,
		allowHighlightedFallback = false
	): boolean {
		const key = `${book}:${chapter}:${verse}`;
		let found = false;
		for (const [index, column] of flowColumns.entries()) {
			const target =
				(column && findVerseElement(column, key, verse)) ??
				(allowHighlightedFallback
					? column?.querySelector<HTMLElement>('.flow-verse.highlighted')
					: null);
			if (column && target) {
				found = true;
				lastAlignedElement[index] = target;
				const next =
					column.scrollTop +
					target.getBoundingClientRect().top -
					column.getBoundingClientRect().top -
					FLOW_EDGE_FADE_PX;
				suppressProgrammaticFlowScroll(index);
				column.scrollTop = next;
			}
		}
		if (found) {
			visibleChapterKey = `${book}:${chapter}`;
			scheduleAddressBarUpdate(key);
		}
		return found;
	}

	$effect(() => {
		setJumpToVerse((reference: VerseRef) =>
			scrollToVerse(reference.book, reference.chapter, reference.verse ?? 1)
		);
		return () => setJumpToVerse(null);
	});

	/**
	 * `trackAddress` is only set from a real scroll event (via `scheduleFlowSync`) — the other callers
	 * use this purely to align the non-source columns with wherever the source column already is, on
	 * mount or after a chapter loads, and are not the reader actually moving. Driving the address bar
	 * from those too could genuinely move it a verse or two off (a short verse 1 can already have
	 * scrolled past the anchor line by the time this first runs), even though nothing was scrolled.
	 */
	function syncFlowColumns(sourceIndex = 0, trackAddress = false) {
		const source = flowColumns[sourceIndex];
		if (!source) return;
		// An unlinked source doesn't drag the others along, and an unlinked column isn't dragged by them
		// — that decoupling is the whole point of the per-column link toggle.
		if (unlinkedColumns.has(sourceIndex)) return;
		const anchorInset = FLOW_EDGE_FADE_PX;
		updateVisibleChapter(source, anchorInset);
		const anchor = firstVisibleVerse(source);
		if (!anchor?.dataset.verseKey) return;
		if (trackAddress) scheduleAddressBarUpdate(anchor.dataset.verseKey);
		const anchorVerse = Number(anchor.dataset.verseKey.split(':').at(-1));

		for (let index = 0; index < flowColumns.length; index += 1) {
			if (index === sourceIndex || unlinkedColumns.has(index)) continue;
			const column = flowColumns[index];
			const target = column && findVerseElement(column, anchor.dataset.verseKey, anchorVerse);
			if (!column || !target) continue;

			// Only a genuine change of the block covering the anchor verse moves this column — as long as
			// scrolling the source stays within the same ranged block (e.g. a comment on verses 3-5), the
			// same element keeps being found here and nothing happens. That is what lets a long comment be
			// read on its own without dragging the Bible text along, and vice versa: the target only jumps
			// once the reader actually crosses into the next range.
			if (lastAlignedElement[index] === target) continue;
			lastAlignedElement[index] = target;

			const columnTop = column.getBoundingClientRect().top + anchorInset;
			const next = column.scrollTop + target.getBoundingClientRect().top - columnTop;
			suppressProgrammaticFlowScroll(index);
			column.scrollTop = next;
		}
	}

	function makeFlowSource(columnIndex: number) {
		if (unlinkedColumns.has(columnIndex)) return;
		activeFlowSource = columnIndex;
		// A real interaction only overrides suppression for the column being touched. Other columns may
		// still have delayed scroll events queued from our own alignment and must remain suppressed.
		const suppressTimer = suppressFlowTimers[columnIndex];
		if (suppressTimer) clearTimeout(suppressTimer);
		suppressFlowTimers[columnIndex] = undefined;
		suppressedFlowColumns.delete(columnIndex);
		if (flowSyncTimer) clearTimeout(flowSyncTimer);
	}

	/** Native mouse-wheel steps vary widely between browsers and operating systems and can move several
	 *  lines at once. Reducing the normalized vertical delta makes close reading more precise without
	 *  changing touch scrolling, scrollbar dragging or keyboard navigation. */
	function onFlowWheel(event: WheelEvent, columnIndex: number) {
		makeFlowSource(columnIndex);
		if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

		const column = event.currentTarget as HTMLElement;
		const normalizedDelta =
			event.deltaMode === 1
				? event.deltaY * 16
				: event.deltaMode === 2
					? event.deltaY * column.clientHeight
					: event.deltaY;
		event.preventDefault();
		column.scrollTop += normalizedDelta * WHEEL_SCROLL_FACTOR;
	}

	/**
	 * Debounces the cross-column sync so it runs once the scroll has settled rather than on every
	 * scroll event. On touch devices a drag fires continuous scroll events with no gaps, so this
	 * keeps the other columns still until the finger lifts and any momentum scrolling stops — synced
	 * columns jumping around mid-drag reads as jittery, not helpful.
	 */
	function scheduleFlowSync(columnIndex: number) {
		if (flowSyncTimer) clearTimeout(flowSyncTimer);
		flowSyncTimer = setTimeout(() => {
			flowSyncTimer = undefined;
			syncFlowColumns(columnIndex, true);
		}, 150);
	}

	/**
	 * Any scroll that was not caused by our own sync (`suppressedFlowColumns`) makes that column the
	 * source, regardless of whether a preceding wheel/pointer/touch/focus event already marked it as
	 * one — those events do not fire for every way a column can be scrolled (e.g. some trackpads,
	 * scrollbar dragging, or keyboard paging), and this handler is the one signal that always fires.
	 */
	function onFlowScroll(columnIndex: number) {
		const source = flowColumns[columnIndex];
		if (!source) return;
		updateFlowEdgeState(columnIndex, source);
		if (suppressedFlowColumns.has(columnIndex)) return;
		// Sync off does not stop this column's own endless-scroll loading below — only the two lines
		// that would make it the sync source are skipped.
		if (!unlinkedColumns.has(columnIndex)) {
			activeFlowSource = columnIndex;
			scheduleAddressBarUpdate(firstVisibleVerse(source)?.dataset.verseKey);
			scheduleFlowSync(columnIndex);
		}
		updateVisibleChapter(source, FLOW_EDGE_FADE_PX);
		if (source.scrollTop < 500) void loadStreamPrevious();
		if (source.scrollHeight - source.scrollTop - source.clientHeight < 900) void loadStreamNext();
	}

	function updateFlowEdgeState(columnIndex: number, source: HTMLElement) {
		flowHasContentAbove[columnIndex] = source.scrollTop > 4;
		flowHasContentBelow[columnIndex] =
			source.scrollHeight - source.scrollTop - source.clientHeight > 4;
	}

	$effect(() => {
		tick().then(() => {
			syncFlowColumns(activeFlowSource);
			flowColumns.forEach((column, index) => updateFlowEdgeState(index, column));
			void loadStreamNext().then(() => {
				flowColumns.forEach((column, index) => updateFlowEdgeState(index, column));
			});
		});
	});

	$effect(() => {
		const verse = data.reference.verse;
		if (verse === undefined) return;
		const signature = `${data.reference.book}:${data.reference.chapter}:${verse}`;
		if (signature === jumpedSignature) return;
		jumpedSignature = signature;

		// The highlighted-verse fallback covers a merged range (e.g. "16-17"): only the range's first
		// verse carries that exact `data-verse-key`, so a deep link straight to "17" would otherwise
		// find nothing.
		tick().then(() => {
			scrollToVerse(data.reference.book, data.reference.chapter, verse, true);
		});
	});

	function firstCellVerse(stream: StreamChapter, bibleCellIndex: number | null): number | null {
		if (bibleCellIndex === null) return null;
		for (const row of stream.chapter.rows) {
			const cell = row.cells[bibleCellIndex];
			if (cell) return cell.verse;
		}
		return null;
	}
</script>

<svelte:window
	onpointermove={onColumnResizeMove}
	onpointerup={onColumnResizeEnd}
	onpopstate={() => restoreStrongFromHash(window.location.hash)}
/>

<svelte:head>
	<title>{data.fullTitle} — Akribos</title>
	<meta
		name="description"
		content="{data.fullTitle} in {data.columns
			.map((column) => column.resource.tabTitle)
			.join(', ')} — mit Strong-Nummern, Grammatik und Wörterbuch."
	/>
	{#if previousPath}<link rel="prev" href={previousPath} />{/if}
	{#if nextPath}<link rel="next" href={nextPath} />{/if}
</svelte:head>

<div class="min-h-0 flex-1">
	<!-- No `overflow-x` here: it would make this a scroll container, and every `sticky` inside it
	     would then stick to a box that never scrolls vertically. The grid's `minmax(0, 1fr)` tracks
	     cannot overflow anyway. -->
	<main>
		<div
			class="mx-auto max-w-[var(--content-max-width)] px-3 py-5 sm:px-6 sm:py-6"
			class:pb-sheet={activeStrong !== null}
		>
			<div
				class="mb-5 flex items-center gap-3 pt-2 pb-1 sm:mb-6 sm:pt-3 sm:pb-2"
				data-testid="reader-location"
			>
				<h1
					class="mr-auto truncate text-3xl font-semibold tracking-[-0.035em] text-stone-900 sm:text-4xl
					       dark:text-stone-100"
				>
					{visibleStreamChapter?.fullTitle ?? data.fullTitle}
				</h1>
			</div>

			<!-- Column headers double as the translation picker. The bar sticks as one piece; a single
			     header cell is never taller than itself and so could never stick on its own. -->
			<div
				bind:this={columnHeaderBar}
				class="relative sticky top-[var(--header-height)] z-10 -mx-2 mb-3 hidden gap-3
				       rounded-xl bg-[color:var(--paper)]/94 p-2 backdrop-blur-xl sm:grid"
				data-testid="column-picker-bar"
				style="grid-template-columns: {headerGridTemplate}"
			>
				{#each data.columns as column (column.resource.id)}
					<div
						draggable="true"
						role="group"
						aria-label="{column.resource.tabTitle}: {t('reader.dragColumn')}"
						class="min-w-0 rounded-lg border border-stone-200/80 bg-[color:var(--surface)] px-1 shadow-sm dark:border-white/8"
						class:opacity-40={draggedColumn === column.index}
						class:ring-2={dropColumn === column.index}
						class:ring-accent-400={dropColumn === column.index}
						ondragstart={(event) => startColumnDrag(event, column.index)}
						ondragover={(event) => {
							event.preventDefault();
							dropColumn = column.index;
						}}
						ondragleave={() => (dropColumn = null)}
						ondrop={(event) => dropOnColumn(event, column.index)}
						ondragend={() => {
							draggedColumn = null;
							dropColumn = null;
						}}
					>
						<ColumnPicker
							index={column.index}
							selected={column.resource}
							canRemove={data.columns.length > 1}
							canAdd={canAddColumn && column.index === data.columns.length - 1}
							linked={!unlinkedColumns.has(column.index)}
							onOpenTranslation={openTranslationDialog}
							onOpenAdd={openAddDialog}
							onToggleLink={() => toggleLink(column.index)}
						/>
					</div>
				{/each}
			</div>
			<form bind:this={reorderForm} method="POST" action="?/moveColumn" use:enhance class="hidden">
				<input bind:this={reorderFromInput} type="hidden" name="from" />
				<input bind:this={reorderToInput} type="hidden" name="to" />
			</form>
			<form
				bind:this={widthsForm}
				method="POST"
				action="?/setColumnWidths"
				use:enhance
				class="hidden"
			>
				<input bind:this={widthsInput} type="hidden" name="widths" />
			</form>

			<!-- On a phone one column fits; tabs switch between translations. -->
			<div
				class="sticky top-[var(--header-height)] z-10 -mx-3 flex gap-1 overflow-x-auto border-b
				       border-stone-200 bg-white/95 px-3 py-2 backdrop-blur sm:hidden
				       dark:border-stone-800 dark:bg-stone-950/95"
				data-testid="column-picker-bar"
			>
				<!-- The tablist container itself is never a stop on the Tab key — only the tabs are, via
			     their own roving tabindex below — so it does not need one of its own either. -->
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					bind:this={mobileTablist}
					role="tablist"
					aria-label={t('reader.mobileColumnsTablist')}
					class="contents"
					onkeydown={onMobileTabKeydown}
				>
					{#each data.columns as column (column.resource.id)}
						<span
							class="mobile-tab flex shrink-0 items-center gap-1 rounded-full px-1 py-1 pl-3 text-sm"
							class:bg-accent-600={mobileColumn === column.index}
							class:text-white={mobileColumn === column.index}
							class:bg-stone-100={mobileColumn !== column.index}
							class:dark:bg-stone-800={mobileColumn !== column.index}
						>
							<button
								type="button"
								role="tab"
								id="mobile-tab-{column.index}"
								aria-selected={mobileColumn === column.index}
								aria-controls="mobile-tabpanel-{column.index}"
								tabindex={mobileColumn === column.index ? 0 : -1}
								class="shrink-0"
								aria-label={mobileColumn === column.index
									? `${t('reader.chooseTranslation')}: ${column.resource.tabTitle}`
									: column.resource.tabTitle}
								onclick={() => {
									if (mobileColumn === column.index) openTranslationDialog(column.index);
									else mobileColumn = column.index;
								}}
							>
								{column.resource.tabTitle}
							</button>
							{#if data.columns.length > 1}
								<form method="POST" action="?/removeColumn" use:enhance>
									<input type="hidden" name="index" value={column.index} />
									<button
										type="submit"
										aria-label="{t('reader.removeColumn')}: {column.resource.tabTitle}"
										class="inline-flex size-5 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
										onclick={(event) => {
											if (mobileColumn === column.index)
												mobileColumn = Math.max(0, column.index - 1);
											event.stopPropagation();
										}}
									>
										<svg
											viewBox="0 0 20 20"
											class="size-3.5"
											fill="currentColor"
											aria-hidden="true"
										>
											<path
												d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
											/>
										</svg>
									</button>
								</form>
							{/if}
						</span>
					{/each}
				</div>

				{#if canAddColumn}
					<button
						type="button"
						title={t('reader.addColumn')}
						aria-label={t('reader.addColumn')}
						class="shrink-0 rounded-full border border-dashed border-stone-300 px-3 py-1
						       text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400"
						onclick={openAddDialog}
					>
						+
					</button>
				{/if}
			</div>

			{#if data.chapter.empty}
				<p class="rounded-lg bg-stone-50 p-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
					{t('reader.chapterEmpty')}
				</p>
			{:else}
				<div
					bind:this={flowReader}
					class="flow-reader"
					style="--columns: {visibleColumnCount}"
					style:--column-track={columnTrack}
					style:--flow-edge-fade-height={`${FLOW_EDGE_FADE_PX}px`}
					data-testid="flow-reader"
				>
					<!-- The splitter belongs to the text it resizes. Keeping its overlay outside the individual
					     scrolling columns leaves it stationary and centered while either text column scrolls. -->
					<div class="pointer-events-none absolute inset-0 z-10 hidden sm:block">
						{#each columnBoundaries as boundary, boundaryIndex (boundaryIndex)}
							<!-- A focusable, draggable separator is the documented WAI-ARIA window-splitter
							     pattern and also supports ArrowLeft/ArrowRight. -->
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<div
								role="separator"
								aria-orientation="vertical"
								aria-label={t('reader.resizeColumns')}
								aria-valuenow={Math.round(
									(columnWidths ?? equalColumnWidths())[boundaryIndex]! * 100
								)}
								aria-valuemin={Math.round(MIN_COLUMN_FRACTION * 100)}
								aria-valuemax={Math.round(
									(1 - MIN_COLUMN_FRACTION * (data.columns.length - 1)) * 100
								)}
								tabindex="0"
								class="column-resize-handle"
								style="left: calc({boundary.percent}% {boundary.offsetRem >= 0
									? '+'
									: '-'} {Math.abs(boundary.offsetRem)}rem)"
								onpointerdown={(event) => startColumnResize(event, boundaryIndex)}
								onkeydown={(event) => onResizeHandleKeydown(event, boundaryIndex)}
							>
								<span aria-hidden="true"><i></i><i></i><i></i></span>
							</div>
						{/each}
					</div>

					<div class="flow-fade-grid pointer-events-none absolute inset-0 z-5 hidden sm:grid">
						{#each data.columns as column, columnIndex (column.resource.id)}
							<div class="relative min-w-0">
								<span
									class="flow-edge-fade top"
									class:visible={flowHasContentAbove[columnIndex]}
									aria-hidden="true"
								></span>
								<span
									class="flow-edge-fade bottom"
									class:visible={flowHasContentBelow[columnIndex]}
									aria-hidden="true"
								></span>
							</div>
						{/each}
					</div>

					{#if mobileColumn < data.columns.length}
						<div class="pointer-events-none absolute inset-0 z-5 sm:hidden">
							<span
								class="flow-edge-fade top"
								class:visible={flowHasContentAbove[mobileColumn]}
								aria-hidden="true"
							></span>
							<span
								class="flow-edge-fade bottom"
								class:visible={flowHasContentBelow[mobileColumn]}
								aria-hidden="true"
							></span>
						</div>
					{/if}

					{#each data.columns as column, columnIndex (column.resource.id)}
						<div
							bind:this={flowColumns[columnIndex]}
							data-flow-column-index={columnIndex}
							data-resource-id={column.resource.id}
							class="flow-column"
							class:hidden-on-mobile={columnIndex !== mobileColumn}
							role={isMobileViewport ? 'tabpanel' : 'region'}
							id={isMobileViewport ? `mobile-tabpanel-${columnIndex}` : undefined}
							aria-labelledby={isMobileViewport ? `mobile-tab-${columnIndex}` : undefined}
							aria-label={isMobileViewport ? undefined : column.resource.selectionTitle}
							aria-hidden={isMobileViewport && columnIndex !== mobileColumn}
							onwheel={(event) => onFlowWheel(event, columnIndex)}
							ontouchstart={() => makeFlowSource(columnIndex)}
							onpointerdown={() => makeFlowSource(columnIndex)}
							onfocusin={() => makeFlowSource(columnIndex)}
							onscroll={() => onFlowScroll(columnIndex)}
						>
							{#if loadingPrevious}
								<p class="loading-chapter" aria-live="polite">…</p>
							{/if}
							{#each streamChapters as stream (`${stream.reference.book}:${stream.reference.chapter}`)}
								{@const firstVerse = firstCellVerse(stream, column.bibleCellIndex)}
								<section
									class="flow-chapter"
									data-chapter-key={`${stream.reference.book}:${stream.reference.chapter}`}
								>
									{#each stream.chapter.rows as row (row.verse)}
										{@const cell =
											column.bibleCellIndex === null ? null : row.cells[column.bibleCellIndex]}
										{#if column.resource.kind === 'bible' && cell?.heading}
											<h3 class="flow-heading">{cell.heading}</h3>
										{/if}
										{#if column.resource.kind === 'bible' && cell}
											{@const [leadSegments, remainingSegments] = splitVerseLead(cell.segments)}
											{@const leadWordCount = countVerseWords(leadSegments)}
											{@const mark = highlightByKey.get(
												`${stream.reference.book}:${stream.reference.chapter}:${cell.verse}`
											)}
											{@const partial =
												partialHighlightsByKey.get(
													`${stream.reference.book}:${stream.reference.chapter}:${cell.verse}:${column.resource.id}`
												) ?? []}
											{@const comment = verseCommentAt(stream, column.resource.id, cell.verse)}
											{@const commentKey = verseCommentKey(
												stream.reference.book,
												stream.reference.chapter,
												cell.verse,
												column.resource.id
											)}
											{@const commentVisible =
												draftCommentKeys.has(commentKey) ||
												Boolean(comment && expandedCommentKeys.has(commentKey))}
											<div class="verse-comment-row" class:with-comment={commentVisible}>
												<p
													class="flow-verse"
													data-verse-key={`${stream.reference.book}:${stream.reference.chapter}:${cell.verse}`}
													data-verse-end={cell.verseEnd ?? cell.verse}
													id={columnIndex === 0
														? `${stream.shortBookName}${stream.reference.chapter}_${cell.verse}`
														: undefined}
													class:highlighted={stream.reference.book === data.reference.book &&
														stream.reference.chapter === data.reference.chapter &&
														data.reference.verse !== undefined &&
														cell.verse <= data.reference.verse &&
														(cell.verseEnd ?? cell.verse) >= data.reference.verse}
													style:background-color={mark?.color}
												>
													<span class="verse-lead">
														{#if cell.verse === firstVerse}
															<a
																class="flow-chapter-number"
																class:in-list={stream.reference.book === data.reference.book &&
																	stream.reference.chapter === data.reference.chapter &&
																	inAnyList.has(cell.verse)}
																title={stream.fullTitle}
																href={referencePath({
																	book: stream.reference.book,
																	chapter: stream.reference.chapter,
																	verse: cell.verse
																})}
																aria-haspopup="menu"
																aria-label={t('verse.menu', {
																	reference: formatReference(
																		{
																			book: stream.reference.book,
																			chapter: stream.reference.chapter,
																			verse: cell.verse
																		},
																		{ style: 'full' }
																	)
																})}
																onclick={(event) =>
																	onVerseNumberClick(
																		event,
																		stream.reference.book,
																		stream.reference.chapter,
																		cell.verse,
																		cell.verseEnd,
																		cell.segments,
																		{ id: column.resource.id, name: column.resource.tabTitle }
																	)}
															>
																{stream.reference.chapter}
															</a>
														{/if}
														{#if cell.verse !== 1 || cell.verse !== firstVerse}
															<a
																class="verse-number"
																class:in-list={stream.reference.book === data.reference.book &&
																	stream.reference.chapter === data.reference.chapter &&
																	inAnyList.has(cell.verse)}
																href={referencePath({
																	book: stream.reference.book,
																	chapter: stream.reference.chapter,
																	verse: cell.verse
																})}
																aria-haspopup="menu"
																aria-label={t('verse.menu', {
																	reference: formatReference(
																		{
																			book: stream.reference.book,
																			chapter: stream.reference.chapter,
																			verse: cell.verse
																		},
																		{ style: 'full' }
																	)
																})}
																onclick={(event) =>
																	onVerseNumberClick(
																		event,
																		stream.reference.book,
																		stream.reference.chapter,
																		cell.verse,
																		cell.verseEnd,
																		cell.segments,
																		{ id: column.resource.id, name: column.resource.tabTitle }
																	)}
															>
																{cell.verse}{#if cell.verseEnd && cell.verseEnd > cell.verse}-{cell.verseEnd}{/if}
															</a>
														{/if}<span
															class="verse-text"
															lang={column.resource.language}
															dir={column.resource.direction}
															><VerseText
																segments={leadSegments}
																onStrongClick={(strong, word) =>
																	openStrong(
																		strong,
																		word,
																		cell.verse,
																		stream.reference.book,
																		stream.reference.chapter
																	)}
																activeStrong={activeStrong?.strong ?? null}
																highlights={partial}
																{hoverStrong}
																onStrongHover={(strong) => (hoverStrong = strong)}
															/></span
														></span
													><span
														class="verse-text"
														lang={column.resource.language}
														dir={column.resource.direction}
													>
														<VerseText
															segments={remainingSegments}
															onStrongClick={(strong, word) =>
																openStrong(
																	strong,
																	word,
																	cell.verse,
																	stream.reference.book,
																	stream.reference.chapter
																)}
															activeStrong={activeStrong?.strong ?? null}
															highlights={partial}
															wordOffset={leadWordCount}
															{hoverStrong}
															onStrongHover={(strong) => (hoverStrong = strong)}
														/>
													</span>
													{#if data.user && comment}
														<CommentToggle
															hasComment
															active={commentVisible}
															onclick={() => toggleVerseComment(commentKey)}
														/>
													{/if}
												</p>
												{#if commentVisible}
													<CommentBubble
														action="?/saveVerseComment"
														reference={formatReference({
															book: stream.reference.book,
															chapter: stream.reference.chapter,
															verse: cell.verse
														})}
														resourceId={column.resource.id}
														html={comment?.html}
														startEditing={draftCommentKeys.has(commentKey)}
														onSaved={(html) =>
															updateVerseComment(stream, column.resource.id, cell.verse, html)}
														onClose={() => draftCommentKeys.delete(commentKey)}
													/>
												{/if}
											</div>
										{:else if column.resource.kind === 'commentary'}
											{@const entries = commentaryAt(
												stream.referenceResources,
												column.resource.id,
												row.verse
											)}
											{#if entries.length}
												{@const rangeEnd = Math.max(
													...entries.map((entry) => entry.verseEnd ?? entry.verseStart ?? row.verse)
												)}
												<article
													class="flow-reference"
													data-verse-key={`${stream.reference.book}:${stream.reference.chapter}:${row.verse}`}
													data-verse-end={rangeEnd}
												>
													<span class="verse-number"
														>{row.verse}{#if rangeEnd > row.verse}-{rangeEnd}{/if}</span
													>
													{#each entries as entry (entry.id)}
														{#if entry.title}<h3 class="commentary-title">{entry.title}</h3>{/if}
														<!-- Imported commentary is reduced to an allow-list by its parser. -->
														<div
															class="commentary-body"
															use:verseHoverPopover={{ bibleId: primaryBibleId }}
														>
															<!-- eslint-disable-next-line svelte/no-at-html-tags -->
															{@html entry.bodyHtml}
														</div>
													{/each}
												</article>
											{/if}
										{:else if column.resource.kind === 'xrefs'}
											{@const references = crossReferencesAt(
												stream.referenceResources,
												column.resource.id,
												row.verse
											)}
											{#if references.length}
												<div
													class="flow-reference"
													data-verse-key={`${stream.reference.book}:${stream.reference.chapter}:${row.verse}`}
												>
													<span class="verse-number">{row.verse}</span>
													{#each references as target (target.id)}
														<a
															class="mr-1 text-xs text-accent-700 dark:text-accent-300"
															href={referencePath({
																book: target.toBook,
																chapter: target.toChapter,
																verse: target.toVerse
															})}
														>
															{formatReference({
																book: target.toBook,
																chapter: target.toChapter,
																verse: target.toVerse
															})}
														</a>
													{/each}
												</div>
											{/if}
										{/if}
									{/each}
								</section>
							{/each}
							{#if loadingNext}
								<p class="loading-chapter" aria-live="polite">…</p>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Each flow column scrolls endlessly on its own, so there is no natural "end of chapter"
				     point inside it to hang a licence notice on; shown once below the box instead. -->
				<footer
					class="license-grid grid text-xs text-stone-500 dark:text-stone-400"
					style="--columns: {visibleColumnCount}"
					style:--column-track={columnTrack}
				>
					{#each data.columns as column (column.resource.id)}
						<div class:hidden-on-mobile={column.index !== mobileColumn}>
							{#if column.resource.licenseHtml}
								<p><strong>{column.resource.tabTitle}:</strong> {column.resource.licenseHtml}</p>
							{/if}
						</div>
					{/each}
				</footer>
			{/if}
		</div>
	</main>

	{#if activeStrong}
		<StudySidebar
			strong={activeStrong.strong}
			word={activeStrong.word}
			reference={activeStrong.reference}
			resourceIds={data.columns.map((column) => column.resource.id)}
			onClose={closeStrong}
		/>
	{/if}
</div>

<!-- One menu for the whole chapter, opened with whichever verse number was clicked. -->
<VerseMenu
	bind:this={verseMenu}
	lists={data.lists}
	signedIn={data.user !== null}
	{marks}
	highlightStyles={data.highlightStyles}
/>

<!-- One dialog for the whole page, opened for whichever column was clicked. -->
<TranslationDialog
	bind:this={translationDialog}
	resources={data.readerResources}
	label={t('reader.chooseTranslation')}
/>

<style>
	/* Straddles the boundary halfway down the reading area. Only the handle itself takes pointer
	   events, so the transparent overlay around it never blocks text selection or scrolling. */
	.column-resize-handle {
		position: absolute;
		top: 50%;
		display: flex;
		width: 18px;
		height: 3.25rem;
		margin-left: -9px;
		transform: translateY(-50%);
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		cursor: col-resize;
		touch-action: none;
		pointer-events: auto;
	}

	.column-resize-handle span {
		display: flex;
		width: 0.75rem;
		height: 1.7rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.16rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 999px;
		background: var(--surface-raised);
		box-shadow: 0 1px 3px rgb(28 25 23 / 0.12);
		color: var(--color-stone-400);
	}

	.column-resize-handle i {
		display: block;
		width: 2px;
		height: 2px;
		border-radius: 999px;
		background: currentColor;
	}

	.column-resize-handle:hover,
	.column-resize-handle:focus-visible {
		background: color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}

	.column-resize-handle:hover span,
	.column-resize-handle:focus-visible span {
		border-color: var(--color-accent-500);
		color: var(--color-accent-600);
	}

	.column-resize-handle:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 1px;
	}

	:global(.dark) .column-resize-handle span {
		border-color: var(--color-stone-600);
		background: var(--surface-raised);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
		color: var(--color-stone-500);
	}

	@media (min-width: 640px) and (max-width: 1280px), (update: slow), (monochrome) {
		.column-resize-handle span {
			width: 1rem;
			height: 2.25rem;
			border-width: 2px;
			border-color: var(--color-stone-500);
			color: var(--color-stone-700);
			box-shadow: none;
		}
	}

	/* The mobile column tabs. The pill's background already shows which one is selected; the
	   underline is a second, less color-dependent cue, and the one that actually animates. */
	.mobile-tab {
		position: relative;
	}

	.mobile-tab::after {
		position: absolute;
		right: 20%;
		bottom: -0.35rem;
		left: 20%;
		height: 2px;
		border-radius: 1px;
		background: var(--color-accent-500);
		opacity: 0;
		transition: opacity 150ms ease;
		content: '';
	}

	.mobile-tab[aria-selected='true']::after {
		opacity: 1;
	}

	.mobile-tab:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
	}

	.license-grid {
		grid-template-columns: var(--column-track, repeat(var(--columns), minmax(0, 1fr)));
		margin-top: 1.5rem;
	}

	.flow-reader {
		position: relative;
		display: grid;
		grid-template-columns: var(--column-track, repeat(var(--columns), minmax(0, 1fr)));
		gap: 0.75rem;
		height: max(28rem, calc(100dvh - var(--header-height) - 11.5rem));
		overflow: hidden;
		background: transparent;
	}

	:global(.dark) .flow-reader {
		background: transparent;
	}

	.flow-column {
		min-width: 0;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		scrollbar-width: none;
		border: 1px solid var(--line);
		border-radius: 0.75rem;
		background: var(--surface);
		box-shadow: var(--shadow-soft);
	}

	.flow-column::-webkit-scrollbar {
		display: none;
	}

	.flow-fade-grid {
		grid-template-columns: var(--column-track, repeat(var(--columns), minmax(0, 1fr)));
		gap: 0.75rem;
	}

	/* These veils live above the scrolling content but below the splitter, so text fades softly while
	   card borders and the resize control remain crisp. */
	.flow-edge-fade {
		position: absolute;
		right: 1px;
		left: 1px;
		height: var(--flow-edge-fade-height);
		opacity: 0;
		transition: opacity 140ms ease;
	}

	.flow-edge-fade.top {
		top: 1px;
		background: linear-gradient(
			to bottom,
			var(--surface) 0%,
			color-mix(in oklab, var(--surface) 82%, transparent) 38%,
			transparent 100%
		);
	}

	.flow-edge-fade.bottom {
		bottom: 1px;
		background: linear-gradient(
			to top,
			var(--surface) 0%,
			color-mix(in oklab, var(--surface) 82%, transparent) 38%,
			transparent 100%
		);
	}

	.flow-edge-fade.visible {
		opacity: 1;
	}

	/* Enough trailing room for the final verse to become the top anchor as well. Without this, a
	   shorter translation would hit its scroll limit before it could follow the first column. */
	.flow-column::after {
		display: block;
		height: calc(100% - 3rem);
		content: '';
	}

	:global(.dark) .flow-column {
		border-color: var(--line);
	}

	.flow-chapter {
		padding: 1.05rem 1.2rem 1.65rem;
		text-align: justify;
		text-justify: inter-word;
	}

	.flow-chapter + .flow-chapter {
		padding-top: 1.5rem;
	}

	.flow-chapter-number {
		display: inline;
		margin-right: 0.28em;
		padding: 0;
		font-family: var(--font-serif);
		font-size: 1.45em;
		font-weight: 800;
		line-height: 0;
		color: var(--color-stone-900);
		text-decoration: none;
		cursor: pointer;
	}

	.flow-chapter-number:hover,
	.flow-chapter-number:focus-visible,
	.flow-chapter-number.in-list {
		color: var(--color-accent-600);
	}

	:global(.dark) .flow-chapter-number {
		color: var(--color-stone-50);
	}

	.flow-heading {
		margin: 1.35rem 0 0.45rem;
		font-family: var(--font-sans);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.045em;
		text-transform: uppercase;
		color: var(--color-stone-500);
	}

	.flow-verse {
		display: inline;
		margin: 0;
		font-family: var(--font-serif);
		font-size: calc(1.08rem * var(--reader-font-scale, 1));
		line-height: 1.65;
		hyphens: auto;
	}

	.verse-comment-row:not(.with-comment) {
		display: contents;
	}

	.verse-comment-row.with-comment {
		display: block;
		margin-block: 0.8rem;
		text-align: left;
	}

	.verse-comment-row.with-comment .flow-verse {
		display: block;
		margin-bottom: 0.65rem;
	}

	.verse-lead {
		white-space: nowrap;
	}

	.flow-verse .verse-text {
		overflow-wrap: break-word;
		word-break: normal;
	}

	.flow-verse::after {
		content: ' ';
	}

	.flow-verse .verse-number {
		margin-right: 0.08em;
		padding-inline: 0.18em;
		font-size: 0.72em;
		font-weight: 750;
		color: var(--color-accent-700);
	}

	:global(.dark) .flow-verse .verse-number {
		color: var(--color-accent-300);
	}

	.flow-verse.highlighted {
		background-color: color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}

	.flow-reference {
		/* flow-root, not just overflow: hidden, so the floated verse number below is contained even
		   when an entry is shorter than the number's own line height. */
		display: flow-root;
		margin-bottom: 1.15rem;
		font-family: var(--font-serif);
		font-size: calc(1.08rem * var(--reader-font-scale, 1));
		line-height: 1.65;
	}

	.loading-chapter {
		padding: 0.75rem;
		text-align: center;
		color: var(--color-stone-400);
	}

	/* The verse number sits in the margin rather than on its own line above the text, matching how
	   the bible columns keep their number attached to the first word. */
	.flow-reference .verse-number {
		float: left;
		margin-top: 0.2em;
		margin-right: 0.4em;
	}

	.commentary-title {
		margin: 0 0 0.3rem;
		font-family: var(--font-sans);
		font-size: 0.8rem;
		font-weight: 650;
		color: var(--color-stone-700);
	}

	:global(.dark) .commentary-title {
		color: var(--color-stone-200);
	}

	.commentary-body :global(p) {
		margin: 0 0 0.6rem;
	}

	.commentary-body :global(p:last-child) {
		margin-bottom: 0;
	}

	.commentary-body :global(ul),
	.commentary-body :global(ol) {
		margin: 0 0 0.6rem 1.1rem;
	}

	.commentary-body :global(li + li) {
		margin-top: 0.2rem;
	}

	.commentary-body :global(blockquote) {
		margin: 0.4rem 0 0.6rem;
		padding-left: 0.7rem;
		border-left: 2px solid var(--color-stone-300);
		font-style: italic;
		color: var(--color-stone-600);
	}

	:global(.dark) .commentary-body :global(blockquote) {
		border-left-color: var(--color-stone-600);
		color: var(--color-stone-400);
	}

	/* One column on a phone: the inactive ones are hidden and every cell moves to column 1. */
	@media (max-width: 639px) {
		.license-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.flow-reader {
			grid-template-columns: minmax(0, 1fr);
			height: max(25rem, calc(100dvh - var(--header-height) - 10.5rem));
		}

		.hidden-on-mobile {
			display: none;
		}
	}

	/* The number opens the verse menu, so it needs to look and feel like a control rather than a
	   superscript: a tap target with some padding around the two digits. */
	.verse-number {
		display: inline-block;
		font-family: var(--font-sans);
		font-size: 0.7rem;
		font-weight: 700;
		vertical-align: 0.35em;
		margin-right: 0.15em;
		padding: 0.15em 0.25em;
		min-width: 1.4em;
		text-align: center;
		border-radius: 0.25rem;
		color: var(--color-accent-700);
		text-decoration: none;
		cursor: pointer;
	}

	.verse-number:hover,
	.verse-number:focus-visible {
		background-color: var(--color-stone-100);
		color: var(--color-accent-600);
	}

	:global(.dark) .verse-number:hover,
	:global(.dark) .verse-number:focus-visible {
		background-color: var(--color-stone-800);
		color: var(--color-accent-400);
	}

	:global(.dark) .verse-number {
		color: var(--color-accent-300);
	}

	/* Already saved in a verse list. Replaces the star that used to sit beside the number and break
	   the line, because a <form> is block-level content inside inline text. */
	.verse-number.in-list {
		color: var(--color-accent-500);
	}

	.verse-text {
		/* No `overflow-x` on the reader any more, so an unbreakable original-language word has to be
		   allowed to break rather than widen the page. */
		overflow-wrap: anywhere;

		/* Greek and Hebrew need their own faces; the attribute is set from the resource language. */
		&:where([lang='grc']) {
			font-family: var(--font-greek);
		}
		&:where([lang='hbo']) {
			font-family: var(--font-hebrew);
			font-size: 1.25rem;
		}
	}

	/* Room to scroll the last verses clear of the mobile study sheet. */
	@media (max-width: 639px) {
		.pb-sheet {
			padding-bottom: 72dvh;
		}
	}
</style>
