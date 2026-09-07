import { describe, expect, it } from 'vitest';
import {
	decodeReaderUrlState,
	encodeReaderUrlState,
	readerStateFromUrl,
	readReaderNotesFilters,
	readerStateFromPage,
	withReaderNotesFilters,
	sameReaderUrlWorkspace
} from './url-state';
import { workspaceFromColumns } from './workspace';

describe('reader URL state', () => {
	it('round-trips layout, tabs, active positions, references, link groups, lookup and active search', () => {
		const workspace = workspaceFromColumns(['bible', 'commentary', 'lexicon'], {
			book: 43,
			chapter: 3,
			verse: 16
		});
		workspace.tiles[0]!.tabs.push({
			id: 'second-tab',
			resourceId: 'lexicon',
			linkSet: 'C',
			reference: { book: 1, chapter: 2 },
			lookup: 'ἀγάπη',
			studyContext: {
				sourceResourceId: 'bible',
				reference: { book: 43, chapter: 3, verse: 16 },
				word: 'geliebt'
			}
		});
		workspace.tiles[0]!.activeTabId = 'second-tab';
		workspace.focusedTileId = workspace.tiles[1]!.id;
		workspace.layoutSizes['columns-3'] = { columns: [0.2, 0.3, 0.5], rows: [1] };

		const encoded = encodeReaderUrlState(workspace, {
			'second-tab': '  Liebe  ',
			[workspace.tiles[0]!.tabs[0]!.id]: 'not visible after another tab becomes active'
		});
		expect(encoded).toContain('layout=columns-3');
		expect(encoded).toContain('tab=1.2:lexicon:C:1Mo2');
		expect(encoded).toContain('lookup=1.2:');
		expect(encoded).toContain('search=1.2:Liebe');
		expect(encoded).not.toContain('w=');
		const decoded = decodeReaderUrlState(new URLSearchParams(encoded))!;
		const value = decoded.workspace as typeof workspace;

		expect(value.layout).toBe('columns-3');
		expect(value.tiles.map((tile) => tile.tabs.map((tab) => tab.resourceId))).toEqual([
			['bible', 'lexicon'],
			['commentary'],
			['lexicon']
		]);
		expect(value.tiles[0]!.activeTabId).toBe('url-tab-1-2');
		expect(value.focusedTileId).toBe('url-tile-2');
		expect(value.tiles[0]!.tabs[1]).toMatchObject({
			linkSet: 'C',
			reference: { book: 1, chapter: 2 },
			lookup: 'ἀγάπη',
			studyContext: {
				sourceResourceId: 'bible',
				reference: { book: 43, chapter: 3, verse: 16 },
				word: 'geliebt'
			}
		});
		expect(value.layoutSizes).toEqual({});
		expect(decoded.searchQueries).toEqual({ 'url-tab-1-2': 'Liebe' });
	});

	it('compares the URL-owned state without persisted ids or personal divider sizes', () => {
		const left = workspaceFromColumns(['bible', 'commentary']);
		const right = structuredClone(left);
		right.tiles[0]!.id = 'another-tile-id';
		right.tiles[0]!.tabs[0]!.id = 'another-tab-id';
		right.tiles[0]!.activeTabId = 'another-tab-id';
		right.focusedTileId = 'another-tile-id';
		right.layoutSizes['columns-2'] = { columns: [0.7, 0.3], rows: [1] };

		expect(sameReaderUrlWorkspace(left, right)).toBe(true);
		right.tiles[0]!.tabs[0]!.reference = { book: 43, chapter: 3 };
		expect(sameReaderUrlWorkspace(left, right)).toBe(false);
	});

	it('canonicalizes escaped data-request separators without obscuring the address-bar state', () => {
		const url = new URL(
			'https://example.test/Joh3?layout=single&tab=1.1%3ASEEDDE%3AA%3AJoh3%2C16&search=1.1%3AM%C3%A4nner+und+Frauen&active=1.1&focus=1&x-sveltekit-invalidated=1'
		);

		expect(readerStateFromUrl(url)).toBe(
			'layout=single&tab=1.1:SEEDDE:A:Joh3,16&search=1.1:M%C3%A4nner%20und%20Frauen&active=1.1&focus=1'
		);
	});

	it('rejects malformed state', () => {
		expect(decodeReaderUrlState(new URLSearchParams('layout=unknown'))).toBeNull();
		expect(decodeReaderUrlState(new URLSearchParams('layout=single&tab=broken'))).toBeNull();
		expect(decodeReaderUrlState(new URLSearchParams())).toBeNull();
	});
});

describe('sidecar URL filters', () => {
	it('round-trips readable search punctuation and tag paths independently of the workspace', () => {
		const workspace = workspaceFromColumns(['bible'], { book: 43, chapter: 3 });
		const filters = {
			query: 'Gnade: Glaube & Liebe',
			tag: 'Theologie/Gnade',
			onlyCurrentPassage: true
		};
		const state = encodeReaderUrlState(workspace, {}, filters);
		const url = new URL(`https://example.com/Joh3?${state}`);
		expect(readerStateFromUrl(url)).toBe(state);
		expect(readReaderNotesFilters(url.searchParams)).toEqual(filters);
		expect(withReaderNotesFilters(state, { query: '', tag: '', onlyCurrentPassage: false })).toBe(
			encodeReaderUrlState(workspace)
		);
	});
	it('uses shallow page state for subsequent reader forms', () => {
		const workspace = workspaceFromColumns(['bible'], { book: 43, chapter: 3 });
		const url = new URL(`https://example.com/Joh3?${encodeReaderUrlState(workspace)}`);
		const filters = { query: 'Neu', tag: '', onlyCurrentPassage: true };
		expect(readerStateFromPage({ url, state: { readerNotesFilters: filters } })).toBe(
			encodeReaderUrlState(workspace, {}, filters)
		);
		const latest = workspaceFromColumns(['bible'], { book: 43, chapter: 4, verse: 2 });
		const search = { [latest.tiles[0]!.activeTabId!]: 'Liebe' };
		const readerState = encodeReaderUrlState(latest, search);
		expect(readerStateFromPage({ url, state: { readerState, readerNotesFilters: filters } })).toBe(
			encodeReaderUrlState(latest, search, filters)
		);
	});
});
