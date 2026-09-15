import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { workspaceFromColumns } from '$lib/reader/workspace';
import { INITIAL_READER_COLUMNS_COOKIE } from '$lib/reader/initial-layout';
import type { ReadableResource } from './repositories/resources.ts';
import {
	needsInitialReaderViewport,
	readReaderWorkspaceCookie,
	resolveReaderWorkspace,
	workspaceColumns,
	writeReaderWorkspace
} from './reader-workspace.ts';

function resource(id: string, kind: ReadableResource['kind'] = 'bible'): ReadableResource {
	return {
		id,
		kind,
		name: id,
		abbrev: id,
		coverTitle: id,
		tabTitle: id,
		selectionTitle: id,
		selectionSubtitle: id,
		language: 'de',
		canon: 'both',
		direction: 'ltr',
		sortOrder: 100,
		hasStrongs: false,
		hasMorphology: false,
		licenseHtml: null,
		usageNotesHtml: null
	};
}

function cookieJar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	const cookies = {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => values.set(name, value),
		delete: (name: string) => values.delete(name)
	} as unknown as Cookies;
	return { cookies, values };
}

describe('reader workspace persistence', () => {
	it('round-trips the compact cookie including link sets and layout sizes', () => {
		const { cookies } = cookieJar();
		const workspace = workspaceFromColumns(['a', 'b']);
		workspace.tiles[0]!.tabs[0]!.linkSet = 'D';
		workspace.tiles[0]!.tabs[0]!.lookup = 'G25';
		workspace.tiles[0]!.tabs[0]!.studyContext = {
			sourceResourceId: 'b',
			reference: { book: 43, chapter: 3, verse: 16 },
			word: 'geliebt'
		};
		workspace.layoutSizes['columns-2'] = { columns: [0.65, 0.35], rows: [1] };
		expect(writeReaderWorkspace(cookies, workspace)).toBe(true);
		expect(readReaderWorkspaceCookie(cookies)).toEqual(workspace);
	});

	it('uses the signed-in account copy before a stale device cookie', () => {
		const { cookies } = cookieJar();
		writeReaderWorkspace(cookies, workspaceFromColumns(['a']));
		const resolved = resolveReaderWorkspace(
			cookies,
			['a', 'b'].map((id) => resource(id)),
			workspaceFromColumns(['b']),
			[]
		);
		expect(resolved.tiles[0]?.tabs[0]?.resourceId).toBe('b');
	});

	it('starts a new reader with the first Bible, commentary and lexicon in group A', () => {
		const { cookies } = cookieJar({ [INITIAL_READER_COLUMNS_COOKIE]: '3' });
		const resolved = resolveReaderWorkspace(
			cookies,
			[
				resource('bible'),
				resource('commentary', 'commentary'),
				resource('lexicon', 'lexicon'),
				resource('second-bible')
			],
			null,
			[]
		);

		expect(resolved.layout).toBe('columns-3');
		expect(resolved.tiles.map((tile) => tile.tabs[0]?.resourceId)).toEqual([
			'bible',
			'commentary',
			'lexicon'
		]);
		expect(resolved.tiles.map((tile) => tile.tabs[0]?.linkSet)).toEqual(['A', 'A', 'A']);
	});

	it('keeps a Bible first and selects sorted complementary works up to the viewport limit', () => {
		const available = [
			resource('lexicon', 'lexicon'),
			resource('second-bible'),
			{ ...resource('first-bible'), sortOrder: 10 },
			resource('commentary', 'commentary'),
			resource('xrefs', 'xrefs')
		];
		for (const count of [1, 2, 3, 4]) {
			const { cookies } = cookieJar({ [INITIAL_READER_COLUMNS_COOKIE]: String(count) });
			const workspace = resolveReaderWorkspace(cookies, available, null);
			expect(workspace.tiles.map((tile) => tile.tabs[0]?.resourceId)).toEqual(
				['first-bible', 'commentary', 'lexicon', 'xrefs'].slice(0, count)
			);
		}
	});

	it('fills missing categories with Bibles and never creates empty default tiles', () => {
		const { cookies } = cookieJar({ [INITIAL_READER_COLUMNS_COOKIE]: '4' });
		const workspace = resolveReaderWorkspace(cookies, [resource('a'), resource('b')], null);
		expect(workspace.layout).toBe('columns-2');
		expect(workspaceColumns(workspace)).toEqual(['a', 'b']);
	});

	it('waits for a valid viewport hint only when neither a workspace nor legacy choice exists', () => {
		const available = [resource('bible')];
		const { cookies } = cookieJar({ [INITIAL_READER_COLUMNS_COOKIE]: '999' });
		expect(needsInitialReaderViewport(cookies, available, null)).toBe(true);
		expect(resolveReaderWorkspace(cookies, available, null).layout).toBe('single');
		expect(needsInitialReaderViewport(cookies, available, null, ['bible'])).toBe(false);
		writeReaderWorkspace(cookies, workspaceFromColumns(['bible']));
		expect(needsInitialReaderViewport(cookies, available, null)).toBe(false);
	});

	it('ignores the viewport when restoring an account workspace or a legacy choice', () => {
		const { cookies } = cookieJar({ [INITIAL_READER_COLUMNS_COOKIE]: '4', columns: 'b,a' });
		const available = [resource('a'), resource('b')];
		expect(resolveReaderWorkspace(cookies, available, workspaceFromColumns(['a'])).layout).toBe(
			'single'
		);
		expect(workspaceColumns(resolveReaderWorkspace(cookies, available, null))).toEqual(['b', 'a']);
	});

	it('still migrates an existing legacy column selection instead of applying the new default', () => {
		const { cookies } = cookieJar({ columns: 'second-bible,bible' });
		const resolved = resolveReaderWorkspace(
			cookies,
			[
				resource('bible'),
				resource('commentary', 'commentary'),
				resource('lexicon', 'lexicon'),
				resource('second-bible')
			],
			null,
			[]
		);

		expect(resolved.layout).toBe('columns-2');
		expect(resolved.tiles.map((tile) => tile.tabs[0]?.resourceId)).toEqual([
			'second-bible',
			'bible'
		]);
	});

	it('keeps a unique five-resource projection for older reader consumers', () => {
		const workspace = workspaceFromColumns(['a', 'b', 'c', 'd', 'e']);
		workspace.tiles[0]!.tabs.push({
			id: 'duplicate',
			resourceId: 'a',
			linkSet: null,
			reference: { book: 43, chapter: 1 },
			lookup: null,
			studyContext: null
		});
		expect(workspaceColumns(workspace)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});
});
