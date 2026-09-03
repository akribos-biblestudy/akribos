/**
 * Pure reader-workspace model. It deliberately has no browser or server dependencies so the same
 * validation and mutations can be used by form actions, SSR and focused unit tests.
 */

import { isReferenceInCanon, type VerseRef } from '$lib/bible/reference';

export const READER_LAYOUTS = [
	'single',
	'columns-2',
	'columns-3',
	'columns-4',
	'rows-2',
	'left-full',
	'right-full',
	'grid-4'
] as const;

export type ReaderLayout = (typeof READER_LAYOUTS)[number];

export const READER_LINK_SETS = ['A', 'B', 'C', 'D', 'E'] as const;
export type ReaderLinkSet = (typeof READER_LINK_SETS)[number] | null;

export type ReaderTab = {
	id: string;
	resourceId: string;
	linkSet: ReaderLinkSet;
	reference: VerseRef;
	/** Current dictionary locator for lexicon resources; scripture resources leave this empty. */
	lookup: string | null;
};

export type ReaderTile = {
	id: string;
	tabs: ReaderTab[];
	activeTabId: string | null;
};

export type ReaderLayoutSize = {
	columns: number[];
	rows: number[];
};

export type ReaderWorkspace = {
	version: 1;
	layout: ReaderLayout;
	tiles: ReaderTile[];
	/** The tile whose active tab owns the canonical reader URL. */
	focusedTileId: string;
	layoutSizes: Partial<Record<ReaderLayout, ReaderLayoutSize>>;
};

export type ReaderLayoutDefinition = {
	id: ReaderLayout;
	label: string;
	description: string;
	columns: number;
	rows: number;
	tileCount: number;
	areas: string;
	horizontalDivider: 'all' | 'left' | 'right' | null;
};

export const READER_LAYOUT_DEFINITIONS: readonly ReaderLayoutDefinition[] = [
	{
		id: 'single',
		label: 'Eine Kachel',
		description: 'Eine Ressource in voller Größe',
		columns: 1,
		rows: 1,
		tileCount: 1,
		areas: '"a"',
		horizontalDivider: null
	},
	{
		id: 'columns-2',
		label: 'Zwei Spalten',
		description: 'Zwei Kacheln nebeneinander',
		columns: 2,
		rows: 1,
		tileCount: 2,
		areas: '"a b"',
		horizontalDivider: null
	},
	{
		id: 'columns-3',
		label: 'Drei Spalten',
		description: 'Drei Kacheln nebeneinander',
		columns: 3,
		rows: 1,
		tileCount: 3,
		areas: '"a b c"',
		horizontalDivider: null
	},
	{
		id: 'columns-4',
		label: 'Vier Spalten',
		description: 'Vier Kacheln nebeneinander',
		columns: 4,
		rows: 1,
		tileCount: 4,
		areas: '"a b c d"',
		horizontalDivider: null
	},
	{
		id: 'rows-2',
		label: 'Zwei Zeilen',
		description: 'Zwei Kacheln untereinander',
		columns: 1,
		rows: 2,
		tileCount: 2,
		areas: '"a" "b"',
		horizontalDivider: 'all'
	},
	{
		id: 'left-full',
		label: 'Links groß',
		description: 'Links volle Höhe, rechts zwei Kacheln',
		columns: 2,
		rows: 2,
		tileCount: 3,
		areas: '"a b" "a c"',
		horizontalDivider: 'right'
	},
	{
		id: 'right-full',
		label: 'Rechts groß',
		description: 'Links zwei Kacheln, rechts volle Höhe',
		columns: 2,
		rows: 2,
		tileCount: 3,
		areas: '"a c" "b c"',
		horizontalDivider: 'left'
	},
	{
		id: 'grid-4',
		label: 'Vier Kacheln',
		description: 'Zwei Spalten und zwei Zeilen',
		columns: 2,
		rows: 2,
		tileCount: 4,
		areas: '"a b" "c d"',
		horizontalDivider: 'all'
	}
];

/** A misuse guard, not a UI limit. A workspace can still hold far more resources than are visible. */
export const MAX_READER_TABS = 64;
export const MIN_READER_TRACK_FRACTION = 0.12;
export const DEFAULT_READER_REFERENCE: VerseRef = { book: 43, chapter: 1 };

const LAYOUT_BY_ID = new Map(
	READER_LAYOUT_DEFINITIONS.map((definition) => [definition.id, definition])
);

