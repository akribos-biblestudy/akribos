import { parseReference, referencePath, type VerseRef } from '$lib/bible/reference';
import {
	isReaderLayout,
	MAX_READER_TABS,
	readerLayoutDefinition,
	type ReaderWorkspace
} from './workspace';

const READER_URL_STATE_PARAMS = new Set([
	'layout',
	'tab',
	'active',
	'focus',
	'lookup',
	'source',
	'sourceRef',
	'word',
	'search'
]);

export const MAX_READER_URL_STATE_LENGTH = 12_000;

export type ReaderSearchQueries = Record<string, string>;

type CompactTab = [
	resourceId: string,
	linkSet: Exclude<ReaderWorkspace['tiles'][number]['tabs'][number]['linkSet'], null> | 0,
	book: number,
	chapter: number,
	verse: number | 0,
	lookup: string | 0,
	studyResourceId: string | 0,
	studyBook: number | 0,
	studyChapter: number | 0,
	studyVerse: number | 0,
	studyWord: string | 0,
	searchQuery: string | 0
];

type CompactTile = [activeTabIndex: number, tabs: CompactTab[]];
type CompactReaderUrlState = [
	version: 1,
	layout: ReaderWorkspace['layout'],
	tiles: CompactTile[],
	focusedTileIndex: number
];

type TabCoordinate = {
	tile: number;
	tab: number;
};

type ReaderUrlTab = {
	coordinate: TabCoordinate;
	key: string;
	resourceId: string;
	linkSet: unknown;
	reference: VerseRef;
	lookup?: string | null;
	studyContext?: {
		sourceResourceId: string;
		reference: VerseRef;
		word: string | null;
	} | null;
};

export type DecodedReaderUrlState = {
	workspace: unknown;
	searchQueries: ReaderSearchQueries;
};

/**
 * The address bar owns the reconstructable Reader state. Its query is intentionally readable:
 *
 *   ?layout=columns-2&tab=1.1:SEEDDE:A:Joh3,16&active=1.1&focus=1
 *
 * `tab`, `active`, `lookup`, `source`, `sourceRef`, `word` and `search` may repeat. Persisted UUIDs
 * and custom divider sizes are deliberately omitted; coordinates provide stable identity inside the
 * URL, while sizes remain a personal device preference.
 */
export function encodeReaderUrlState(
	workspace: ReaderWorkspace,
	searchQueries: ReaderSearchQueries = {}
): string {
	const parts = [`layout=${encodePart(workspace.layout)}`];

	workspace.tiles.forEach((tile, tileIndex) => {
		tile.tabs.forEach((tab, tabIndex) => {
			const coordinate = coordinateValue(tileIndex, tabIndex);
			parts.push(
				`tab=${coordinate}:${encodePart(tab.resourceId)}:${tab.linkSet ?? '-'}:${encodePart(referenceValue(tab.reference))}`
			);
			if (tab.lookup) parts.push(`lookup=${coordinate}:${encodePart(tab.lookup)}`);
			if (tab.studyContext) {
				parts.push(`source=${coordinate}:${encodePart(tab.studyContext.sourceResourceId)}`);
				parts.push(
					`sourceRef=${coordinate}:${encodePart(referenceValue(tab.studyContext.reference))}`
				);
				if (tab.studyContext.word) {
					parts.push(`word=${coordinate}:${encodePart(tab.studyContext.word)}`);
				}
			}
			if (tab.id === tile.activeTabId) {
				const search = searchQueries[tab.id]?.trim().slice(0, 200);
				if (search) parts.push(`search=${coordinate}:${encodePart(search)}`);
			}
		});

		const activeIndex = tile.tabs.findIndex((tab) => tab.id === tile.activeTabId);
		if (activeIndex >= 0) parts.push(`active=${coordinateValue(tileIndex, activeIndex)}`);
	});

	const focusedIndex = workspace.tiles.findIndex((tile) => tile.id === workspace.focusedTileId);
	if (focusedIndex >= 0) parts.push(`focus=${focusedIndex + 1}`);

	const encoded = parts.join('&');
	if (encoded.length > MAX_READER_URL_STATE_LENGTH) {
		throw new Error('Der Reader-Zustand ist zu groß für eine zuverlässige URL.');
	}
	return encoded;
}

