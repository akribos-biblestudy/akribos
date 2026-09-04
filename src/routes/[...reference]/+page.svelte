<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { beforeNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, tick, untrack } from 'svelte';
	import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { formatReference, referencePath, type VerseRef } from '$lib/bible/reference';
	import { countVerseWords, segmentsToText, splitVerseLead } from '$lib/bible/segments';
	import { spanRangeForVerse } from '$lib/bible/highlight-span';
	import { readerLocation, setJumpToVerse } from '$lib/reader-location.svelte';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { readerContentLinks } from '$lib/actions/reader-content-links';
	import { t } from '$lib/i18n';
	import CommentBubble from '$lib/components/CommentBubble.svelte';
	import CommentToggle from '$lib/components/CommentToggle.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ReaderLexiconTab from '$lib/components/ReaderLexiconTab.svelte';
	import ReaderNotesPanel from '$lib/components/ReaderNotesPanel.svelte';
	import ReaderResourceTabs from '$lib/components/ReaderResourceTabs.svelte';
	import ReaderTabSearchResults from '$lib/components/ReaderTabSearchResults.svelte';
	import ReaderTabToolbar from '$lib/components/ReaderTabToolbar.svelte';
	import TranslationDialog from '$lib/components/TranslationDialog.svelte';
	import VerseMenu from '$lib/components/VerseMenu.svelte';
	import VerseText from '$lib/components/VerseText.svelte';
	import {
		MIN_READER_TRACK_FRACTION,
		activeReaderTab,
		normalizeReaderTracks,
		readerLayoutDefinition,
		readerLayoutSize,
		setReaderTabLookup,
		setReaderTabReference,
		type ReaderTab,
		type ReaderWorkspace
	} from '$lib/reader/workspace';
	import {
		encodeReaderUrlState,
		readerActionUrl,
		readerStateFromActionData,
		readerStateFromUrl,
		readerUrl,
		type ReaderSearchQueries
	} from '$lib/reader/url-state';
	import type { ReaderTabSearchResponse } from '$lib/reader/tab-search';
	import { readerDocumentsAt, type ReaderDocumentSummary } from '$lib/reader/document-notes';

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
	let verseMenu = $state<VerseMenu | undefined>();
	let readerNotesPanel = $state<ReaderNotesPanel | undefined>();
	let translationDialog = $state<TranslationDialog | undefined>();

	/** The translation the commentary auto-link popover fetches verse text from: whichever Bible
	 *  translation is actually showing in a column right now, so hovering a reference in a commentary
	 *  shows the same text the reader is already reading, not some other fixed pick. */
	const primaryBibleId = $derived(
		data.columns.find((column) => column.resource.kind === 'bible')?.resource.id ?? null
	);

	function currentReaderUrl(reference?: VerseRef): string {
		const path = referencePath(reference ?? readerLocation.reference ?? data.reference);
		return readerUrl(path, currentReaderState());
	}

	function currentReaderState(): string {
		return readerStateFromUrl(page.url) ?? data.readerState;
	}

	function actionUrl(action: string): string {
		return readerActionUrl(action, currentReaderState());
	}

	function openResourceDialog(tileId: string, anchor: HTMLElement) {
		translationDialog?.openAt(
			{
				action: actionUrl('addTab'),
				readerUrl: currentReaderUrl(),
				tileId
			},
			anchor
		);
	}

	function replaceResourceDialog(tileId: string, tabId: string, anchor: HTMLElement) {
		const tile = data.workspace.tiles.find((candidate) => candidate.id === tileId);
		const tab = tile?.tabs.find((candidate) => candidate.id === tabId);
		if (!tile || !tab) return;
		translationDialog?.openAt(
			{
				action: actionUrl('replaceTabResource'),
				readerUrl: currentReaderUrl(tab.reference),
				tileId,
				tabId
			},
			anchor
		);
	}

	function columnForTile(tileId: string) {
		return data.columns.find((column) => column.tileId === tileId);
	}

	const TILE_AREAS = ['a', 'b', 'c', 'd'] as const;

	function commentaryAt(
		referenceResources: (typeof data.columns)[number]['initialChapter']['referenceResources'],
		resourceId: string,
		verse: number
	) {
		return referenceResources.commentaries.filter(
			(entry) => entry.resourceId === resourceId && (entry.verseStart ?? 1) === verse
		);
	}

	function crossReferencesAt(
		referenceResources: (typeof data.columns)[number]['initialChapter']['referenceResources'],
		resourceId: string,
		verse: number
	) {
		return referenceResources.crossReferences.filter(
			(entry) => entry.resourceId === resourceId && entry.fromVerse === verse
		);
	}

	/** The address/sync anchor sits at the inner edge of the top fade, not beneath its veil. */
	const FLOW_EDGE_FADE_PX = 24;

	const layoutDefinition = $derived(readerLayoutDefinition(data.workspace.layout));
	let layoutColumns = $state(untrack(() => readerLayoutSize(data.workspace).columns));
	let layoutRows = $state(untrack(() => readerLayoutSize(data.workspace).rows));
	let layoutSizeKey = $state('');
	const columnTrack = $derived(
		layoutColumns.map((fraction) => `minmax(0, ${fraction}fr)`).join(' ')
	);
	const rowTrack = $derived(layoutRows.map((fraction) => `minmax(0, ${fraction}fr)`).join(' '));
	const columnBoundaries = $derived(trackBoundaries(layoutColumns));
	const rowBoundaries = $derived(trackBoundaries(layoutRows));

	$effect(() => {
		const size = readerLayoutSize(data.workspace);
		const key = `${data.workspace.layout}:${size.columns.join(',')}:${size.rows.join(',')}`;
		if (key === layoutSizeKey) return;
		layoutSizeKey = key;
		layoutColumns = size.columns;
		layoutRows = size.rows;
	});

	function trackBoundaries(fractions: number[]): { percent: number; offsetRem: number }[] {
		const gapCount = fractions.length - 1;
		let cumulative = 0;
		return fractions.slice(0, -1).map((fraction, index) => {
			cumulative += fraction;
			return {
				percent: cumulative * 100,
				offsetRem: 0.75 * (index + 0.5 - gapCount * cumulative)
			};
		});
	}

	let flowReader = $state<HTMLElement>();
	let resizeAxis: 'columns' | 'rows' | null = null;
	let resizeBoundaryIndex: number | null = null;
	let resizeStartPosition = 0;
	let resizeStartWidths: number[] = [];
	let resizeAvailableSize = 0;
	let sizesForm = $state<HTMLFormElement | undefined>();
	let sizesColumnsInput = $state<HTMLInputElement | undefined>();
	let sizesRowsInput = $state<HTMLInputElement | undefined>();

	function clampBoundary(widths: number[], boundaryIndex: number, nextLeft: number): number[] {
		const next = [...widths];
		const left = next[boundaryIndex] ?? 0;
		const right = next[boundaryIndex + 1] ?? 0;
		const pairTotal = left + right;
		const clampedLeft = Math.max(
			MIN_READER_TRACK_FRACTION,
			Math.min(pairTotal - MIN_READER_TRACK_FRACTION, nextLeft)
		);
		next[boundaryIndex] = clampedLeft;
		next[boundaryIndex + 1] = pairTotal - clampedLeft;
		return next;
	}

	function startLayoutResize(event: PointerEvent, axis: 'columns' | 'rows', boundaryIndex: number) {
		if (!flowReader) return;
		resizeAxis = axis;
		resizeBoundaryIndex = boundaryIndex;
		resizeStartPosition = axis === 'columns' ? event.clientX : event.clientY;
		resizeStartWidths = axis === 'columns' ? [...layoutColumns] : [...layoutRows];
		const style = getComputedStyle(flowReader);
		const rect = flowReader.getBoundingClientRect();
		resizeAvailableSize =
			(axis === 'columns' ? rect.width : rect.height) -
			parseFloat(axis === 'columns' ? style.columnGap : style.rowGap) *
				(resizeStartWidths.length - 1);
		(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
	}

	/** Bound to `<svelte:window>`, not the handle itself: a pointer that leaves the handle mid-drag
	 *  (fast movement, or the handle itself moving out from under the pointer) must keep resizing. */
	function onLayoutResizeMove(event: PointerEvent) {
		if (!resizeAxis || resizeBoundaryIndex === null || resizeAvailableSize <= 0) return;
		const position = resizeAxis === 'columns' ? event.clientX : event.clientY;
		const deltaFraction = (position - resizeStartPosition) / resizeAvailableSize;
		const resized = clampBoundary(
			resizeStartWidths,
			resizeBoundaryIndex,
			(resizeStartWidths[resizeBoundaryIndex] ?? 0) + deltaFraction
		);
		if (resizeAxis === 'columns') layoutColumns = resized;
		else layoutRows = resized;
	}

	function onLayoutResizeEnd() {
		if (!resizeAxis) return;
		resizeAxis = null;
		resizeBoundaryIndex = null;
		commitLayoutSize();
	}

	/** Keyboard equivalent of a pointer drag: `ArrowLeft`/`ArrowRight` nudge one boundary a couple of
	 *  percentage points and commit immediately, since there is no separate "release" event. */
	function onResizeHandleKeydown(
		event: KeyboardEvent,
		axis: 'columns' | 'rows',
		boundaryIndex: number
	) {
		const step = 0.02;
		const negative = axis === 'columns' ? 'ArrowLeft' : 'ArrowUp';
		const positive = axis === 'columns' ? 'ArrowRight' : 'ArrowDown';
		const current = axis === 'columns' ? layoutColumns : layoutRows;
		if (event.key === negative) {
			event.preventDefault();
			const resized = clampBoundary(current, boundaryIndex, current[boundaryIndex]! - step);
			if (axis === 'columns') layoutColumns = resized;
			else layoutRows = resized;
			commitLayoutSize();
		} else if (event.key === positive) {
			event.preventDefault();
			const resized = clampBoundary(current, boundaryIndex, current[boundaryIndex]! + step);
			if (axis === 'columns') layoutColumns = resized;
			else layoutRows = resized;
			commitLayoutSize();
		}
	}

	function commitLayoutSize() {
		if (!sizesForm || !sizesColumnsInput || !sizesRowsInput) return;
		layoutColumns = normalizeReaderTracks(layoutColumns, layoutDefinition.columns);
		layoutRows = normalizeReaderTracks(layoutRows, layoutDefinition.rows);
		sizesColumnsInput.value = layoutColumns.join(',');
		sizesRowsInput.value = layoutRows.join(',');
		sizesForm.requestSubmit();
	}

	/** Opens the whole-verse menu (verse-number click, or a selection covering the entire verse). */
	function openVerseMenuForWholeVerse(
		anchor: HTMLElement,
		book: number,
		chapter: number,
		verse: number,
		verseEnd: number | null,
		segments: Parameters<typeof segmentsToText>[0],
		resource: { id: string; name: string; kind: 'bible' },
		documents: ReaderDocumentSummary[],
		tileId: string,
		tabId: string,
		focusMenu = true
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
			() => openVerseComment(book, chapter, verse, resource.id),
			() => openReaderNotesPanel(anchor, book, chapter, verse, resource, documents, tileId, tabId),
			focusMenu
		);
	}

	function openReaderNotesPanel(
		anchor: HTMLElement,
		book: number,
		chapter: number,
		verse: number,
		resource: { id: string; name: string; kind: 'bible' },
		documents: ReaderDocumentSummary[],
		tileId: string,
		tabId: string
	): void {
		const reference = { book, chapter, verse };
		// Capture every tab's latest visible reference directly. The address-bar update is debounced
		// while scrolling, so merely copying `page.url` here could lose the final few milliseconds of
		// reading state when a verse action immediately opens the notes workspace.
		let returnTo = currentReaderUrl(reference);
		try {
			const workspace = setReaderTabReference(
				workspaceAtVisibleReferences(),
				tileId,
				tabId,
				reference
			);
			returnTo = readerUrl(
				referencePath(reference),
				encodeReaderUrlState(workspace, currentSearchQueries())
			);
		} catch {
			// `currentReaderUrl` is already a valid canonical fallback when a pathological workspace is
			// too large to encode. Opening the private notes panel must still remain available.
		}
		void readerNotesPanel?.openForVerse(anchor, {
			reference: formatReference(reference, { style: 'full' }),
			passage: formatReference(reference),
			returnTo,
			resource: { id: resource.id, title: resource.name },
			documents
		});
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
		resource: { id: string; name: string; kind: 'bible' },
		documents: ReaderDocumentSummary[],
		tileId: string,
		tabId: string
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
			resource,
			documents,
			tileId,
			tabId
		);
	}

	/** Which workspace tile owns the selected resource tab on a phone. */
	let mobileTile = $state(
		untrack(() => {
			const focusedIndex = data.workspace.tiles.findIndex(
				(tile) => tile.id === data.workspace.focusedTileId
			);
			return Math.max(0, focusedIndex);
		})
	);

	/** Keep the flat mobile selection on a real resource when layouts merge or a tile becomes empty. */
	$effect(() => {
		const tiles = data.workspace.tiles;
		const lastTile = Math.max(0, tiles.length - 1);
		if (mobileTile > lastTile) mobileTile = lastTile;
		if (activeReaderTab(tiles[mobileTile]!)) return;

		const focusedIndex = tiles.findIndex(
			(tile) => tile.id === data.workspace.focusedTileId && activeReaderTab(tile)
		);
		const fallbackIndex = focusedIndex >= 0 ? focusedIndex : tiles.findIndex(activeReaderTab);
		if (fallbackIndex >= 0) mobileTile = fallbackIndex;
	});

	/**
	 * Whether the phone-width layout (one column visible, switched by tabs) is actually in effect —
	 * not merely "the reader happens to be on a phone", since a desktop window can be narrowed too.
	 *
	 * `mobileTile` only means something once this is true: on desktop every tile is visible at
	 * once, so gating `role="tabpanel"`/`aria-hidden` purely on `columnIndex !== mobileColumn` would
	 * incorrectly hide every non-selected tile from assistive tech there too, even though a sighted
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

	/**
	 * Strong's number currently under the mouse. Cleared again on pointer leave; see
	 * `VerseText.svelte` for why this uses pointer events rather than `mouseenter`/`mouseleave`.
	 */
	let hoverStrong = $state<string | null>(null);

	async function openLexiconForLookup(
		columnIndex: number,
		lookup: string,
		reference?: VerseRef,
		word?: string
	): Promise<void> {
		const column = data.columns[columnIndex];
		if (!column || !lookup.trim()) return;
		const form = new FormData();
		form.set('tileId', column.tileId);
		form.set('tabId', column.activeTab.id);
		form.set('lookup', lookup);
		form.set(
			'currentReference',
			formatReference(reference ?? visibleReferences[columnIndex] ?? column.activeTab.reference)
		);
		if (word) form.set('word', word);
		const response = await fetch(actionUrl('openLexiconTab'), {
			method: 'POST',
			body: form,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		if (!response.ok) return;
		const result = deserialize(await response.text());
		if (result.type !== 'success') return;
		const state = readerStateFromActionData(result.data);
		if (!state) return;
		await goto(readerUrl(window.location.pathname, state), {
			replaceState: true,
			invalidateAll: true,
			noScroll: true
		});
		if (
			window.matchMedia('(max-width: 639px)').matches &&
			result.data &&
			typeof result.data === 'object' &&
			'tileId' in result.data &&
			typeof result.data.tileId === 'string'
		) {
			const targetIndex = data.workspace.tiles.findIndex((tile) => tile.id === result.data?.tileId);
			if (targetIndex >= 0) mobileTile = targetIndex;
		}
	}

	async function lookupInLexicon(columnIndex: number, lookup: string): Promise<void> {
		const column = data.columns[columnIndex];
		if (!column || column.resource.kind !== 'lexicon' || !lookup.trim()) return;
		const form = new FormData();
		form.set('tileId', column.tileId);
		form.set('tabId', column.activeTab.id);
		form.set('lookup', lookup);
		const response = await fetch(actionUrl('setTabLookup'), {
			method: 'POST',
			body: form,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		if (!response.ok) return;
		const result = deserialize(await response.text());
		if (result.type !== 'success') return;
		const state = readerStateFromActionData(result.data);
		if (!state) return;
		await goto(readerUrl(window.location.pathname, state), {
			replaceState: true,
			invalidateAll: true,
			noScroll: true
		});
	}

	function openStrong(
		strong: string,
		word: string,
		verse: number,
		book = data.reference.book,
		chapter = data.reference.chapter,
		sourceColumnIndex = activeFlowSource
	) {
		void openLexiconForLookup(sourceColumnIndex, strong, { book, chapter, verse }, word);
	}

	type StreamChapter = (typeof data.columns)[number]['initialChapter'];
	type ColumnStream = {
		chapters: StreamChapter[];
		loadingPrevious: boolean;
		loadingNext: boolean;
		generation: number;
	};

	function columnStreamFromInitial(column: (typeof data.columns)[number]): ColumnStream {
		return {
			chapters: [column.initialChapter],
			loadingPrevious: false,
			loadingNext: false,
			generation: 0
		};
	}

	function initialColumnStreams(): ColumnStream[] {
		return data.columns.map(columnStreamFromInitial);
	}

	let columnStreams = $state<ColumnStream[]>(initialColumnStreams());
	let visibleReferences = $state<VerseRef[]>(
		untrack(() => data.columns.map((column) => ({ ...column.activeTab.reference })))
	);
	let visibleReferenceTabKeys = $state<string[]>(
		untrack(() => data.columns.map((column) => columnReferenceKey(column)))
	);

	function columnReferenceKey(column: (typeof data.columns)[number]): string {
		const reference = column.activeTab.reference;
		return `${column.activeTab.id}:${column.resource.id}:${reference.book}:${reference.chapter}:${reference.verse ?? ''}`;
	}

	function columnStreamKey(column: (typeof data.columns)[number]): string {
		return `${column.activeTab.id}:${column.resource.id}`;
	}

	function sameReference(left: VerseRef | undefined, right: VerseRef): boolean {
		return (
			left?.book === right.book &&
			left.chapter === right.chapter &&
			(left.verse ?? null) === (right.verse ?? null)
		);
	}

	function toolbarReference(column: (typeof data.columns)[number]): VerseRef {
		return visibleReferenceTabKeys[column.index] === columnReferenceKey(column)
			? (visibleReferences[column.index] ?? column.activeTab.reference)
			: column.activeTab.reference;
	}

	function tabActivationReference(tileId: string, tab: ReaderTab): VerseRef {
		const currentColumn = data.columns.find((column) => column.tileId === tileId);
		if (currentColumn?.activeTab.id === tab.id) return toolbarReference(currentColumn);
		if (!tab.linkSet) return tab.reference;

		const visiblePeer = data.columns.find(
			(column) => column.tileId !== tileId && column.activeTab.linkSet === tab.linkSet
		);
		return visiblePeer ? toolbarReference(visiblePeer) : tab.reference;
	}

	function lexiconStudyContext(column: (typeof data.columns)[number]) {
		const stored = column.activeTab.studyContext;
		if (stored) {
			const resource = data.readerResources.find(
				(candidate) => candidate.id === stored.sourceResourceId && candidate.kind === 'bible'
			);
			if (resource) return { resource, reference: stored.reference, word: stored.word };
		}

		const linkedBible = data.columns.find(
			(candidate) =>
				candidate.resource.kind === 'bible' &&
				column.activeTab.linkSet !== null &&
				candidate.activeTab.linkSet === column.activeTab.linkSet
		);
		const source =
			linkedBible ?? data.columns.find((candidate) => candidate.resource.kind === 'bible');
		return source
			? { resource: source.resource, reference: toolbarReference(source), word: null }
			: { resource: null, reference: null, word: null };
	}
	type TabSearchState = {
		resourceId: string;
		query: string;
		book: number | null;
		loading: boolean;
		result: ReaderTabSearchResponse | null;
		error: string | null;
	};
	let tabSearches = $state<Record<string, TabSearchState>>({});
	const tabSearchRequests = new SvelteMap<string, AbortController>();
	let restoredReaderState = $state('');

	function currentSearchQueries(): ReaderSearchQueries {
		return Object.fromEntries(
			Object.entries(tabSearches).map(([tabId, state]) => [tabId, state.query])
		);
	}

	function workspaceAtVisibleReferences(): ReaderWorkspace {
		let workspace = data.workspace as ReaderWorkspace;
		for (const column of data.columns) {
			const reference = toolbarReference(column);
			workspace = setReaderTabReference(workspace, column.tileId, column.activeTab.id, reference);
		}
		return workspace;
	}

	function syncReaderUrl(path = window.location.pathname): void {
		try {
			const state = encodeReaderUrlState(workspaceAtVisibleReferences(), currentSearchQueries());
			const next = readerUrl(path, state);
			if (`${window.location.pathname}${window.location.search}` !== next) {
				replaceState(next, page.state);
			}
		} catch (error) {
			console.error(error);
		}
	}

	function tabSearchFor(column: (typeof data.columns)[number]): TabSearchState | null {
		const state = tabSearches[column.activeTab.id];
		return state?.resourceId === column.resource.id ? state : null;
	}

	function clearTabSearch(tabId: string): void {
		tabSearchRequests.get(tabId)?.abort();
		tabSearchRequests.delete(tabId);
		if (!(tabId in tabSearches)) return;
		const next = { ...tabSearches };
		delete next[tabId];
		tabSearches = next;
		syncReaderUrl();
	}

	async function runTabSearch(
		columnIndex: number,
		rawQuery: string,
		pageNumber = 1,
		requestedBook?: number | null
	): Promise<void> {
		const column = data.columns[columnIndex];
		const query = rawQuery.trim();
		if (!column || !query) return;
		const tabId = column.activeTab.id;
		const resourceId = column.resource.id;
		const previous = tabSearches[tabId];
		const sameSearch = previous?.resourceId === resourceId && previous.query === query;
		const book =
			requestedBook === undefined && sameSearch ? previous.book : (requestedBook ?? null);

		tabSearchRequests.get(tabId)?.abort();
		const controller = new AbortController();
		tabSearchRequests.set(tabId, controller);
		tabSearches = {
			...tabSearches,
			[tabId]: {
				resourceId,
				query,
				book,
				loading: true,
				result: sameSearch && previous.book === book ? previous.result : null,
				error: null
			}
		};
		syncReaderUrl();

		try {
			const params = new SvelteURLSearchParams({
				resource: resourceId,
				q: query,
				page: String(Math.max(1, pageNumber))
			});
			if (book !== null) params.set('book', String(book));
			const response = await fetch(`/api/reader/search?${params}`, { signal: controller.signal });
			if (!response.ok) throw new Error('Die Suche konnte nicht geladen werden.');
			const result = (await response.json()) as ReaderTabSearchResponse;
			if (tabSearchRequests.get(tabId) !== controller) return;
			tabSearches = {
				...tabSearches,
				[tabId]: { resourceId, query, book, loading: false, result, error: null }
			};
		} catch (searchError) {
			if (controller.signal.aborted || tabSearchRequests.get(tabId) !== controller) return;
			tabSearches = {
				...tabSearches,
				[tabId]: {
					resourceId,
					query,
					book,
					loading: false,
					result: sameSearch && previous.book === book ? (previous.result ?? null) : null,
					error:
						searchError instanceof Error
							? searchError.message
							: 'Die Suche konnte nicht geladen werden.'
				}
			};
		} finally {
			if (tabSearchRequests.get(tabId) === controller) tabSearchRequests.delete(tabId);
		}
	}

	$effect(() => {
		const state = data.readerState;
		if (state === restoredReaderState) return;
		restoredReaderState = state;
		for (const request of tabSearchRequests.values()) request.abort();
		tabSearchRequests.clear();
		tabSearches = {};
		for (const column of data.columns) {
			const query = data.searchQueries[column.activeTab.id];
			if (query) void runTabSearch(column.index, query);
		}
	});

	async function openTabSearchReference(columnIndex: number, reference: VerseRef): Promise<void> {
		const column = data.columns[columnIndex];
		if (!column) return;
		const form = new FormData();
		form.set('tileId', column.tileId);
		form.set('tabId', column.activeTab.id);
		form.set('reference', formatReference(reference));
		const response = await fetch(actionUrl('setTabReference'), {
			method: 'POST',
			body: form,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		if (!response.ok) return;
		const result = deserialize(await response.text());
		if (result.type !== 'success') return;
		const state = readerStateFromActionData(result.data);
		if (!state) return;
		clearTabSearch(column.activeTab.id);
		await goto(readerUrl(referencePath(reference), state), { invalidateAll: true, noScroll: true });
	}

	function contextualReferenceUrl(columnIndex: number, reference: VerseRef): string {
		const column = data.columns[columnIndex];
		if (!column) return referencePath(reference);
		const workspace = setReaderTabReference(
			workspaceAtVisibleReferences(),
			column.tileId,
			column.activeTab.id,
			reference
		);
		return readerUrl(
			referencePath(reference),
			encodeReaderUrlState(workspace, currentSearchQueries())
		);
	}

	function contextualLexiconLookupUrl(columnIndex: number, lookup: string): string {
		const column = data.columns[columnIndex];
		if (!column || column.resource.kind !== 'lexicon') return window.location.href;
		const workspace = setReaderTabLookup(
			workspaceAtVisibleReferences(),
			column.tileId,
			column.activeTab.id,
			lookup
		);
		return readerUrl(
			window.location.pathname,
			encodeReaderUrlState(workspace, currentSearchQueries())
		);
	}

	$effect(() => {
		const resourcesByTab = new Map(
			data.workspace.tiles.flatMap((tile) =>
				tile.tabs.map((tab) => [tab.id, tab.resourceId] as const)
			)
		);
		for (const [tabId, state] of Object.entries(tabSearches)) {
			if (resourcesByTab.get(tabId) !== state.resourceId) clearTabSearch(tabId);
		}
	});
	const allStreamChapters = $derived(columnStreams.flatMap((stream) => stream.chapters));
	const marks = $derived(
		new SvelteSet(
			allStreamChapters.flatMap((stream) =>
				stream.markedVerses.map(
					(mark) =>
						`${formatReference({
							book: stream.reference.book,
							chapter: stream.reference.chapter,
							verse: mark.verse
						})}:${mark.listId}`
				)
			)
		)
	);

	function isInAnyList(book: number, chapter: number, verse: number): boolean {
		const prefix = `${formatReference({ book, chapter, verse })}:`;
		return [...marks].some((key) => key.startsWith(prefix));
	}
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
			allStreamChapters.flatMap((stream) =>
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

	/**
	 * Translation-specific coloured sections, split back into one painted range per verse and keyed
	 * like `data-verse-key` plus the resource id.
	 *
	 * A section is stored as its two endpoints, so a section running from verse 29 into verse 31 has
	 * to be spread over the verses in between here — each one contributing whatever `spanRangeForVerse`
	 * says, measured against that verse's own length. The section's own endpoints travel along, so the
	 * menu can still recognise "this exact section is already coloured".
	 */
	const partialHighlightsByKey = $derived.by(() => {
		const grouped: Record<
			string,
			{
				start: number;
				end: number;
				color: string;
				styleId: string;
				startVerse: number;
				endVerse: number;
				startWord: number;
				endWord: number;
			}[]
		> = {};
		for (const stream of allStreamChapters) {
			for (const highlight of stream.highlights) {
				if (highlight.resourceId === null) continue;
				if (stream.resourceId !== highlight.resourceId) continue;

				const span = {
					from: { verse: highlight.verse, word: highlight.startWord! },
					to: { verse: highlight.endVerse, word: highlight.endWord! }
				};
				for (let verse = highlight.verse; verse <= highlight.endVerse; verse += 1) {
					const cell = stream.chapter.rows.find((row) => row.verse === verse)?.cells[0];
					if (!cell) continue;
					const range = spanRangeForVerse(span, verse, countVerseWords(cell.segments));
					if (!range) continue;

					const key = `${stream.reference.book}:${stream.reference.chapter}:${verse}:${highlight.resourceId}`;
					(grouped[key] ??= []).push({
						...range,
						color: highlight.color,
						styleId: highlight.styleId,
						startVerse: highlight.verse,
						endVerse: highlight.endVerse,
						startWord: highlight.startWord!,
						endWord: highlight.endWord!
					});
				}
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
		const streams = allStreamChapters.filter(
			(candidate) => candidate.reference.book === book && candidate.reference.chapter === chapter
		);
		if (streams.length === 0) return;

		const style = styleId
			? data.highlightStyles.find((candidate) => candidate.id === styleId)
			: undefined;
		for (const stream of streams) {
			stream.highlights = stream.highlights.filter(
				(highlight) => !(highlight.verse === verse && highlight.resourceId === null)
			);
			if (style)
				stream.highlights.push({
					verse,
					endVerse: verse,
					styleId: style.id,
					color: style.color,
					name: style.name,
					resourceId: null,
					startWord: null,
					endWord: null
				});
		}
	}

	let flowColumns = $state<HTMLElement[]>([]);
	let activeFlowSource = 0;
	let streamSignature = '';
	let activeStreamKeys: string[] = [];
	const streamsByTab = new SvelteMap<string, ColumnStream>();
	const referencesByTab = new SvelteMap<string, VerseRef>();
	const scrollTopsByTab = new SvelteMap<string, number>();
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

	$effect(() => {
		const columnsKey = data.columns
			.map(
				(column) =>
					`${column.tileId}:${column.activeTab.id}:${column.resource.id}:${column.activeTab.reference.book}:${column.activeTab.reference.chapter}:${column.activeTab.reference.verse ?? ''}`
			)
			.join(',');
		if (columnsKey === streamSignature) return;
		cancelScheduledReaderWork();
		streamSignature = columnsKey;

		// Keep streams and scroll positions with their tabs, not with the temporary visible column
		// index. Switching one tile can then reveal its already loaded tab without rebuilding unrelated
		// Bible/commentary columns or requesting their next chapters again.
		for (const [index, key] of activeStreamKeys.entries()) {
			const stream = columnStreams[index];
			const reference = visibleReferences[index];
			const flowColumn = flowColumns[index];
			if (stream) streamsByTab.set(key, stream);
			if (reference) referencesByTab.set(key, { ...reference });
			if (flowColumn) scrollTopsByTab.set(key, flowColumn.scrollTop);
		}

		const nextStreamKeys = data.columns.map(columnStreamKey);
		const reusedStreams: boolean[] = [];
		columnStreams = data.columns.map((column, index) => {
			const key = nextStreamKeys[index]!;
			const cached = streamsByTab.get(key);
			const containsTarget = cached?.chapters.some(
				(chapter) =>
					chapter.reference.book === column.activeTab.reference.book &&
					chapter.reference.chapter === column.activeTab.reference.chapter
			);
			reusedStreams[index] = Boolean(cached && containsTarget);
			const stream = cached && containsTarget ? cached : columnStreamFromInitial(column);
			stream.loadingPrevious = false;
			stream.loadingNext = false;
			streamsByTab.set(key, stream);
			return stream;
		});
		activeStreamKeys = nextStreamKeys;
		visibleReferences = data.columns.map((column) => ({ ...column.activeTab.reference }));
		visibleReferenceTabKeys = data.columns.map((column) => columnReferenceKey(column));
		activeFlowSource = Math.max(
			0,
			data.columns.findIndex((column) => column.tileId === data.workspace.focusedTileId)
		);
		readerLocation.reference = visibleReferences[activeFlowSource] ?? data.reference;
		tick().then(() => {
			flowColumns = data.columns
				.map((_, index) =>
					document.querySelector<HTMLElement>(`.flow-column[data-flow-column-index="${index}"]`)
				)
				.filter((element): element is HTMLElement => element !== null);
			for (const [index, column] of data.columns.entries()) {
				if (column.resource.kind === 'lexicon') continue;
				const key = nextStreamKeys[index]!;
				const flowColumn = flowColumns[index];
				const reference = column.activeTab.reference;
				const previousReference = referencesByTab.get(key);
				if (flowColumn && sameReference(previousReference, reference)) {
					const scrollTop = scrollTopsByTab.get(key);
					if (scrollTop !== undefined) {
						suppressProgrammaticFlowScroll(index);
						flowColumn.scrollTop = scrollTop;
					}
					updateFlowEdgeState(index, flowColumn);
				} else if (flowColumn) {
					lastAlignedElement[index] = null;
					suppressProgrammaticFlowScroll(index);
					flowColumn.scrollTop = 0;
					updateFlowEdgeState(index, flowColumn);
				}
				if (!sameReference(previousReference, reference) && reference.verse) {
					scrollColumnToVerse(index, reference.book, reference.chapter, reference.verse, true);
				}
				referencesByTab.set(key, { ...reference });
				if (!reusedStreams[index]) void loadStreamNext(index);
			}
		});
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

	async function fetchStreamChapter(
		columnIndex: number,
		reference: { book: number; chapter: number }
	) {
		const resourceId = data.columns[columnIndex]?.resource.id;
		const response = await fetch(
			`/api/reader/${reference.book}/${reference.chapter}?resource=${encodeURIComponent(resourceId ?? '')}`
		);
		if (!response.ok) throw new Error(`Kapitel konnte nicht geladen werden (${response.status})`);
		return (await response.json()) as StreamChapter;
	}

	async function loadStreamPrevious(columnIndex: number) {
		if (data.columns[columnIndex]?.resource.kind === 'lexicon') return;
		const stream = columnStreams[columnIndex];
		const column = flowColumns[columnIndex];
		const reference = stream?.chapters[0]?.navigation.previous;
		if (!stream || !column || !reference || stream.loadingPrevious) return;
		const generation = stream.generation;
		stream.loadingPrevious = true;
		try {
			const chapter = await fetchStreamChapter(columnIndex, reference);
			if (generation !== stream.generation) return;
			// Capture immediately before the mutation, not before the request: touch momentum may continue
			// while the chapter is in flight and that genuine user movement must not be rolled back.
			const oldHeight = column.scrollHeight;
			// Keep the pre-mutation positions as well as the heights. Browsers may apply CSS scroll
			// anchoring as soon as the prepended chapter reaches the DOM and increase `scrollTop` on their
			// own. Reading `column.scrollTop` after `tick()` and adding the height delta to that value would
			// then compensate twice — the race behind the occasional multi-verse/chapter jump on the first
			// quick wheel or touch scroll after a reload.
			const oldScrollTop = column.scrollTop;
			stream.chapters.unshift(chapter);
			await tick();
			if (generation !== stream.generation) return;
			suppressProgrammaticFlowScroll(columnIndex);
			column.scrollTop = oldScrollTop + column.scrollHeight - oldHeight;
		} finally {
			if (generation === stream.generation) stream.loadingPrevious = false;
		}
	}

	async function loadStreamNext(columnIndex: number) {
		if (data.columns[columnIndex]?.resource.kind === 'lexicon') return;
		const stream = columnStreams[columnIndex];
		const reference = stream?.chapters.at(-1)?.navigation.next;
		if (!stream || !reference || stream.loadingNext) return;
		const generation = stream.generation;
		stream.loadingNext = true;
		try {
			const chapter = await fetchStreamChapter(columnIndex, reference);
			if (generation !== stream.generation) return;
			stream.chapters.push(chapter);
			await tick();
			if (generation !== stream.generation) return;
			syncFlowColumns(activeFlowSource);
		} finally {
			if (generation === stream.generation) stream.loadingNext = false;
		}
	}

	function updateVisibleChapter(columnIndex: number, source: HTMLElement, inset: number) {
		const top = source.getBoundingClientRect().top + inset;
		const chapters = [...source.querySelectorAll<HTMLElement>('[data-chapter-key]')];
		const chapter =
			chapters.findLast((section) => section.getBoundingClientRect().top <= top) ?? chapters[0];
		if (!chapter?.dataset.chapterKey) return;
		const [book, chapterNumber] = chapter.dataset.chapterKey.split(':').map(Number);
		if (book && chapterNumber) visibleReferences[columnIndex] = { book, chapter: chapterNumber };
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
	function scheduleAddressBarUpdate(columnIndex: number, verseKey: string | undefined) {
		if (!verseKey) return;
		const [book, chapter, verse] = verseKey.split(':').map(Number);
		if (!book || !chapter || !verse) return;

		// The search field follows this immediately — it already only re-syncs while unfocused (see
		// `SiteHeader.svelte`), so there is no risk of clobbering something the reader is typing. Only
		// the actual address bar write stays debounced, since rewriting `history` on every settle would
		// be needless churn.
		const reference = { book, chapter, verse };
		visibleReferences[columnIndex] = reference;
		readerLocation.reference = reference;

		if (addressBarTimer) clearTimeout(addressBarTimer);
		addressBarTimer = setTimeout(() => {
			addressBarTimer = undefined;
			const column = data.columns[columnIndex];
			if (!column) return;
			const form = new FormData();
			form.set('tileId', column.tileId);
			form.set('tabId', column.activeTab.id);
			form.set('reference', formatReference(reference));
			const request = fetch(actionUrl('setTabReference'), {
				method: 'POST',
				body: form,
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
			});
			const path = referencePath(reference);
			syncReaderUrl(path);
			void request.then(async (response) => {
				if (!response.ok) return;
				const result = deserialize(await response.text());
				if (result.type !== 'success') return;
				const state = readerStateFromActionData(result.data);
				if (state) replaceState(readerUrl(path, state), page.state);
			});
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
		for (const stream of columnStreams) {
			stream.generation += 1;
			stream.loadingPrevious = false;
			stream.loadingNext = false;
		}
		cancelScheduledReaderWork();
	});

	onDestroy(cancelScheduledReaderWork);
	onDestroy(() => {
		for (const request of tabSearchRequests.values()) request.abort();
		tabSearchRequests.clear();
	});

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
		const verses = [...source.querySelectorAll<HTMLElement>('[data-verse-key]')];
		return (
			verses.find((verse) => verse.getBoundingClientRect().bottom > sourceTop) ?? verses.at(-1)
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
	function scrollColumnToVerse(
		columnIndex: number,
		book: number,
		chapter: number,
		verse: number,
		allowHighlightedFallback = false
	): boolean {
		const key = `${book}:${chapter}:${verse}`;
		const column = flowColumns[columnIndex];
		const target =
			(column && findVerseElement(column, key, verse)) ??
			(allowHighlightedFallback
				? column?.querySelector<HTMLElement>('.flow-verse.highlighted')
				: null);
		if (!column || !target) return false;
		lastAlignedElement[columnIndex] = target;
		const next =
			column.scrollTop +
			target.getBoundingClientRect().top -
			column.getBoundingClientRect().top -
			FLOW_EDGE_FADE_PX;
		suppressProgrammaticFlowScroll(columnIndex);
		column.scrollTop = next;
		visibleReferences[columnIndex] = { book, chapter, verse };
		return true;
	}

	function scrollToVerse(book: number, chapter: number, verse: number): boolean {
		const found = scrollColumnToVerse(activeFlowSource, book, chapter, verse);
		if (found) scheduleAddressBarUpdate(activeFlowSource, `${book}:${chapter}:${verse}`);
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
		if (data.columns[sourceIndex]?.resource.kind === 'lexicon') return;
		const source = flowColumns[sourceIndex];
		if (!source) return;
		const sourceLinkSet = data.columns[sourceIndex]?.activeTab.linkSet ?? null;
		const anchorInset = FLOW_EDGE_FADE_PX;
		const anchor = firstVisibleVerse(source);
		if (!anchor?.dataset.verseKey) return;
		const anchorVerse = Number(anchor.dataset.verseKey.split(':')[2]);
		if (trackAddress) scheduleAddressBarUpdate(sourceIndex, anchor.dataset.verseKey);
		// A tab without a letter remains independent. A–E are separate groups: only currently active
		// tabs carrying the exact same letter follow the source.
		if (!sourceLinkSet) return;
		for (let index = 0; index < flowColumns.length; index += 1) {
			if (
				index === sourceIndex ||
				data.columns[index]?.resource.kind === 'lexicon' ||
				data.columns[index]?.activeTab.linkSet !== sourceLinkSet
			)
				continue;
			const column = flowColumns[index];
			const target = column && findVerseElement(column, anchor.dataset.verseKey, anchorVerse);
			if (!column) continue;
			if (!target) {
				const [book, chapter] = anchor.dataset.verseKey.split(':').map(Number);
				if (book && chapter) {
					void resetColumnStream(index, { book, chapter, verse: anchorVerse });
				}
				continue;
			}

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
			const [book, chapter] = anchor.dataset.verseKey.split(':').map(Number);
			if (trackAddress && book && chapter) {
				visibleReferences[index] = { book, chapter, verse: anchorVerse };
			}
		}
	}

	async function resetColumnStream(columnIndex: number, reference: VerseRef): Promise<void> {
		const stream = columnStreams[columnIndex];
		if (!stream) return;
		stream.generation += 1;
		const generation = stream.generation;
		stream.loadingPrevious = false;
		stream.loadingNext = false;
		const chapter = await fetchStreamChapter(columnIndex, reference);
		if (generation !== stream.generation) return;
		stream.chapters = [chapter];
		visibleReferences[columnIndex] = { ...reference };
		await tick();
		if (generation !== stream.generation) return;
		const column = flowColumns[columnIndex];
		if (column) {
			suppressProgrammaticFlowScroll(columnIndex);
			column.scrollTop = 0;
		}
		scrollColumnToVerse(columnIndex, reference.book, reference.chapter, reference.verse ?? 1);
		void loadStreamNext(columnIndex);
	}

	function makeFlowSource(columnIndex: number) {
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
		if (data.columns[columnIndex]?.resource.kind === 'lexicon') return;
		const source = flowColumns[columnIndex];
		if (!source) return;
		updateFlowEdgeState(columnIndex, source);
		if (suppressedFlowColumns.has(columnIndex)) return;
		activeFlowSource = columnIndex;
		updateVisibleChapter(columnIndex, source, FLOW_EDGE_FADE_PX);
		scheduleAddressBarUpdate(columnIndex, firstVisibleVerse(source)?.dataset.verseKey);
		scheduleFlowSync(columnIndex);
		if (source.scrollTop < 500) void loadStreamPrevious(columnIndex);
		if (source.scrollHeight - source.scrollTop - source.clientHeight < 900)
			void loadStreamNext(columnIndex);
	}

	function updateFlowEdgeState(columnIndex: number, source: HTMLElement) {
		flowHasContentAbove[columnIndex] = source.scrollTop > 4;
		flowHasContentBelow[columnIndex] =
			source.scrollHeight - source.scrollTop - source.clientHeight > 4;
	}

	function firstCellVerse(stream: StreamChapter, bibleCellIndex: number | null): number | null {
		if (bibleCellIndex === null) return null;
		for (const row of stream.chapter.rows) {
			const cell = row.cells[bibleCellIndex];
			if (cell) return cell.verse;
		}
		return null;
	}
</script>

<svelte:window onpointermove={onLayoutResizeMove} onpointerup={onLayoutResizeEnd} />

<svelte:head>
	<meta
		name="description"
		content="{data.fullTitle} in {data.columns
			.map((column) => column.resource.tabTitle)
			.join(', ')} — mit Strong-Nummern, Grammatik und Wörterbuch."
	/>
</svelte:head>

<div class="min-h-0 flex-1">
	<!-- No `overflow-x` here: it would make this a scroll container, and every `sticky` inside it
	     would then stick to a box that never scrolls vertically. The grid's `minmax(0, 1fr)` tracks
	     cannot overflow anyway. -->
	<main>
		<div class="mx-auto max-w-[var(--content-max-width)] sm:px-3 sm:py-3">
			<form
				bind:this={sizesForm}
				method="POST"
				action={actionUrl('setLayoutSize')}
				use:enhance
				class="hidden"
			>
				<input type="hidden" name="layout" value={data.workspace.layout} />
				<input bind:this={sizesColumnsInput} type="hidden" name="columns" />
				<input bind:this={sizesRowsInput} type="hidden" name="rows" />
			</form>

			<!-- On a phone all workspace resources form one flat tab strip. The desktop tile arrangement
			     stays intact underneath, but it is deliberately not exposed as another UI hierarchy. -->
			<div
				class="sticky top-[var(--header-height)] z-10 overflow-hidden border-b
				       border-stone-200 bg-white/95 backdrop-blur sm:hidden
				       dark:border-stone-800 dark:bg-stone-950/95"
				data-testid="mobile-tab-bar"
			>
				<ReaderResourceTabs
					tile={(data.workspace.tiles[mobileTile] ?? data.workspace.tiles[0])!}
					tileIndex={mobileTile}
					tiles={data.workspace.tiles}
					resources={data.readerResources}
					readerUrl={currentReaderUrl}
					currentReference={data.reference}
					referenceForTab={tabActivationReference}
					onOpenResource={openResourceDialog}
					mobile
					selectedTileIndex={mobileTile}
					onSelectTile={(tileIndex) => (mobileTile = tileIndex)}
				/>
			</div>

			<div
				bind:this={flowReader}
				class="flow-reader"
				style:grid-template-columns={columnTrack}
				style:grid-template-rows={rowTrack}
				style:grid-template-areas={layoutDefinition.areas}
				style:--flow-edge-fade-height={`${FLOW_EDGE_FADE_PX}px`}
				data-testid="flow-reader"
				data-layout={data.workspace.layout}
			>
				<!-- Splitters overlay the gaps and resize the persisted column/row tracks. -->
				<div class="pointer-events-none absolute inset-0 z-10 hidden sm:block">
					{#each columnBoundaries as boundary, boundaryIndex (boundaryIndex)}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							role="separator"
							aria-orientation="vertical"
							aria-label={t('reader.resizeColumns')}
							aria-valuenow={Math.round(layoutColumns[boundaryIndex]! * 100)}
							aria-valuemin={Math.round(MIN_READER_TRACK_FRACTION * 100)}
							aria-valuemax={Math.round(
								(1 - MIN_READER_TRACK_FRACTION * (layoutColumns.length - 1)) * 100
							)}
							tabindex="0"
							class="layout-resize-handle vertical"
							style="left: calc({boundary.percent}% {boundary.offsetRem >= 0 ? '+' : '-'} {Math.abs(
								boundary.offsetRem
							)}rem)"
							onpointerdown={(event) => startLayoutResize(event, 'columns', boundaryIndex)}
							onkeydown={(event) => onResizeHandleKeydown(event, 'columns', boundaryIndex)}
						>
							<span aria-hidden="true"><i></i><i></i><i></i></span>
						</div>
					{/each}
					{#each rowBoundaries as boundary, boundaryIndex (boundaryIndex)}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							role="separator"
							aria-orientation="horizontal"
							aria-label="Zeilenhöhe ändern"
							aria-valuenow={Math.round(layoutRows[boundaryIndex]! * 100)}
							aria-valuemin={Math.round(MIN_READER_TRACK_FRACTION * 100)}
							aria-valuemax={Math.round(
								(1 - MIN_READER_TRACK_FRACTION * (layoutRows.length - 1)) * 100
							)}
							tabindex="0"
							class="layout-resize-handle horizontal"
							class:left-half={layoutDefinition.horizontalDivider === 'left'}
							class:right-half={layoutDefinition.horizontalDivider === 'right'}
							style="top: calc({boundary.percent}% {boundary.offsetRem >= 0 ? '+' : '-'} {Math.abs(
								boundary.offsetRem
							)}rem)"
							onpointerdown={(event) => startLayoutResize(event, 'rows', boundaryIndex)}
							onkeydown={(event) => onResizeHandleKeydown(event, 'rows', boundaryIndex)}
						>
							<span aria-hidden="true"><i></i><i></i><i></i></span>
						</div>
					{/each}
				</div>

				{#each data.workspace.tiles as tile, tileIndex (tile.id)}
					{@const column = columnForTile(tile.id)}
					<section
						class="reader-tile"
						class:hidden-on-mobile={tileIndex !== mobileTile}
						style:grid-area={TILE_AREAS[tileIndex]}
						role={isMobileViewport ? 'tabpanel' : 'region'}
						id={isMobileViewport ? `mobile-tabpanel-${tileIndex}` : undefined}
						aria-labelledby={isMobileViewport && tile.activeTabId
							? `mobile-resource-tab-${tile.activeTabId}`
							: undefined}
						aria-label={isMobileViewport ? undefined : `Reader-Bereich ${tileIndex + 1}`}
						aria-hidden={isMobileViewport && tileIndex !== mobileTile}
					>
						<div class="hidden sm:contents">
							<ReaderResourceTabs
								{tile}
								{tileIndex}
								tiles={data.workspace.tiles}
								resources={data.readerResources}
								readerUrl={currentReaderUrl}
								currentReference={column ? toolbarReference(column) : data.reference}
								referenceForTab={tabActivationReference}
								onOpenResource={openResourceDialog}
							/>
						</div>
						{#if column}
							{@const columnIndex = column.index}
							{@const columnStream = columnStreams[columnIndex]}
							{@const activeStream = columnStream?.chapters.find(
								(stream) =>
									stream.reference.book === column.activeTab.reference.book &&
									stream.reference.chapter === column.activeTab.reference.chapter
							)}
							{@const tabSearch = tabSearchFor(column)}
							{@const studyContext = lexiconStudyContext(column)}
							<ReaderTabToolbar
								tileId={tile.id}
								{tileIndex}
								tab={column.activeTab}
								resource={column.resource}
								reference={toolbarReference(column)}
								searchQuery={tabSearch?.query ?? null}
								studyResourceTitle={studyContext.resource?.abbrev ?? null}
								onOpenResource={replaceResourceDialog}
								onSearch={(query) =>
									column.resource.kind === 'lexicon'
										? void lookupInLexicon(columnIndex, query)
										: void runTabSearch(columnIndex, query)}
								onClearSearch={() => clearTabSearch(column.activeTab.id)}
							/>
							<div class="tile-content">
								{#if column.resource.kind === 'lexicon'}
									<ReaderLexiconTab
										lookup={column.activeTab.lookup}
										entry={column.lexiconEntry}
										resourceTitle={column.resource.selectionTitle}
										lexiconId={column.resource.id}
										sourceResource={studyContext.resource}
										studyReference={studyContext.reference}
										studyWord={studyContext.word}
										onLookup={(lookup) => void lookupInLexicon(columnIndex, lookup)}
										onOpenReference={(reference) =>
											void openTabSearchReference(columnIndex, reference)}
										lookupHref={(lookup) => contextualLexiconLookupUrl(columnIndex, lookup)}
										referenceHref={(reference) => contextualReferenceUrl(columnIndex, reference)}
									/>
								{/if}
								{#if tabSearch}
									<ReaderTabSearchResults
										query={tabSearch.query}
										result={tabSearch.result}
										loading={tabSearch.loading}
										error={tabSearch.error}
										resourceTitle={column.resource.selectionTitle}
										language={column.resource.language}
										direction={column.resource.direction}
										onClose={() => clearTabSearch(column.activeTab.id)}
										onSearch={(query, pageNumber, book) =>
											void runTabSearch(columnIndex, query, pageNumber, book)}
										onOpenReference={(reference) =>
											void openTabSearchReference(columnIndex, reference)}
										onStrongClick={(strong, word, reference) =>
											openStrong(
												strong,
												word,
												reference.verse ?? 1,
												reference.book,
												reference.chapter,
												columnIndex
											)}
									/>
								{:else}
									<div class="pointer-events-none absolute inset-0 z-5">
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
								{/if}
								<div
									bind:this={flowColumns[columnIndex]}
									data-flow-column-index={columnIndex}
									data-resource-id={column.resource.id}
									class="flow-column"
									class:search-hidden={tabSearch !== null || column.resource.kind === 'lexicon'}
									role="region"
									aria-label={column.resource.selectionTitle}
									aria-hidden={tabSearch !== null || column.resource.kind === 'lexicon'}
									onwheel={(event) => onFlowWheel(event, columnIndex)}
									ontouchstart={() => makeFlowSource(columnIndex)}
									onpointerdown={() => makeFlowSource(columnIndex)}
									onfocusin={() => makeFlowSource(columnIndex)}
									onscroll={() => onFlowScroll(columnIndex)}
								>
									{#if activeStream?.chapter.empty}
										<p class="empty-resource">{t('reader.chapterEmpty')}</p>
									{/if}
									{#if columnStream?.loadingPrevious}
										<p class="loading-chapter" aria-live="polite">…</p>
									{/if}
									{#each columnStream?.chapters ?? [] as stream (`${stream.reference.book}:${stream.reference.chapter}`)}
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
													{@const attachedDocuments = readerDocumentsAt(stream.documentAnchors, {
														book: stream.reference.book,
														chapter: stream.reference.chapter,
														verse: cell.verse,
														verseEnd: cell.verseEnd
													})}
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
															class:highlighted={stream.reference.book ===
																column.activeTab.reference.book &&
																stream.reference.chapter === column.activeTab.reference.chapter &&
																column.activeTab.reference.verse !== undefined &&
																cell.verse <= column.activeTab.reference.verse &&
																(cell.verseEnd ?? cell.verse) >= column.activeTab.reference.verse}
															class:has-highlight={mark?.color}
															style:background-color={mark?.color}
														>
															<span class="verse-lead">
																{#if cell.verse === firstVerse}
																	<a
																		class="flow-chapter-number"
																		class:in-list={isInAnyList(
																			stream.reference.book,
																			stream.reference.chapter,
																			cell.verse
																		)}
																		title={stream.fullTitle}
																		href={contextualReferenceUrl(columnIndex, {
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
																				{
																					id: column.resource.id,
																					name: column.resource.tabTitle,
																					kind: 'bible'
																				},
																				attachedDocuments,
																				column.tileId,
																				column.activeTab.id
																			)}
																	>
																		{stream.reference.chapter}
																	</a>
																{/if}
																{#if cell.verse !== 1 || cell.verse !== firstVerse}
																	<a
																		class="verse-number"
																		class:in-list={isInAnyList(
																			stream.reference.book,
																			stream.reference.chapter,
																			cell.verse
																		)}
																		href={contextualReferenceUrl(columnIndex, {
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
																				{
																					id: column.resource.id,
																					name: column.resource.tabTitle,
																					kind: 'bible'
																				},
																				attachedDocuments,
																				column.tileId,
																				column.activeTab.id
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
																				stream.reference.chapter,
																				columnIndex
																			)}
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
																			stream.reference.chapter,
																			columnIndex
																		)}
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
															{#if data.user && attachedDocuments.length > 0}
																<button
																	type="button"
																	class="reader-note-indicator"
																	title={t('documents.reader.open', {
																		reference: formatReference({
																			book: stream.reference.book,
																			chapter: stream.reference.chapter,
																			verse: cell.verse
																		})
																	})}
																	aria-label={t('documents.reader.open', {
																		reference: formatReference({
																			book: stream.reference.book,
																			chapter: stream.reference.chapter,
																			verse: cell.verse
																		})
																	})}
																	onclick={(event) =>
																		openReaderNotesPanel(
																			event.currentTarget,
																			stream.reference.book,
																			stream.reference.chapter,
																			cell.verse,
																			{
																				id: column.resource.id,
																				name: column.resource.tabTitle,
																				kind: 'bible'
																			},
																			attachedDocuments,
																			column.tileId,
																			column.activeTab.id
																		)}
																>
																	<Icon name="file-text" class="size-3.5" />
																	<span>{attachedDocuments.length}</span>
																</button>
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
															...entries.map(
																(entry) => entry.verseEnd ?? entry.verseStart ?? row.verse
															)
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
																{#if entry.title}<h3 class="commentary-title">
																		{entry.title}
																	</h3>{/if}
																<!-- Imported commentary is reduced to an allow-list by its parser. -->
																<div
																	class="commentary-body"
																	use:verseHoverPopover={{ bibleId: primaryBibleId }}
																	use:readerContentLinks={{
																		onReference: (reference) =>
																			void openTabSearchReference(columnIndex, reference),
																		referenceHref: (reference) =>
																			contextualReferenceUrl(columnIndex, reference)
																	}}
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
																	class="verse-ref mr-1 text-xs text-accent-700 dark:text-accent-300"
																	data-book={target.toBook}
																	data-chapter={target.toChapter}
																	data-verse={target.toVerse}
																	href={contextualReferenceUrl(columnIndex, {
																		book: target.toBook,
																		chapter: target.toChapter,
																		verse: target.toVerse
																	})}
																	onclick={(event) => {
																		if (
																			event.button === 0 &&
																			!event.metaKey &&
																			!event.ctrlKey &&
																			!event.shiftKey &&
																			!event.altKey
																		) {
																			event.preventDefault();
																			void openTabSearchReference(columnIndex, {
																				book: target.toBook,
																				chapter: target.toChapter,
																				verse: target.toVerse
																			});
																		}
																	}}
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
									{#if columnStream?.loadingNext}
										<p class="loading-chapter" aria-live="polite">…</p>
									{/if}
								</div>
							</div>
						{:else}
							<button
								type="button"
								class="empty-tile"
								onclick={(event) => openResourceDialog(tile.id, event.currentTarget)}
							>
								<Icon name="plus" class="size-6" />
								<span>Ressource öffnen</span>
							</button>
						{/if}
					</section>
				{/each}
			</div>
		</div>
	</main>
</div>

<!-- One menu for the whole chapter, opened with whichever verse number was clicked. -->
<VerseMenu
	bind:this={verseMenu}
	lists={data.lists}
	signedIn={data.user !== null}
	{marks}
	highlightStyles={data.highlightStyles}
/>

<!-- One owner-only panel for all contextual document indicators and verse-menu actions. -->
<ReaderNotesPanel bind:this={readerNotesPanel} />

<!-- One dialog for the whole page, opened for whichever column was clicked. -->
<TranslationDialog
	bind:this={translationDialog}
	resources={data.readerResources}
	label={t('reader.chooseTranslation')}
/>

<style>
	/* Straddles the boundary halfway down the reading area. Only the handle itself takes pointer
	   events, so the transparent overlay around it never blocks text selection or scrolling. */
	.layout-resize-handle {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		touch-action: none;
		pointer-events: auto;
	}

	.layout-resize-handle.vertical {
		top: 50%;
		width: 18px;
		height: 3.25rem;
		margin-left: -9px;
		transform: translateY(-50%);
		cursor: col-resize;
	}

	.layout-resize-handle.horizontal {
		left: 50%;
		width: 3.25rem;
		height: 18px;
		margin-top: -9px;
		transform: translateX(-50%);
		cursor: row-resize;
	}

	.layout-resize-handle.horizontal.left-half {
		left: 25%;
	}

	.layout-resize-handle.horizontal.right-half {
		left: 75%;
	}

	.layout-resize-handle span {
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

	.layout-resize-handle.horizontal span {
		width: 1.7rem;
		height: 0.75rem;
		flex-direction: row;
	}

	.layout-resize-handle i {
		display: block;
		width: 2px;
		height: 2px;
		border-radius: 999px;
		background: currentColor;
	}

	.layout-resize-handle:hover,
	.layout-resize-handle:focus-visible {
		background: color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}

	.layout-resize-handle:hover span,
	.layout-resize-handle:focus-visible span {
		border-color: var(--color-accent-500);
		color: var(--color-accent-600);
	}

	.layout-resize-handle:focus-visible {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 1px;
	}

	:global(.dark) .layout-resize-handle span {
		border-color: var(--color-stone-600);
		background: var(--surface-raised);
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
		color: var(--color-stone-500);
	}

	@media (min-width: 640px) and (max-width: 1280px), (update: slow), (monochrome) {
		.layout-resize-handle span {
			width: 1rem;
			height: 2.25rem;
			border-width: 2px;
			border-color: var(--color-stone-500);
			color: var(--color-stone-700);
			box-shadow: none;
		}

		.layout-resize-handle.horizontal span {
			width: 2.25rem;
			height: 1rem;
		}
	}

	.flow-reader {
		position: relative;
		display: grid;
		gap: 0.75rem;
		height: max(28rem, calc(100dvh - var(--header-height) - 1.5rem));
		overflow: hidden;
		background: transparent;
	}

	.reader-tile {
		display: flex;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: 0.75rem;
		background: var(--surface);
		box-shadow: var(--shadow-soft);
	}

	.tile-content {
		position: relative;
		min-width: 0;
		min-height: 0;
		flex: 1;
		overflow: hidden;
	}

	:global(.dark) .flow-reader {
		background: transparent;
	}

	.flow-column {
		height: 100%;
		min-width: 0;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		scrollbar-width: none;
		background: transparent;
	}

	.flow-column::-webkit-scrollbar {
		display: none;
	}
	.flow-column.search-hidden {
		visibility: hidden;
		pointer-events: none;
	}

	/* These veils live above the scrolling content but below the splitter, so text fades softly while
	   card borders and the resize control remain crisp. */
	.flow-edge-fade {
		position: absolute;
		right: 0;
		left: 0;
		height: var(--flow-edge-fade-height);
		opacity: 0;
		transition: opacity 140ms ease;
	}

	.flow-edge-fade.top {
		top: 0;
		background: linear-gradient(
			to bottom,
			var(--surface) 0%,
			var(--surface) 42%,
			color-mix(in oklab, var(--surface) 96%, transparent) 68%,
			transparent 100%
		);
	}

	.flow-edge-fade.bottom {
		bottom: 0;
		background: linear-gradient(
			to top,
			var(--surface) 0%,
			var(--surface) 42%,
			color-mix(in oklab, var(--surface) 96%, transparent) 68%,
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

	.empty-tile {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: var(--color-stone-400);
		font-size: 0.8rem;
	}

	.empty-tile:hover {
		color: var(--color-accent-600);
	}

	.empty-resource {
		margin: 1rem;
		padding: 1rem;
		border-radius: 0.5rem;
		background: var(--color-stone-50);
		color: var(--color-stone-500);
		font-size: 0.8rem;
	}

	:global(.dark) .empty-resource {
		background: var(--color-stone-900);
		color: var(--color-stone-300);
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
		font-size: var(--reader-text-size, 1.08rem);
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

	.reader-note-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.12rem;
		margin-inline-start: 0.28em;
		padding: 0.08em 0.28em;
		border: 1px solid color-mix(in oklab, var(--color-accent-500) 36%, transparent);
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-accent-100) 62%, transparent);
		color: var(--color-accent-700);
		font-family: var(--font-sans);
		font-size: 0.62em;
		font-weight: 750;
		line-height: 1.25;
		vertical-align: 0.12em;
	}

	.reader-note-indicator:hover,
	.reader-note-indicator:focus-visible {
		border-color: var(--color-accent-500);
		background: var(--color-accent-100);
	}

	:global(.dark) .reader-note-indicator {
		background: color-mix(in oklab, var(--color-accent-900) 55%, transparent);
		color: var(--color-accent-300);
	}

	:global(.dark) .flow-verse .verse-number {
		color: var(--color-accent-300);
	}

	.flow-verse.highlighted {
		background-color: color-mix(in oklab, var(--color-accent-500) 12%, transparent);
	}

	/* A whole-verse highlight paints a light pastel background regardless of theme, so its text must
	   stay dark ink rather than follow the dark-mode body color, which would turn light-on-light. */
	.flow-verse.has-highlight {
		color: oklch(0.28 0.02 90);
	}

	.flow-reference {
		/* flow-root, not just overflow: hidden, so the floated verse number below is contained even
		   when an entry is shorter than the number's own line height. */
		display: flow-root;
		margin-bottom: 1.15rem;
		font-family: var(--font-serif);
		font-size: var(--reader-text-size, 1.08rem);
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
		.flow-reader {
			grid-template-columns: minmax(0, 1fr) !important;
			grid-template-rows: minmax(0, 1fr) !important;
			grid-template-areas: 'a' !important;
			height: max(25rem, calc(100dvh - var(--header-height) - 2.65rem - 2px));
		}

		.reader-tile {
			grid-area: a !important;
			border-right: 0;
			border-bottom: 0;
			border-left: 0;
			border-radius: 0;
			box-shadow: none;
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
</style>
