import { describe, expect, it } from 'vitest';
import { openReaderBibleReference } from './open-bible-reference';
import {
	activeReaderTab,
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
});