/** Treat URL data as untrusted; the domain normalizer validates the returned workspace afterwards. */
export function decodeReaderUrlState(value: URL | URLSearchParams): DecodedReaderUrlState | null {
	const params = value instanceof URL ? value.searchParams : value;
	const layout = params.get('layout');
	if (!isReaderLayout(layout)) return null;
	const tileCount = readerLayoutDefinition(layout).tileCount;
	const tabsByTile = Array.from({ length: tileCount }, () => new Map<number, ReaderUrlTab>());
	const lookups = coordinateParameters(params, 'lookup');
	const sources = coordinateParameters(params, 'source');
	const sourceReferences = coordinateParameters(params, 'sourceRef');
	const words = coordinateParameters(params, 'word');
	const searches = coordinateParameters(params, 'search');

	for (const raw of params.getAll('tab')) {
		const parsed = parseTabParameter(raw);
		if (!parsed || parsed.coordinate.tile > tileCount) continue;
		const sourceReference = parseReference(sourceReferences.get(parsed.key) ?? '');
		const sourceResourceId = cleanOptional(sources.get(parsed.key));
		tabsByTile[parsed.coordinate.tile - 1]!.set(parsed.coordinate.tab, {
			...parsed,
			lookup: cleanOptional(lookups.get(parsed.key)),
			studyContext:
				sourceResourceId && sourceReference
					? {
							sourceResourceId,
							reference: sourceReference,
							word: cleanOptional(words.get(parsed.key))
						}
					: null
		});
	}

	if (tabsByTile.every((tabs) => tabs.size === 0)) return null;
	const activeCoordinates = new Map<number, number>();
	for (const raw of params.getAll('active')) {
		const coordinate = parseCoordinate(raw);
		if (coordinate) activeCoordinates.set(coordinate.tile, coordinate.tab);
	}

	const searchQueries: ReaderSearchQueries = {};
	const tiles = tabsByTile.map((rawTabs, tileIndex) => {
		const tabs = [...rawTabs.entries()]
			.sort(([left], [right]) => left - right)
			.map(([, tab]) => {
				const id = urlTabId(tab.coordinate.tile - 1, tab.coordinate.tab - 1);
				const search = cleanOptional(searches.get(tab.key));
				if (search) searchQueries[id] = search;
				return {
					id,
					resourceId: tab.resourceId,
					linkSet: tab.linkSet,
					reference: tab.reference,
					lookup: tab.lookup,
					studyContext: tab.studyContext
				};
			});
		const activeCoordinate = activeCoordinates.get(tileIndex + 1);
		const activeId = activeCoordinate ? urlTabId(tileIndex, activeCoordinate - 1) : tabs[0]?.id;
		return {
			id: urlTileId(tileIndex),
			tabs,
			activeTabId: tabs.some((tab) => tab.id === activeId)
				? (activeId ?? null)
				: (tabs[0]?.id ?? null)
		};
	});

	const focus = Number(params.get('focus'));
	return {
		workspace: {
			version: 1,
			layout,
			tiles,
			focusedTileId:
				Number.isInteger(focus) && tiles[focus - 1]?.activeTabId
					? tiles[focus - 1]!.id
					: (tiles.find((tile) => tile.activeTabId)?.id ?? tiles[0]!.id),
			layoutSizes: {}
		},
		searchQueries
	};
}

/** Extracts Reader-owned entries and normalizes URLSearchParams' escaped separators back to the
 * human-readable canonical representation used in the address bar. */
export function readerStateFromUrl(url: URL): string | null {
	const raw = url.search.replace(/^\?/, '');
	if (!raw || raw.length > MAX_READER_URL_STATE_LENGTH) return null;
	const entries = [...url.searchParams]
		.filter(([name]) => READER_URL_STATE_PARAMS.has(name))
		.map(([name, value]) => `${name}=${encodeReadableQueryValue(value)}`);
	return entries.length > 0 ? entries.join('&') : null;
}

/** Equality for deciding whether a URL is still the user's persisted branch. */
export function sameReaderUrlWorkspace(left: ReaderWorkspace, right: ReaderWorkspace): boolean {
	return (
		JSON.stringify(compactReaderState(left, {})) === JSON.stringify(compactReaderState(right, {}))
	);
}

export function readerActionUrl(action: string, state: string | null | undefined): string {
	return state ? `?${state}&/${action}` : `?/${action}`;
}