export function readerLayoutDefinition(layout: ReaderLayout): ReaderLayoutDefinition {
	return LAYOUT_BY_ID.get(layout) ?? READER_LAYOUT_DEFINITIONS[0]!;
}

export function isReaderLayout(value: unknown): value is ReaderLayout {
	return typeof value === 'string' && READER_LAYOUTS.includes(value as ReaderLayout);
}

export function isReaderLinkSet(value: unknown): value is ReaderLinkSet {
	return value === null || READER_LINK_SETS.includes(value as Exclude<ReaderLinkSet, null>);
}

export function activeReaderTab(tile: ReaderTile): ReaderTab | null {
	return tile.tabs.find((tab) => tab.id === tile.activeTabId) ?? tile.tabs[0] ?? null;
}

export function activeResourceIds(workspace: ReaderWorkspace): string[] {
	return workspace.tiles.flatMap((tile) => {
		const active = activeReaderTab(tile);
		return active ? [active.resourceId] : [];
	});
}

export function allResourceIds(workspace: ReaderWorkspace): string[] {
	return workspace.tiles.flatMap((tile) => tile.tabs.map((tab) => tab.resourceId));
}

/**
 * Converts the old side-by-side column preference without losing the fifth entry: the first four
 * become visible tiles and every surplus entry becomes another tab in the last tile.
 */
export function workspaceFromColumns(
	resourceIds: readonly string[],
	reference: VerseRef = DEFAULT_READER_REFERENCE
): ReaderWorkspace {
	const ids = resourceIds.slice(0, MAX_READER_TABS);
	const visibleCount = Math.max(1, Math.min(4, ids.length));
	const layout: ReaderLayout =
		visibleCount === 1 ? 'single' : (`columns-${visibleCount}` as ReaderLayout);
	const tiles: ReaderTile[] = Array.from({ length: visibleCount }, (_unused, index) => ({
		id: `tile-${index + 1}`,
		tabs: [],
		activeTabId: null
	}));

	ids.forEach((resourceId, index) => {
		const tileIndex = Math.min(index, visibleCount - 1);
		const tab: ReaderTab = {
			id: `tab-${index + 1}`,
			resourceId,
			// The old reader linked every visible column. A is the lossless equivalent.
			linkSet: 'A',
			reference: { ...reference },
			lookup: null
		};
		tiles[tileIndex]!.tabs.push(tab);
		tiles[tileIndex]!.activeTabId = tab.id;
	});

	return { version: 1, layout, tiles, focusedTileId: tiles[0]!.id, layoutSizes: {} };
}

/**
 * Treats persisted data as untrusted. Invalid resources and duplicate ids disappear, while duplicate
 * resources intentionally remain valid: Logos permits two copies, and merging layouts must be lossless.
 */
