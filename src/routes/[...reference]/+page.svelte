<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, beforeNavigate, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatReference, referencePath, type VerseRef } from '$lib/bible/reference';
	import { countVerseWords, segmentsToText, splitVerseLead } from '$lib/bible/segments';
	import { spanRangeForVerse } from '$lib/bible/highlight-span';
	import { readerLocation, setJumpToVerse } from '$lib/reader-location.svelte';
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { t } from '$lib/i18n';
	import CommentBubble from '$lib/components/CommentBubble.svelte';
	import CommentToggle from '$lib/components/CommentToggle.svelte';
	import ReaderLayoutPicker from '$lib/components/ReaderLayoutPicker.svelte';
	import ReaderResourceTabs from '$lib/components/ReaderResourceTabs.svelte';
	import StudySidebar from '$lib/components/StudySidebar.svelte';
	import TranslationDialog from '$lib/components/TranslationDialog.svelte';
	import VerseMenu from '$lib/components/VerseMenu.svelte';
	import VerseText from '$lib/components/VerseText.svelte';
	import {
		MIN_READER_TRACK_FRACTION,
		normalizeReaderTracks,
		readerLayoutDefinition,
		readerLayoutSize
	} from '$lib/reader/workspace';

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

	/** The translation the commentary auto-link popover fetches verse text from: whichever Bible
	 *  translation is actually showing in a column right now, so hovering a reference in a commentary
	 *  shows the same text the reader is already reading, not some other fixed pick. */
	const primaryBibleId = $derived(
		data.columns.find((column) => column.resource.kind === 'bible')?.resource.id ?? null
	);

	function currentReaderUrl(): string {
		const path = referencePath(readerLocation.reference ?? data.reference);
		return `${path}${window.location.search}${window.location.hash}`;
	}

	function openResourceDialog(tileId: string) {
		const tile = data.workspace.tiles.find((candidate) => candidate.id === tileId);
		translationDialog?.openAt({
			action: '?/addTab',
			readerUrl: currentReaderUrl(),
			tileId,
			chosen: tile?.tabs.map((tab) => tab.resourceId) ?? []
		});
	}

	function columnForTile(tileId: string) {
		return data.columns.find((column) => column.tileId === tileId);
	}

	const TILE_AREAS = ['a', 'b', 'c', 'd'] as const;

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

	/** The address/sync anchor sits at the inner edge of the top fade, not beneath its veil. */
	const FLOW_EDGE_FADE_PX = 24;

	const layoutDefinition = $derived(readerLayoutDefinition(data.workspace.layout));
	let layoutColumns = $state(readerLayoutSize(data.workspace).columns);
	let layoutRows = $state(readerLayoutSize(data.workspace).rows);
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
		resource: { id: string; name: string },
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
			focusMenu
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

	/** Which workspace tile a reader is looking at on a phone, where only one tile fits. */
	let mobileTile = $state(0);

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

	let mobileTablist = $state<HTMLElement | undefined>();

	/**
	 * Roving focus for the mobile column tabs, matching `Menu.svelte`'s own arrow-key handling.
	 * "Automatic activation": moving focus also switches `mobileTile`, the same as a click — there
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
		if (Number.isFinite(index)) mobileTile = index;
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
		for (const stream of streamChapters) {
			for (const highlight of stream.highlights) {
				if (highlight.resourceId === null) continue;
				const column = data.columns.find(
					(candidate) => candidate.resource.id === highlight.resourceId
				);
				if (!column || column.bibleCellIndex === null) continue;

				const span = {
					from: { verse: highlight.verse, word: highlight.startWord! },
					to: { verse: highlight.endVerse, word: highlight.endWord! }
				};
				for (let verse = highlight.verse; verse <= highlight.endVerse; verse += 1) {
					const cell = stream.chapter.rows.find((row) => row.verse === verse)?.cells[
						column.bibleCellIndex
					];
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
				endVerse: verse,
				styleId: style.id,
				color: style.color,
				name: style.name,
				resourceId: null,
				startWord: null,
				endWord: null
			});
	}

	let flowColumns = $state<HTMLElement[]>([]);
	let loadingPrevious = $state(false);
	let loadingNext = $state(false);
	let activeFlowSource = 0;
	let visibleChapterKey = $state('');
	let streamSignature = '';
	let streamColumnsKey = data.columns
		.map((column) => `${column.tileId}:${column.activeTab.id}:${column.resource.id}`)
		.join(',');
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
		const columnsKey = data.columns
			.map((column) => `${column.tileId}:${column.activeTab.id}:${column.resource.id}`)
			.join(',');
		const signature = `${data.reference.book}:${data.reference.chapter}:${columnsKey}`;
		if (signature !== streamSignature) {
			streamGeneration += 1;
			const generation = streamGeneration;
			loadingPrevious = false;
			loadingNext = false;
			cancelScheduledReaderWork();
			const columnsChanged = columnsKey !== streamColumnsKey;
			const startsAtChapterTop = data.reference.verse === undefined;
			if (startsAtChapterTop) resetFlowColumnsToTop();
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
			if (startsAtChapterTop) {
				// SvelteKit reuses the inner scrolling columns across reader navigations. Reset them once
				// before replacing their contents and again after the DOM update: the first reset prevents
				// scroll anchoring from retaining the old position, while the second covers remounted columns.
				tick().then(() => {
					if (generation !== streamGeneration) return;
					resetFlowColumnsToTop();
					window.scrollTo({ top: 0, behavior: 'instant' });
				});
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

	function resetFlowColumnsToTop() {
		for (const [index, column] of flowColumns.entries()) {
			if (!column) continue;
			lastAlignedElement[index] = null;
			suppressProgrammaticFlowScroll(index);
			column.scrollTop = 0;
			updateFlowEdgeState(index, column);
		}
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
		const sourceLinkSet = data.columns[sourceIndex]?.activeTab.linkSet ?? null;
		const anchorInset = FLOW_EDGE_FADE_PX;
		updateVisibleChapter(source, anchorInset);
		const anchor = firstVisibleVerse(source);
		if (!anchor?.dataset.verseKey) return;
		if (trackAddress) scheduleAddressBarUpdate(anchor.dataset.verseKey);
		// A tab without a letter remains independent. A–E are separate groups: only currently active
		// tabs carrying the exact same letter follow the source.
		if (!sourceLinkSet) return;
		const anchorVerse = Number(anchor.dataset.verseKey.split(':').at(-1));

		for (let index = 0; index < flowColumns.length; index += 1) {
			if (index === sourceIndex || data.columns[index]?.activeTab.linkSet !== sourceLinkSet)
				continue;
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
		activeFlowSource = columnIndex;
		scheduleAddressBarUpdate(firstVisibleVerse(source)?.dataset.verseKey);
		scheduleFlowSync(columnIndex);
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
	onpointermove={onLayoutResizeMove}
	onpointerup={onLayoutResizeEnd}
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
				<ReaderLayoutPicker layout={data.workspace.layout} readerUrl={currentReaderUrl} />
			</div>

			<form bind:this={sizesForm} method="POST" action="?/setLayoutSize" use:enhance class="hidden">
				<input type="hidden" name="layout" value={data.workspace.layout} />
				<input bind:this={sizesColumnsInput} type="hidden" name="columns" />
				<input bind:this={sizesRowsInput} type="hidden" name="rows" />
			</form>

			<!-- On a phone the desktop arrangement stays intact, while this switcher selects one tile. -->
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
					aria-label="Reader-Bereiche"
					class="contents"
					onkeydown={onMobileTabKeydown}
				>
					{#each data.workspace.tiles as tile, tileIndex (tile.id)}
						{@const mobileColumn = columnForTile(tile.id)}
						<button
							type="button"
							role="tab"
							id="mobile-tab-{tileIndex}"
							aria-selected={mobileTile === tileIndex}
							aria-controls="mobile-tabpanel-{tileIndex}"
							tabindex={mobileTile === tileIndex ? 0 : -1}
							class="mobile-tab shrink-0 rounded-full px-3 py-1.5 text-sm"
							class:bg-accent-600={mobileTile === tileIndex}
							class:text-white={mobileTile === tileIndex}
							class:bg-stone-100={mobileTile !== tileIndex}
							class:dark:bg-stone-800={mobileTile !== tileIndex}
							onclick={() => (mobileTile = tileIndex)}
						>
							{mobileColumn?.resource.tabTitle ?? `Bereich ${tileIndex + 1}`}
						</button>
					{/each}
				</div>
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
						aria-labelledby={isMobileViewport ? `mobile-tab-${tileIndex}` : undefined}
						aria-label={isMobileViewport ? undefined : `Reader-Bereich ${tileIndex + 1}`}
						aria-hidden={isMobileViewport && tileIndex !== mobileTile}
					>
						<ReaderResourceTabs
							{tile}
							{tileIndex}
							tiles={data.workspace.tiles}
							resources={data.readerResources}
							readerUrl={currentReaderUrl}
							onOpenResource={openResourceDialog}
						/>
						{#if column}
							{@const columnIndex = column.index}
							<div class="tile-content">
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
								<div
									bind:this={flowColumns[columnIndex]}
									data-flow-column-index={columnIndex}
									data-resource-id={column.resource.id}
									class="flow-column"
									role="region"
									aria-label={column.resource.selectionTitle}
									onwheel={(event) => onFlowWheel(event, columnIndex)}
									ontouchstart={() => makeFlowSource(columnIndex)}
									onpointerdown={() => makeFlowSource(columnIndex)}
									onfocusin={() => makeFlowSource(columnIndex)}
									onscroll={() => onFlowScroll(columnIndex)}
								>
									{#if data.chapter.empty}
										<p class="empty-resource">{t('reader.chapterEmpty')}</p>
									{/if}
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
															class:has-highlight={mark?.color}
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
							</div>
							{#if column.resource.licenseHtml}
								<p class="tile-license">
									<strong>{column.resource.tabTitle}:</strong>
									{column.resource.licenseHtml}
								</p>
							{/if}
						{:else}
							<button type="button" class="empty-tile" onclick={() => openResourceDialog(tile.id)}>
								<svg viewBox="0 0 20 20" class="size-6" fill="currentColor" aria-hidden="true">
									<path
										d="M10.75 4a.75.75 0 0 0-1.5 0v5.25H4a.75.75 0 0 0 0 1.5h5.25V16a.75.75 0 0 0 1.5 0v-5.25H16a.75.75 0 0 0 0-1.5h-5.25V4Z"
									/>
								</svg>
								<span>Ressource öffnen</span>
							</button>
						{/if}
					</section>
				{/each}
			</div>
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

	.flow-reader {
		position: relative;
		display: grid;
		gap: 0.75rem;
		height: max(28rem, calc(100dvh - var(--header-height) - 11.5rem));
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

	.tile-license {
		max-height: 2.7rem;
		flex: none;
		overflow: auto;
		padding: 0.35rem 0.75rem;
		border-top: 1px solid var(--line);
		font-size: 0.65rem;
		line-height: 1.25;
		color: var(--color-stone-500);
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
		.flow-reader {
			grid-template-columns: minmax(0, 1fr) !important;
			grid-template-rows: minmax(0, 1fr) !important;
			grid-template-areas: 'a' !important;
			height: max(25rem, calc(100dvh - var(--header-height) - 10.5rem));
		}

		.reader-tile {
			grid-area: a !important;
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
