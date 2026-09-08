import { describe, expect, it } from 'vitest';
import { openReaderBibleReference } from './open-bible-reference';
import {
	activeReaderTab,
	addReaderTab,
	changeReaderLayout,
	setReaderTabLinkSet,
	workspaceFromColumns
} from './workspace';

const resources = [
	{ id: 'comment', kind: 'commentary' },
	{ id: 'bible', kind: 'bible' },
	{ id: 'second', kind: 'bible' }
];
const reference = { book: 40, chapter: 3, verse: 12 };

describe('opening a document reference in the Reader', () => {
	it('uses the first visible Bible and preserves unrelated tiles and link groups', () => {
		let workspace = workspaceFromColumns(['comment', 'bible', 'second']);
		workspace = setReaderTabLinkSet(workspace, 'tile-1', 'tab-1', 'B');
		workspace = setReaderTabLinkSet(workspace, 'tile-3', 'tab-3', null);
		const result = openReaderBibleReference(
			workspace,
			resources,
			reference,
			() => 'new',
			'second'
		)!;
		expect(result.tileId).toBe('tile-2');
		expect(activeReaderTab(result.workspace.tiles[1]!)?.reference).toEqual(reference);
		expect(result.workspace.tiles[0]).toEqual(workspace.tiles[0]);
		expect(result.workspace.tiles[2]).toEqual(workspace.tiles[2]);
		expect(result.workspace.layout).toBe(workspace.layout);
	});

	it.each([false, true])(
		'adds a Bible in group A without closing tabs (empty tile: %s)',
		(empty) => {
			let workspace = workspaceFromColumns(['comment']);
			workspace = setReaderTabLinkSet(workspace, 'tile-1', 'tab-1', 'B');
			if (empty) workspace = changeReaderLayout(workspace, 'columns-2', () => 'empty');
			const result = openReaderBibleReference(
				workspace,
				resources,
				reference,
				() => 'new',
				'second'
			)!;
			const target = result.workspace.tiles.find((tile) => tile.id === result.tileId)!;
			expect(activeReaderTab(target)).toMatchObject({
				resourceId: 'second',
				linkSet: 'A',
				reference
			});
			expect(result.workspace.tiles.flatMap((tile) => tile.tabs)).toContainEqual(
				workspace.tiles[0]!.tabs[0]
			);
			expect(result.workspace.layout).toBe(workspace.layout);
			expect(result.tileId).toBe(empty ? 'empty' : 'tile-1');
		}
	);

	it('returns no mutation when no public Bible is available', () => {
		const workspace = workspaceFromColumns(['comment']);
		expect(
			openReaderBibleReference(workspace, resources.slice(0, 1), reference, () => 'new')
		).toBeNull();
	});

	it('reuses an inactive Bible in the requested group and preserves other groups', () => {
		let workspace = workspaceFromColumns(['bible', 'second']);
		workspace = setReaderTabLinkSet(workspace, 'tile-2', 'tab-2', 'C');
		workspace = addReaderTab(workspace, 'tile-2', 'comment', () => 'comment-tab');
		workspace = setReaderTabLinkSet(workspace, 'tile-2', 'comment-tab', 'B');
		const result = openReaderBibleReference(
			workspace,
			resources,
			reference,
			() => 'new',
			null,
			'C'
		)!;
		expect(result.tabId).toBe('tab-2');
		expect(activeReaderTab(result.workspace.tiles[1]!)?.reference).toEqual(reference);
		expect(result.workspace.tiles[0]).toEqual(workspace.tiles[0]);
		expect(result.workspace.tiles[1]!.tabs[1]).toEqual(workspace.tiles[1]!.tabs[1]);
		expect(result.workspace.tiles.flatMap((tile) => tile.tabs)).toHaveLength(3);
	});

	it('prefers a visible Bible over an earlier inactive Bible of the same group', () => {
		let workspace = workspaceFromColumns(['bible', 'second']);
		workspace = addReaderTab(workspace, 'tile-1', 'comment', () => 'comment-tab');
		const result = openReaderBibleReference(
			workspace,
			resources,
			reference,
			() => 'new',
			null,
			'A'
		)!;
		expect(result.tabId).toBe('tab-2');
		expect(result.workspace.tiles[0]!.activeTabId).toBe('comment-tab');
		expect(
			result.workspace.tiles
				.flatMap((tile) => tile.tabs)
				.every((tab) => JSON.stringify(tab.reference) === JSON.stringify(reference))
		).toBe(true);
	});

	it('adds a Bible to a missing group once and reuses it on subsequent opens', () => {
		const workspace = workspaceFromColumns(['bible', 'comment']);
		const first = openReaderBibleReference(
			workspace,
			resources,
			reference,
			() => 'new',
			'second',
			'E'
		)!;
		const second = openReaderBibleReference(
			first.workspace,
			resources,
			{ ...reference, verse: 13 },
			() => 'duplicate',
			null,
			'E'
		)!;
		expect(first.workspace.tiles[0]!.tabs[1]).toMatchObject({
			resourceId: 'second',
			linkSet: 'E',
			reference
		});
		expect(second.tabId).toBe('new');
		expect(second.workspace.tiles.flatMap((tile) => tile.tabs)).toHaveLength(3);
		expect(second.workspace.tiles[0]!.tabs[0]).toEqual(workspace.tiles[0]!.tabs[0]);
		expect(second.workspace.tiles[1]).toEqual(workspace.tiles[1]);
	});
});