export function normalizeReaderWorkspace(
	value: unknown,
	availableResourceIds: readonly string[],
	fallbackResourceIds: readonly string[] = [],
	fallbackReference: VerseRef = DEFAULT_READER_REFERENCE
): ReaderWorkspace {
	const known = new Set(availableResourceIds);
	if (!isObject(value) || value.version !== 1 || !isReaderLayout(value.layout)) {
		return workspaceFromColumns(
			fallbackResourceIds.filter((id) => known.has(id)),
			fallbackReference
		);
	}

	const definition = readerLayoutDefinition(value.layout);
	const rawTiles = Array.isArray(value.tiles) ? value.tiles : [];
	const usedTileIds = new Set<string>();
	const usedTabIds = new Set<string>();
	let tabCount = 0;
	const tiles: ReaderTile[] = [];

	for (let tileIndex = 0; tileIndex < definition.tileCount; tileIndex += 1) {
		const rawTile = isObject(rawTiles[tileIndex]) ? rawTiles[tileIndex] : {};
		const tileId = uniquePersistedId(rawTile.id, `tile-${tileIndex + 1}`, usedTileIds);
		const rawTabs = Array.isArray(rawTile.tabs) ? rawTile.tabs : [];
		const tabs: ReaderTab[] = [];

		for (const rawTab of rawTabs) {
			if (tabCount >= MAX_READER_TABS || !isObject(rawTab)) break;
			if (typeof rawTab.resourceId !== 'string' || !known.has(rawTab.resourceId)) continue;
			const id = uniquePersistedId(rawTab.id, `tab-${tabCount + 1}`, usedTabIds);
			tabs.push({
				id,
				resourceId: rawTab.resourceId,
				linkSet: isReaderLinkSet(rawTab.linkSet) ? rawTab.linkSet : 'A',
				reference: normalizeTabReference(rawTab.reference, fallbackReference),
				lookup: normalizeTabLookup(rawTab.lookup)
			});
			tabCount += 1;
		}

		const wantedActive = typeof rawTile.activeTabId === 'string' ? rawTile.activeTabId : null;
		tiles.push({
			id: tileId,
			tabs,
			activeTabId: tabs.some((tab) => tab.id === wantedActive)
				? wantedActive
				: (tabs[0]?.id ?? null)
		});
	}

	// Old/corrupt data may contain more tiles than its layout. Preserve their valid tabs in the final
	// visible tile rather than silently discarding books or commentaries.
	const finalTile = tiles.at(-1)!;
	for (let tileIndex = definition.tileCount; tileIndex < rawTiles.length; tileIndex += 1) {
		const rawTile = rawTiles[tileIndex];
		if (!isObject(rawTile) || !Array.isArray(rawTile.tabs)) continue;
		for (const rawTab of rawTile.tabs) {
			if (tabCount >= MAX_READER_TABS || !isObject(rawTab)) break;
			if (typeof rawTab.resourceId !== 'string' || !known.has(rawTab.resourceId)) continue;
			const id = uniquePersistedId(rawTab.id, `tab-${tabCount + 1}`, usedTabIds);
			finalTile.tabs.push({
				id,
				resourceId: rawTab.resourceId,
				linkSet: isReaderLinkSet(rawTab.linkSet) ? rawTab.linkSet : 'A',
				reference: normalizeTabReference(rawTab.reference, fallbackReference),
				lookup: normalizeTabLookup(rawTab.lookup)
			});
			tabCount += 1;
		}
	}
	if (!finalTile.activeTabId) finalTile.activeTabId = finalTile.tabs[0]?.id ?? null;

	if (tabCount === 0) {
		const fallback = fallbackResourceIds.find((id) => known.has(id)) ?? availableResourceIds[0];
		if (fallback && tiles[0]) {
			tiles[0].tabs = [
				{
					id: 'tab-1',
					resourceId: fallback,
					linkSet: 'A',
					reference: { ...fallbackReference },
					lookup: null
				}
			];
			tiles[0].activeTabId = 'tab-1';
		}
	}
	const wantedFocusedTileId = typeof value.focusedTileId === 'string' ? value.focusedTileId : null;
	const focusedTileId =
		tiles.find((tile) => tile.id === wantedFocusedTileId && activeReaderTab(tile))?.id ??
		tiles.find((tile) => activeReaderTab(tile))?.id ??
		tiles[0]!.id;

	return {
		version: 1,
		layout: value.layout,
		tiles,
		focusedTileId,
		layoutSizes: normalizeLayoutSizes(value.layoutSizes)
	};
}

export function changeReaderLayout(
	workspace: ReaderWorkspace,
	layout: ReaderLayout,
	createId: () => string
): ReaderWorkspace {
	if (workspace.layout === layout) return cloneWorkspace(workspace);

	const next = cloneWorkspace(workspace);
	const tileCount = readerLayoutDefinition(layout).tileCount;
	if (tileCount > next.tiles.length) {
		while (next.tiles.length < tileCount) {
			// Spread inactive tabs into newly visible tiles before leaving a genuinely empty tile.
			const donor = next.tiles.find((tile) => tile.tabs.length > 1);
			const moved = donor?.tabs.pop();
			if (donor && donor.activeTabId === moved?.id)
				donor.activeTabId = donor.tabs.at(-1)?.id ?? null;
			next.tiles.push({
				id: createId(),
				tabs: moved ? [moved] : [],
				activeTabId: moved?.id ?? null
			});
		}
	} else if (tileCount < next.tiles.length) {
		const kept = next.tiles.slice(0, tileCount);
		const destination = kept.at(-1)!;
		for (const removed of next.tiles.slice(tileCount)) destination.tabs.push(...removed.tabs);
		if (!destination.activeTabId) destination.activeTabId = destination.tabs[0]?.id ?? null;
		next.tiles = kept;
	}
	next.layout = layout;
	if (!next.tiles.some((tile) => tile.id === next.focusedTileId && activeReaderTab(tile))) {
		next.focusedTileId = next.tiles.find((tile) => activeReaderTab(tile))?.id ?? next.tiles[0]!.id;
	}
	return next;
}

