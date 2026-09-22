import { describe, expect, it } from 'vitest';
import { publishWorkspaceChanges } from './publish-workspace';
import { restoreSavedWorkspace, type SavedWorkspaceSnapshot } from './saved-workspaces';
import { MAX_READER_URL_STATE_LENGTH } from './url-state';

const initial: SavedWorkspaceSnapshot = {
	readerState:
		'layout=columns-2&tab=1.1:BIBLE:A:Joh3,16&tab=1.2:OTHER:A:Joh3,16&tab=2.1:LEXICON:A:Joh3,16&active=1.1&active=2.1&focus=1',
	layoutSizes: { 'columns-2': { columns: [0.5, 0.5], rows: [1] } }
};

function change(
	snapshot: SavedWorkspaceSnapshot,
	edit: (params: URLSearchParams) => void
): SavedWorkspaceSnapshot {
	const params = new URLSearchParams(snapshot.readerState);
	edit(params);
	return { readerState: params.toString(), layoutSizes: structuredClone(snapshot.layoutSizes) };
}

function entries(snapshot: SavedWorkspaceSnapshot) {
	return [...new URLSearchParams(snapshot.readerState)].sort();
}

describe('publishing independent browser-tab working copies', () => {
	it('keeps remote searches, note filters and divider sizes when the local reader only scrolls', () => {
		const after = change(initial, (params) => {
			const tabs = params.getAll('tab');
			params.delete('tab');
			for (const tab of tabs) params.append('tab', tab.replace('Joh3,16', 'Joh3,17'));
		});
		const shared = change(initial, (params) => {
			params.set('search', '1.2:Liebe');
			params.set('notesQuery', 'Gedanke');
			params.set('notesTag', 'Studium');
			params.set('notesFilter', 'current');
		});
		shared.layoutSizes['columns-2'] = { columns: [0.7, 0.3], rows: [1] };
		const result = publishWorkspaceChanges(initial, after, shared);
		const params = new URLSearchParams(result.readerState);
		expect(params.getAll('tab')).toEqual([
			'1.1:BIBLE:A:Joh3,17',
			'1.2:OTHER:A:Joh3,17',
			'2.1:LEXICON:A:Joh3,17'
		]);
		expect(params.get('search')).toBe('1.2:Liebe');
		expect(params.get('notesQuery')).toBe('Gedanke');
		expect(params.get('notesTag')).toBe('Studium');
		expect(params.get('notesFilter')).toBe('current');
		expect(result.layoutSizes).toEqual(shared.layoutSizes);
	});

	it('merges searches by resource tab and removes only the search closed locally', () => {
		const before = change(initial, (params) => params.append('search', '1.1:Liebe'));
		const after = change(before, (params) => {
			params.delete('search');
			params.append('search', '1.2:Glaube');
		});
		const shared = change(before, (params) => params.append('search', '2.1:G3056'));
		const result = publishWorkspaceChanges(before, after, shared);
		expect(new URLSearchParams(result.readerState).getAll('search').sort()).toEqual([
			'1.2:Glaube',
			'2.1:G3056'
		]);
	});

	it('does not roll back a remote arrangement when an older local view keeps reading', () => {
		const after = change(initial, (params) => params.set('search', '1.1:Wort'));
		const shared: SavedWorkspaceSnapshot = {
			readerState: 'layout=single&tab=1.1:LEXICON:B:1Mo1&active=1.1&focus=1&lookup=1.1:G26',
			layoutSizes: {}
		};
		expect(publishWorkspaceChanges(initial, after, shared)).toEqual(shared);
	});

	it('publishes a structural edit as one complete arrangement with its matching search coordinates', () => {
		const after: SavedWorkspaceSnapshot = {
			readerState: 'layout=single&tab=1.1:OTHER:A:Joh3,16&active=1.1&focus=1&search=1.1:Glaube',
			layoutSizes: {}
		};
		const shared = change(initial, (params) => {
			params.set('lookup', '2.1:G26');
			params.set('search', '1.2:Liebe');
		});
		expect(publishWorkspaceChanges(initial, after, shared)).toEqual(after);
	});

	it('keeps independent saved splitter arrangements when resizing one layout', () => {
		const after = structuredClone(initial);
		after.layoutSizes['columns-2'] = { columns: [0.6, 0.4], rows: [1] };
		const shared = structuredClone(initial);
		shared.layoutSizes['grid-4'] = { columns: [0.8, 0.2], rows: [0.4, 0.6] };
		const result = publishWorkspaceChanges(initial, after, shared);
		expect(result.layoutSizes).toEqual({
			'columns-2': { columns: [0.6, 0.4], rows: [1] },
			'grid-4': { columns: [0.8, 0.2], rows: [0.4, 0.6] }
		});
	});

	it('retains exactly one active tab per tile when another view selected a double-digit tab', () => {
		const before = change(initial, (params) => {
			for (let index = 3; index <= 12; index++) params.append('tab', `1.${index}:OTHER:A:Joh3,16`);
		});
		const after = change(before, (params) => {
			params.delete('active');
			params.append('active', '1.2');
			params.append('active', '2.1');
		});
		const shared = change(before, (params) => {
			params.delete('active');
			params.append('active', '1.10');
			params.append('active', '2.1');
		});
		const result = publishWorkspaceChanges(before, after, shared);
		expect(new URLSearchParams(result.readerState).getAll('active').sort()).toEqual(['1.2', '2.1']);
	});

	it('publishes a clicked Strong word together with its own source Bible and verse', () => {
		const before = change(initial, (params) => {
			params.set('lookup', '2.1:G26');
			params.set('source', '2.1:BIBLE');
			params.set('sourceRef', '2.1:Joh3,16');
			params.set('word', '2.1:Liebe');
		});
		const after = change(before, (params) => {
			params.set('lookup', '2.1:G3056');
			params.set('word', '2.1:Wort');
		});
		const shared = change(before, (params) => {
			params.set('lookup', '2.1:G746');
			params.set('source', '2.1:OTHER');
			params.set('sourceRef', '2.1:Joh1,1');
			params.set('word', '2.1:Anfang');
		});
		const result = new URLSearchParams(publishWorkspaceChanges(before, after, shared).readerState);
		expect(result.get('lookup')).toBe('2.1:G3056');
		expect(result.get('source')).toBe('2.1:BIBLE');
		expect(result.get('sourceRef')).toBe('2.1:Joh3,16');
		expect(result.get('word')).toBe('2.1:Wort');
	});

	it('does not publish stale fields or mutate inputs when there is no local change', () => {
		const shared = change(initial, (params) => {
			params.set('notesQuery', 'Neu');
			params.set('search', '1.2:Liebe');
		});
		const original = structuredClone({ initial, shared });
		const result = publishWorkspaceChanges(initial, initial, shared);
		expect(entries(result)).toEqual(entries(shared));
		expect(result.layoutSizes).toEqual(shared.layoutSizes);
		expect({ initial, shared }).toEqual(original);
	});

	it('preserves an openable shared snapshot when independent long searches would exceed the URL limit', () => {
		const params = new URLSearchParams({ layout: 'single', active: '1.1', focus: '1' });
		for (let index = 1; index <= 64; index++) params.append('tab', `1.${index}:BIBLE:-:Joh3,16`);
		const before = { readerState: params.toString(), layoutSizes: {} };
		const after = change(before, (params) => {
			for (let index = 1; index <= 32; index++)
				params.append('search', `1.${index}:${'a'.repeat(200)}`);
		});
		const shared = change(before, (params) => {
			for (let index = 33; index <= 64; index++)
				params.append('search', `1.${index}:${'b'.repeat(200)}`);
		});
		expect(restoreSavedWorkspace(after, ['BIBLE'])).not.toBeNull();
		expect(restoreSavedWorkspace(shared, ['BIBLE'])).not.toBeNull();
		const result = publishWorkspaceChanges(before, after, shared);
		expect(result.readerState.length).toBeLessThanOrEqual(MAX_READER_URL_STATE_LENGTH);
		expect(restoreSavedWorkspace(result, ['BIBLE'])).not.toBeNull();
		expect(entries(result)).toEqual(entries(shared));
	});
});