export function readerUrl(path: string, state: string): string {
	return `${path}?${state}`;
}

export function readerStateFromActionData(data: unknown): string | null {
	return data &&
		typeof data === 'object' &&
		'readerState' in data &&
		typeof data.readerState === 'string'
		? data.readerState
		: null;
}

function parseTabParameter(raw: string): ReaderUrlTab | null {
	const coordinateSeparator = raw.indexOf(':');
	const referenceSeparator = raw.lastIndexOf(':');
	const groupSeparator = raw.lastIndexOf(':', referenceSeparator - 1);
	if (
		coordinateSeparator <= 0 ||
		groupSeparator <= coordinateSeparator ||
		referenceSeparator <= groupSeparator
	)
		return null;

	const coordinate = parseCoordinate(raw.slice(0, coordinateSeparator));
	const resourceId = raw.slice(coordinateSeparator + 1, groupSeparator).trim();
	const rawLinkSet = raw.slice(groupSeparator + 1, referenceSeparator);
	const reference = parseReference(raw.slice(referenceSeparator + 1));
	if (!coordinate || !resourceId || !reference) return null;
	return {
		coordinate,
		key: coordinateKey(coordinate),
		resourceId,
		linkSet: rawLinkSet === '-' ? null : rawLinkSet,
		reference
	};
}

function coordinateParameters(params: URLSearchParams, name: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const raw of params.getAll(name)) {
		const separator = raw.indexOf(':');
		if (separator <= 0) continue;
		const coordinate = parseCoordinate(raw.slice(0, separator));
		if (!coordinate) continue;
		result.set(coordinateKey(coordinate), raw.slice(separator + 1));
	}
	return result;
}

function parseCoordinate(raw: string): TabCoordinate | null {
	const match = /^(\d+)\.(\d+)$/.exec(raw);
	if (!match) return null;
	const tile = Number(match[1]);
	const tab = Number(match[2]);
	return Number.isInteger(tile) &&
		tile >= 1 &&
		tile <= 4 &&
		Number.isInteger(tab) &&
		tab >= 1 &&
		tab <= MAX_READER_TABS
		? { tile, tab }
		: null;
}

function coordinateKey(coordinate: TabCoordinate): string {
	return `${coordinate.tile}.${coordinate.tab}`;
}

function coordinateValue(tileIndex: number, tabIndex: number): string {
	return `${tileIndex + 1}.${tabIndex + 1}`;
}

function referenceValue(reference: VerseRef): string {
	return referencePath(reference).slice(1);
}

function cleanOptional(value: string | undefined): string | null {
	const cleaned = value?.trim().slice(0, 200);
	return cleaned || null;
}

function encodePart(value: string): string {
	return encodeURIComponent(value).replace(/%2C/gi, ',');
}

function encodeReadableQueryValue(value: string): string {
	return encodePart(value).replace(/%3A/gi, ':');
}

function compactReaderState(
	workspace: ReaderWorkspace,
	searchQueries: ReaderSearchQueries
): CompactReaderUrlState {
	return [
		1,
		workspace.layout,
		workspace.tiles.map((tile) => [
			Math.max(
				0,
				tile.tabs.findIndex((tab) => tab.id === tile.activeTabId)
			),
			tile.tabs.map((tab) => [
				tab.resourceId,
				tab.linkSet ?? 0,
				tab.reference.book,
				tab.reference.chapter,
				tab.reference.verse ?? 0,
				tab.lookup ?? 0,
				tab.studyContext?.sourceResourceId ?? 0,
				tab.studyContext?.reference.book ?? 0,
				tab.studyContext?.reference.chapter ?? 0,
				tab.studyContext?.reference.verse ?? 0,
				tab.studyContext?.word ?? 0,
				tab.id === tile.activeTabId ? (searchQueries[tab.id]?.trim().slice(0, 200) ?? 0) : 0
			])
		]),
		Math.max(
			0,
			workspace.tiles.findIndex((tile) => tile.id === workspace.focusedTileId)
		)
	];
}

function urlTileId(tileIndex: number): string {
	return `url-tile-${tileIndex + 1}`;
}

function urlTabId(tileIndex: number, tabIndex: number): string {
	return `url-tab-${tileIndex + 1}-${tabIndex + 1}`;
}
