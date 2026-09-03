import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { workspaceFromColumns } from '$lib/reader/workspace';
import type { ReadableResource } from './repositories/resources.ts';
import {
	readReaderWorkspaceCookie,
	resolveReaderWorkspace,
	workspaceColumns,
	writeReaderWorkspace
} from './reader-workspace.ts';

function resource(id: string): ReadableResource {
	return {
		id,
		kind: 'bible',
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
		workspace.layoutSizes['columns-2'] = { columns: [0.65, 0.35], rows: [1] };
		expect(writeReaderWorkspace(cookies, workspace)).toBe(true);
		expect(readReaderWorkspaceCookie(cookies)).toEqual(workspace);
	});

	it('uses the signed-in account copy before a stale device cookie', () => {
		const { cookies } = cookieJar();
		writeReaderWorkspace(cookies, workspaceFromColumns(['a']));
		const resolved = resolveReaderWorkspace(
			cookies,
			['a', 'b'].map(resource),
			workspaceFromColumns(['b']),
			[]
		);
		expect(resolved.tiles[0]?.tabs[0]?.resourceId).toBe('b');
	});

	it('keeps a unique five-resource projection for older reader consumers', () => {
		const workspace = workspaceFromColumns(['a', 'b', 'c', 'd', 'e']);
		workspace.tiles[0]!.tabs.push({
			id: 'duplicate',
			resourceId: 'a',
			linkSet: null,
			reference: { book: 43, chapter: 1 },
			lookup: null
		});
		expect(workspaceColumns(workspace)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});
});
