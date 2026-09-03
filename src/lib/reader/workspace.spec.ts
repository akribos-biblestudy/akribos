import { describe, expect, it } from 'vitest';
import {
	activateReaderTab,
	activeReaderTab,
	addReaderTab,
	changeReaderLayout,
	closeReaderTab,
	moveReaderTab,
	normalizeReaderWorkspace,
	readerLayoutSize,
	setReaderLayoutSize,
	setReaderTabLinkSet,
	workspaceFromColumns
} from './workspace.ts';

function ids() {
	let index = 0;
	return () => `new-${++index}`;
}

describe('reader workspace', () => {
	it('losslessly migrates five old columns into four tiles', () => {
		const workspace = workspaceFromColumns(['a', 'b', 'c', 'd', 'e']);
		expect(workspace.layout).toBe('columns-4');
		expect(workspace.tiles.map((tile) => tile.tabs.map((tab) => tab.resourceId))).toEqual([
			['a'],
			['b'],
			['c'],
			['d', 'e']
		]);
		expect(workspace.tiles.flatMap((tile) => tile.tabs).every((tab) => tab.linkSet === 'A')).toBe(
			true
		);
	});

	it('moves surplus tabs into new tiles and merges removed tiles without closing tabs', () => {
		let workspace = workspaceFromColumns(['a', 'b', 'c', 'd', 'e']);
		workspace = changeReaderLayout(workspace, 'single', ids());
		expect(workspace.tiles).toHaveLength(1);
		expect(workspace.tiles[0]?.tabs.map((tab) => tab.resourceId)).toEqual([
			'a',
			'b',
			'c',
			'd',
			'e'
		]);

		workspace = changeReaderLayout(workspace, 'grid-4', ids());
		expect(workspace.tiles).toHaveLength(4);
		expect(workspace.tiles.flatMap((tile) => tile.tabs)).toHaveLength(5);
		expect(workspace.tiles.slice(1).every((tile) => tile.tabs.length === 1)).toBe(true);
	});

	it('keeps link sets on tabs while activating, moving and closing them', () => {
		const createId = ids();
		let workspace = workspaceFromColumns(['a', 'b']);
		workspace = addReaderTab(workspace, 'tile-1', 'c', createId);
		const added = activeReaderTab(workspace.tiles[0]!)!;
		workspace = setReaderTabLinkSet(workspace, 'tile-1', added.id, 'C');
		workspace = moveReaderTab(workspace, 'tile-1', added.id, 'tile-2', 0);
		expect(activeReaderTab(workspace.tiles[1]!)?.linkSet).toBe('C');
		workspace = activateReaderTab(workspace, 'tile-2', 'tab-2');
		expect(activeReaderTab(workspace.tiles[1]!)?.resourceId).toBe('b');
		workspace = closeReaderTab(workspace, 'tile-2', 'tab-2');
		expect(activeReaderTab(workspace.tiles[1]!)?.resourceId).toBe('c');
	});

	it('allows an empty tile and repairs invalid persisted data', () => {
		const normalized = normalizeReaderWorkspace(
			{
				version: 1,
				layout: 'columns-2',
				tiles: [
					{ id: 'same', activeTabId: 'missing', tabs: [{ id: 'same-tab', resourceId: 'gone' }] },
					{
						id: 'same',
						activeTabId: 'same-tab',
						tabs: [{ id: 'same-tab', resourceId: 'known', linkSet: 'Z' }]
					}
				]
			},
			['known']
		);
		expect(normalized.tiles[0]?.tabs).toEqual([]);
		expect(normalized.tiles[1]?.id).not.toBe('same');
		expect(normalized.tiles[1]?.tabs[0]?.linkSet).toBe('A');
		expect(normalized.tiles[1]?.activeTabId).toBe(normalized.tiles[1]?.tabs[0]?.id);
	});

	it('normalizes and remembers sizes separately for every layout', () => {
		let workspace = workspaceFromColumns(['a', 'b']);
		workspace = setReaderLayoutSize(workspace, 'columns-2', [3, 1], [1]);
		expect(readerLayoutSize(workspace).columns).toEqual([0.75, 0.25]);
		workspace = changeReaderLayout(workspace, 'rows-2', ids());
		expect(readerLayoutSize(workspace).rows).toEqual([0.5, 0.5]);
		workspace = changeReaderLayout(workspace, 'columns-2', ids());
		expect(readerLayoutSize(workspace).columns).toEqual([0.75, 0.25]);
	});
});