export function addReaderTab(
	workspace: ReaderWorkspace,
	tileId: string,
	resourceId: string,
	createId: () => string
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	if (allResourceIds(next).length >= MAX_READER_TABS) return next;
	const tile = next.tiles.find((item) => item.id === tileId);
	if (!tile) return next;
	const current = activeReaderTab(tile);
	const tab: ReaderTab = {
		id: createId(),
		resourceId,
		linkSet: current?.linkSet ?? 'A',
		reference: { ...(current?.reference ?? DEFAULT_READER_REFERENCE) },
		lookup: null
	};
	tile.tabs.push(tab);
	tile.activeTabId = tab.id;
	next.focusedTileId = tile.id;
	return next;
}

export function activateReaderTab(
	workspace: ReaderWorkspace,
	tileId: string,
	tabId: string
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const tile = next.tiles.find((item) => item.id === tileId);
	if (tile?.tabs.some((tab) => tab.id === tabId)) {
		tile.activeTabId = tabId;
		next.focusedTileId = tile.id;
	}
	return next;
}

export function closeReaderTab(
	workspace: ReaderWorkspace,
	tileId: string,
	tabId: string
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const tile = next.tiles.find((item) => item.id === tileId);
	if (!tile) return next;
	const index = tile.tabs.findIndex((tab) => tab.id === tabId);
	if (index === -1) return next;
	tile.tabs.splice(index, 1);
	if (tile.activeTabId === tabId) {
		tile.activeTabId = tile.tabs[index]?.id ?? tile.tabs[index - 1]?.id ?? null;
	}
	if (!activeReaderTab(next.tiles.find((item) => item.id === next.focusedTileId) ?? tile)) {
		next.focusedTileId = next.tiles.find((item) => activeReaderTab(item))?.id ?? next.tiles[0]!.id;
	}
	return next;
}

export function moveReaderTab(
	workspace: ReaderWorkspace,
	fromTileId: string,
	tabId: string,
	toTileId: string,
	toIndex: number
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const source = next.tiles.find((tile) => tile.id === fromTileId);
	const destination = next.tiles.find((tile) => tile.id === toTileId);
	if (!source || !destination) return next;
	const fromIndex = source.tabs.findIndex((tab) => tab.id === tabId);
	if (fromIndex === -1) return next;
	const [tab] = source.tabs.splice(fromIndex, 1);
	if (!tab) return next;

	if (source === destination && fromIndex < toIndex) toIndex -= 1;
	const target = Math.max(0, Math.min(destination.tabs.length, Math.floor(toIndex)));
	destination.tabs.splice(target, 0, tab);
	if (source.activeTabId === tabId && source !== destination) {
		source.activeTabId = source.tabs[fromIndex]?.id ?? source.tabs[fromIndex - 1]?.id ?? null;
	}
	destination.activeTabId = tab.id;
	next.focusedTileId = destination.id;
	return next;
}

/** Changes the work shown by one existing tab without changing its link set or location. */
export function replaceReaderTabResource(
	workspace: ReaderWorkspace,
	tileId: string,
	tabId: string,
	resourceId: string
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const tile = next.tiles.find((item) => item.id === tileId);
	const tab = tile?.tabs.find((item) => item.id === tabId);
	if (tile && tab) {
		tab.resourceId = resourceId;
		tab.lookup = null;
		tile.activeTabId = tab.id;
		next.focusedTileId = tile.id;
	}
	return next;
}

/**
 * Stores the location owned by a tab. Every tab in the same non-empty link set follows it, including
 * inactive tabs; activating one later must never restore a stale location into the visible group.
 */
export function setReaderTabReference(
	workspace: ReaderWorkspace,
	tileId: string,
	tabId: string,
	reference: VerseRef
): ReaderWorkspace {
	if (!isReferenceInCanon(reference)) return cloneWorkspace(workspace);
	const next = cloneWorkspace(workspace);
	const tile = next.tiles.find((item) => item.id === tileId);
	const tab = tile?.tabs.find((item) => item.id === tabId);
	if (!tile || !tab) return next;

	tab.reference = { ...reference };
	tile.activeTabId = tab.id;
	next.focusedTileId = tile.id;
	if (tab.linkSet) {
		for (const candidateTile of next.tiles) {
			for (const candidate of candidateTile.tabs) {
				if (candidate.id !== tab.id && candidate.linkSet === tab.linkSet) {
					candidate.reference = { ...reference };
				}
			}
		}
	}
	return next;
}

