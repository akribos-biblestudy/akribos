import { describe, expect, it } from 'vitest';
import { cleanWorkspaceName, restoreSavedWorkspace } from './saved-workspaces';
import { encodeReaderUrlState } from './url-state';
import { normalizeReaderWorkspace } from './workspace';

const readerState =
	'layout=grid-4&tab=1.1:BIBLE:A:Joh3,16&tab=1.2:OTHER:A:Joh3,16&tab=2.1:LEXICON:A:Joh3,16&tab=3.1:BIBLE:B:Röm8,1&active=1.1&active=2.1&active=3.1&focus=3&lookup=2.1:G26&source=2.1:BIBLE&sourceRef=2.1:Joh3,16&word=2.1:Liebe&search=1.1:Liebe&notesQuery=Glaube&notesFilter=current';

describe('saved Reader snapshots', () => {
	it('restores all tabs, independent groups, the focused passage, searches, lexicon context and sizes', () => {
		const result = restoreSavedWorkspace(
			{ readerState, layoutSizes: { 'grid-4': { columns: [0.65, 0.35], rows: [0.4, 0.6] } } },
			['BIBLE', 'OTHER', 'LEXICON']
		)!;
		expect(result.reference).toEqual({ book: 45, chapter: 8, verse: 1 });
		expect(result.url).toMatch(/^\/Röm8,1\?/);
		expect(result.workspace.tiles.map((tile) => tile.tabs.length)).toEqual([2, 1, 1, 0]);
		expect(result.workspace.tiles[1]!.tabs[0]).toMatchObject({
			lookup: 'G26',
			studyContext: { sourceResourceId: 'BIBLE', word: 'Liebe' }
		});
		expect(result.snapshot.layoutSizes['grid-4']).toEqual({
			columns: [0.65, 0.35],
			rows: [0.4, 0.6]
		});
		const params = new URLSearchParams(result.snapshot.readerState);
		expect(params.get('search')).toBe('1.1:Liebe');
		expect(params.get('notesQuery')).toBe('Glaube');
		expect(params.get('notesFilter')).toBe('current');
	});
	it('prunes unavailable resources and their searches without modifying the saved snapshot', () => {
		const saved = { readerState, layoutSizes: {} };
		const original = structuredClone(saved);
		const result = restoreSavedWorkspace(saved, ['OTHER', 'LEXICON'])!;
		expect(
			result.workspace.tiles.flatMap((tile) => tile.tabs).map((tab) => tab.resourceId)
		).toEqual(['OTHER', 'LEXICON']);
		expect(new URLSearchParams(result.snapshot.readerState).has('search')).toBe(false);
		expect(result.workspace.tiles[1]!.tabs[0]!.studyContext).toBeNull();
		expect(saved).toEqual(original);
	});
	it('normalizes malformed sizes and bounds invalid state/name inputs', () => {
		const result = restoreSavedWorkspace(
			{ readerState, layoutSizes: { 'grid-4': { columns: [-1, 'bad'], rows: [1000] } } },
			['BIBLE']
		)!;
		expect(result.workspace).toEqual(normalizeReaderWorkspace(result.workspace, ['BIBLE']));
		expect(encodeReaderUrlState(result.workspace)).toContain('layout=grid-4');
		for (const state of ['', 'layout=invalid', 'x'.repeat(12001)])
			expect(restoreSavedWorkspace({ readerState: state }, ['BIBLE'])).toBeNull();
		expect(cleanWorkspaceName('  Studium\n zum Römerbrief ')).toBe('Studium zum Römerbrief');
		expect(cleanWorkspaceName('   ')).toBeNull();
		expect(cleanWorkspaceName('x'.repeat(81))).toBeNull();
	});
});
