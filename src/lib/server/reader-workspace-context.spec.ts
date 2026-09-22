import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { restoreSavedWorkspace } from '$lib/reader/saved-workspaces';
import {
	readActiveReaderWorkspaceHint,
	readWorkspaceVersion,
	readerWorkspaceBibleColumns,
	resolveReaderWorkspaceContext,
	type ReaderWorkspaceContext
} from './reader-workspace-context';

const mock = vi.hoisted(() => ({ active: vi.fn(), bootstrap: vi.fn(), resources: vi.fn() }));
vi.mock('./db', () => ({ getDb: () => ({}) }));
vi.mock('./repositories/resources', () => ({ listReaderResources: mock.resources }));
vi.mock('./repositories/saved-reader-workspaces', async (original) => ({
	...(await original<typeof import('./repositories/saved-reader-workspaces')>()),
	getActiveReaderWorkspace: mock.active,
	ensureDefaultReaderWorkspace: mock.bootstrap
}));
const id = 'b8799f3b-826d-4355-8b9f-52046217d526';
const owner = '0e8a6a41-d66a-456a-9cd2-bf77268682b8';
function cookies(values: Record<string, string>): Cookies {
	return { get: (key: string) => values[key] } as Cookies;
}
const restored = restoreSavedWorkspace(
	{
		readerState:
			'layout=columns-2&tab=1.1:SEEDDE:A:Joh3,16&tab=2.1:SEEDDE:B:Mt16&active=1.1&active=2.1&focus=1&search=1.1:Liebe&notesQuery=Gedanke',
		layoutSizes: {}
	},
	['SEEDDE']
)!;
function context() {
	return {
		workspace: restored.workspace,
		snapshot: restored.snapshot,
		activeSaved: { id, snapshot: restored.snapshot, selectionVersion: 2, contentVersion: 5 },
		selection: {
			activeSavedWorkspaceId: id,
			activeSavedWorkspaceVersion: 2,
			activeSavedWorkspaceContentVersion: 5
		}
	} as ReaderWorkspaceContext;
}
beforeEach(() => vi.clearAllMocks());

describe('Reader request context and selection boundaries', () => {
	it('accepts only positive safe integer versions', () => {
		expect([1, '2', Number.MAX_SAFE_INTEGER].map(readWorkspaceVersion)).toEqual([
			1,
			2,
			Number.MAX_SAFE_INTEGER
		]);
		for (const value of [
			null,
			undefined,
			'',
			'01',
			0,
			-1,
			1.2,
			'1.0',
			'1e3',
			' 1',
			true,
			{},
			Infinity,
			Number.MAX_SAFE_INTEGER + 1
		])
			expect(readWorkspaceVersion(value)).toBeNull();
	});
	it('uses a remembered workspace only for the same account and a valid UUID', () => {
		expect(
			readActiveReaderWorkspaceHint(cookies({ 'reader-active-workspace': `${owner}:${id}` }), owner)
		).toBe(id);
		for (const value of [`other:${id}`, `${owner}:bad`, `${owner}:${id}:extra`])
			expect(
				readActiveReaderWorkspaceHint(cookies({ 'reader-active-workspace': value }), owner)
			).toBeNull();
	});
	it('uses the selected snapshot for auxiliary Bible views despite stale cookies and legacy columns', async () => {
		const bibles = [
			{ id: 'SEEDDE', kind: 'bible' },
			{ id: 'OTHER', kind: 'bible' }
		] as Parameters<typeof readerWorkspaceBibleColumns>[1];
		mock.resources.mockResolvedValue(bibles);
		mock.active.mockResolvedValue(context().activeSaved);
		const event = {
			cookies: cookies({ columns: 'OTHER' }),
			locals: {
				user: { id: owner, readerWorkspace: null, readerColumns: ['OTHER'] },
				sessionId: 'session'
			} as App.Locals
		};
		const resolved = await resolveReaderWorkspaceContext(event);
		expect(readerWorkspaceBibleColumns(resolved, bibles)).toEqual(['SEEDDE']);
		// The chosen workspace cannot reinstate a resource missing from the current readable set.
		expect(readerWorkspaceBibleColumns(resolved, [bibles[1]!])).toEqual(['OTHER']);
	});
	it('shares one bootstrap promise and selection snapshot between parallel layout and reader loads', async () => {
		mock.resources.mockResolvedValue([
			{ id: 'SEEDDE', kind: 'bible', sortOrder: 1, status: 'ready' }
		]);
		mock.active.mockResolvedValue(null);
		mock.bootstrap.mockResolvedValue(context().activeSaved);
		const event = {
			cookies: cookies({ 'reader-initial-columns': '2' }),
			locals: {
				user: { id: owner, readerWorkspace: restored.workspace, readerColumns: ['SEEDDE'] },
				sessionId: 'session'
			} as App.Locals
		};
		const layout = resolveReaderWorkspaceContext(event);
		const reader = resolveReaderWorkspaceContext(event);
		expect(layout).toBe(reader);
		const [a, b] = await Promise.all([layout, reader]);
		expect(a).toBe(b);
		expect(a.selection).toEqual(context().selection);
		expect(mock.bootstrap).toHaveBeenCalledTimes(1);
		expect(mock.active).toHaveBeenCalledTimes(1);
	});
});