/** Stores and activates the entry shown by one lexicon tab. */
export function setReaderTabLookup(
	workspace: ReaderWorkspace,
	tileId: string,
	tabId: string,
	lookup: string | null
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const tile = next.tiles.find((item) => item.id === tileId);
	const tab = tile?.tabs.find((item) => item.id === tabId);
	if (!tile || !tab) return next;
	tab.lookup = normalizeTabLookup(lookup);
	tile.activeTabId = tab.id;
	next.focusedTileId = tile.id;
	return next;
}

export function setReaderTabLinkSet(
	workspace: ReaderWorkspace,
	tileId: string,
	tabId: string,
	linkSet: ReaderLinkSet
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const tab = next.tiles.find((tile) => tile.id === tileId)?.tabs.find((item) => item.id === tabId);
	if (tab) tab.linkSet = linkSet;
	return next;
}

export function readerLayoutSize(workspace: ReaderWorkspace): ReaderLayoutSize {
	const definition = readerLayoutDefinition(workspace.layout);
	const stored = workspace.layoutSizes[workspace.layout];
	return {
		columns: normalizeReaderTracks(stored?.columns ?? [], definition.columns),
		rows: normalizeReaderTracks(stored?.rows ?? [], definition.rows)
	};
}

export function setReaderLayoutSize(
	workspace: ReaderWorkspace,
	layout: ReaderLayout,
	columns: number[],
	rows: number[]
): ReaderWorkspace {
	const next = cloneWorkspace(workspace);
	const definition = readerLayoutDefinition(layout);
	next.layoutSizes[layout] = {
		columns: normalizeReaderTracks(columns, definition.columns),
		rows: normalizeReaderTracks(rows, definition.rows)
	};
	return next;
}

export function normalizeReaderTracks(values: number[], count: number): number[] {
	if (count <= 0) return [];
	if (values.length !== count || values.some((value) => !Number.isFinite(value) || value <= 0)) {
		return Array(count).fill(1 / count);
	}
	const clamped = values.map((value) => Math.max(MIN_READER_TRACK_FRACTION, value));
	const sum = clamped.reduce((total, value) => total + value, 0);
	return clamped.map((value) => value / sum);
}

function normalizeLayoutSizes(value: unknown): ReaderWorkspace['layoutSizes'] {
	if (!isObject(value)) return {};
	const sizes: ReaderWorkspace['layoutSizes'] = {};
	for (const layout of READER_LAYOUTS) {
		const raw = value[layout];
		if (!isObject(raw)) continue;
		const definition = readerLayoutDefinition(layout);
		sizes[layout] = {
			columns: normalizeReaderTracks(toNumberArray(raw.columns), definition.columns),
			rows: normalizeReaderTracks(toNumberArray(raw.rows), definition.rows)
		};
	}
	return sizes;
}

function toNumberArray(value: unknown): number[] {
	return Array.isArray(value)
		? value.filter((item): item is number => typeof item === 'number')
		: [];
}

function uniquePersistedId(value: unknown, fallback: string, used: Set<string>): string {
	const candidate =
		typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : fallback;
	let id = candidate;
	let suffix = 2;
	while (used.has(id)) {
		id = `${candidate}-${suffix}`;
		suffix += 1;
	}
	used.add(id);
	return id;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function cloneWorkspace(workspace: ReaderWorkspace): ReaderWorkspace {
	return {
		version: 1,
		layout: workspace.layout,
		focusedTileId: workspace.focusedTileId,
		tiles: workspace.tiles.map((tile) => ({
			id: tile.id,
			activeTabId: tile.activeTabId,
			tabs: tile.tabs.map((tab) => ({ ...tab }))
		})),
		layoutSizes: Object.fromEntries(
			Object.entries(workspace.layoutSizes).map(([layout, size]) => [
				layout,
				{ columns: [...size.columns], rows: [...size.rows] }
			])
		) as ReaderWorkspace['layoutSizes']
	};
}

function normalizeTabReference(value: unknown, fallback: VerseRef): VerseRef {
	if (!isObject(value)) return { ...fallback };
	const reference: VerseRef = {
		book: Number(value.book),
		chapter: Number(value.chapter),
		...(value.verse === undefined ? {} : { verse: Number(value.verse) })
	};
	if (
		!Number.isSafeInteger(reference.book) ||
		!Number.isSafeInteger(reference.chapter) ||
		(reference.verse !== undefined &&
			(!Number.isSafeInteger(reference.verse) || reference.verse < 1)) ||
		!isReferenceInCanon(reference)
	) {
		return { ...fallback };
	}
	return reference;
}

function normalizeTabLookup(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().slice(0, 200);
	return normalized || null;
}
