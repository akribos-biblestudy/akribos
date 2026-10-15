import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { workspaceFromColumns, type ReaderWorkspace } from '$lib/reader/workspace';
import { decodeReaderUrlState, encodeReaderUrlState } from '$lib/reader/url-state';
import { appAction, appBootstrap, appPage } from './adapter';
import { requireWorkspaceUser } from '../saved-reader-workspaces';
import {
	GET as listWorkspaces,
	POST as createWorkspace
} from '../../../routes/api/reader/workspaces/+server';
import {
	PATCH as updateWorkspace,
	DELETE as deleteWorkspace
} from '../../../routes/api/reader/workspaces/[id]/+server';
import { PUT as saveView } from '../../../routes/api/reader/workspaces/[id]/view/+server';
import { POST as followWorkspace } from '../../../routes/api/reader/workspaces/[id]/follow/+server';

const mock = vi.hoisted(() => ({
	resources: vi.fn(),
	bibles: vi.fn(),
	active: vi.fn(),
	bootstrap: vi.fn(),
	browser: vi.fn(),
	list: vi.fn(),
	get: vi.fn(),
	activate: vi.fn(),
	change: vi.fn(),
	view: vi.fn(),
	follow: vi.fn(),
	update: vi.fn(),
	font: vi.fn()
}));
vi.mock('../db', () => ({ getDb: () => ({}) }));
vi.mock('../repositories/resources', () => ({
	listReaderResources: mock.resources,
	listBibles: mock.bibles,
	chapterCount: async () => 21,
	bookCoverage: async () =>
		new Map([
			['BIBLE', new Set([43])],
			['OTHER', new Set([43])]
		])
}));
vi.mock('../repositories/saved-reader-workspaces', async (original) => ({
	...(await original<typeof import('../repositories/saved-reader-workspaces')>()),
	getActiveReaderWorkspace: mock.active,
	ensureDefaultReaderWorkspace: mock.bootstrap,
	getBrowserTabReaderWorkspace: mock.browser,
	listSavedReaderWorkspaces: mock.list,
	getSavedReaderWorkspace: mock.get,
	activateSavedReaderWorkspace: mock.activate,
	changeSavedReaderWorkspace: mock.change,
	saveActiveWorkspaceView: mock.view,
	followSharedWorkspacePositions: mock.follow
}));
vi.mock('../repositories/users', () => ({
	updateReaderWorkspace: mock.update,
	updateReaderFontScale: mock.font
}));
vi.mock('../analytics/settings', () => ({
	readAnalyticsSettings: async () => ({ enabled: false })
}));
vi.mock('../reader-chapter', () => ({ loadReaderTabChapter: async () => ({ verses: [] }) }));
vi.mock('../repositories/verse-lists', () => ({ listVerseLists: async () => [] }));
vi.mock('../repositories/highlight-styles', () => ({ listHighlightStyles: async () => [] }));

const origin = 'https://akribos.test';
const owner = '0e8a6a41-d66a-456a-9cd2-bf77268682b8';
const savedId = 'b8799f3b-826d-4355-8b9f-52046217d526';
const browserWorkspace = workspaceFromColumns(['OTHER'], { book: 1, chapter: 2 });
const defaultWorkspace = workspaceFromColumns(['BIBLE']);
const exactState = encodeReaderUrlState(defaultWorkspace);
const foreignState = encodeReaderUrlState(workspaceFromColumns(['OTHER', 'BIBLE']));
const snapshots = [undefined, exactState, foreignState];

function event(
	path = '/Joh1',
	options: {
		guest?: boolean;
		action?: string;
		fields?: Record<string, string>;
		headers?: Record<string, string>;
	} = {}
): RequestEvent {
	const url = new URL(`/api/app/${options.action ? 'action' : 'page'}`, origin);
	url.searchParams.set('path', path);
	if (options.action) url.searchParams.set('action', options.action);
	const values = new Map(
		Object.entries({
			location: '1.Mose2',
			columns: 'OTHER',
			'reader-initial-columns': '4',
			'reader-active-workspace': `${owner}:${savedId}`,
			'reader-browser-enabled': '1'
		})
	);
	const cookies: Cookies = {
		get: (name) => values.get(name),
		getAll: () => [...values].map(([name, value]) => ({ name, value })),
		set: vi.fn((name, value) => {
			values.set(name, value);
		}),
		delete: vi.fn(),
		serialize: (name, value) => `${name}=${value}`
	};
	return {
		url,
		request: new Request(url, {
			method: options.action ? 'POST' : 'GET',
			headers: {
				'x-akribos-app': '1',
				'x-akribos-reader-mode': 'local',
				origin,
				...(options.action ? { 'content-type': 'application/json' } : {}),
				...options.headers
			},
			...(options.action ? { body: JSON.stringify({ fields: options.fields ?? {} }) } : {})
		}),
		cookies,
		locals: {
			user: options.guest
				? null
				: {
						id: owner,
						role: 'user',
						readerWorkspace: browserWorkspace,
						readerColumns: ['OTHER'],
						readerFontScale: 125,
						theme: 'dark',
						defaultBibleId: 'OTHER'
					},
			sessionId: options.guest ? null : 'session',
			readerBrowserTabId: savedId,
			apiAuth: null
		},
		params: {},
		route: { id: '/api/app/page' },
		setHeaders: vi.fn(),
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
}

function expectNoWorkspaceAccess(source?: RequestEvent) {
	for (const method of [
		mock.active,
		mock.bootstrap,
		mock.browser,
		mock.list,
		mock.get,
		mock.activate,
		mock.change,
		mock.view,
		mock.follow,
		mock.update
	]) {
		expect(method).not.toHaveBeenCalled();
	}
	if (source) {
		const names = vi.mocked(source.cookies.set).mock.calls.map(([name]) => name);
		expect(names).not.toEqual(expect.arrayContaining(['reader-workspace']));
		for (const name of [
			'reader-workspace',
			'columns',
			'reader_columns',
			'reader-active-workspace',
			'location'
		]) {
			expect(names).not.toContain(name);
		}
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	const bibles = [
		{ id: 'BIBLE', kind: 'bible', sortOrder: 1, status: 'ready' },
		{ id: 'OTHER', kind: 'bible', sortOrder: 2, status: 'ready' }
	];
	mock.bibles.mockResolvedValue(bibles);
	mock.resources.mockResolvedValue([
		{ id: 'COMMENT', kind: 'commentary', sortOrder: 0 },
		...bibles
	]);
});

describe('native local Reader mode', () => {
	it('bootstrap ignores legacy/cookie/previously resolved browser state and retains identity/preferences', async () => {
		const source = event('/');
		source.locals.readerWorkspaceContext = Promise.resolve({
			workspace: browserWorkspace
		} as never);
		const result = await (await appBootstrap(source)).json();
		expect(result.type).toBe('success');
		expect(result.data.workspace).toEqual(defaultWorkspace);
		expect(result.data.savedWorkspaces).toEqual([]);
		expect(result.data).toMatchObject({
			activeSavedWorkspaceId: null,
			activeSavedWorkspaceVersion: null,
			activeSavedWorkspaceContentVersion: null,
			initializeReaderWorkspace: false,
			readerFontScale: 125,
			theme: 'dark',
			defaultBibleId: 'OTHER',
			user: { id: owner, role: 'user', readerWorkspace: null, readerColumns: [] }
		});
		expect(source.locals.user?.readerWorkspace).toEqual(browserWorkspace);
		expect(source.locals.localReader).toBeUndefined();
		expect(mock.resources).toHaveBeenCalledWith({}, owner);
		expectNoWorkspaceAccess(source);
	});
	it('root does not resume the browser location cookie', async () => {
		const source = event('/');
		expect(await (await appPage(source)).json()).toMatchObject({
			type: 'redirect',
			location: '/Joh1'
		});
		expectNoWorkspaceAccess(source);
	});
	it.each([false, true])('GETs never initialize or save a workspace (guest=%s)', async (guest) => {
		for (const snapshot of snapshots) {
			const source = event(`/Joh1${snapshot ? `?${snapshot}` : ''}`, { guest });
			let result = await (await appPage(source)).json();
			if (result.type === 'redirect')
				result = await (await appPage(event(result.location, { guest }))).json();
			expect(result.type).toBe('success');
			expect(result.data.readerWorkspaceDetached).toBe(true);
			expect(result.data.activeSavedWorkspaceId).toBeNull();
			expect(mock.resources).toHaveBeenCalledWith({}, guest ? undefined : owner);
			expectNoWorkspaceAccess(source);
		}
	});
	it.each(['setLayout', 'setLayoutSize', 'addTab'])(
		'%s remains local with missing, matching or different snapshots and forged persistence fields',
		async (action) => {
			for (const snapshot of snapshots) {
				const workspace = snapshot
					? (decodeReaderUrlState(new URLSearchParams(snapshot))!.workspace as ReaderWorkspace)
					: defaultWorkspace;
				const path = `/Joh1?${snapshot ?? ''}&workspaceDetached=false&workspaceId=${savedId}&workspaceVersion=1&workspaceContentVersion=1`;
				const source = event(path, {
					action,
					fields: {
						layout: 'columns-2',
						columns: '0.3,0.7',
						rows: '1',
						tileId: workspace.tiles[0]!.id,
						resource: 'OTHER'
					}
				});
				const result = await (await appAction(source)).json();
				expect(result).toMatchObject({
					type: 'success',
					data: {
						success: true,
						saved: false,
						reason: 'detached',
						activeSavedWorkspaceId: null
					}
				});
				expect(decodeReaderUrlState(new URLSearchParams(result.data.readerState))).not.toBeNull();
				expectNoWorkspaceAccess(source);
			}
		}
	);
	it('keeps resource checks and personal-action authentication', async () => {
		const denied = event(`/Joh1?${exactState}`, {
			action: 'addTab',
			fields: { tileId: 'url-tile-1', resource: 'REVOKED' }
		});
		expect(await (await appAction(denied)).json()).toMatchObject({
			type: 'failure',
			status: 400,
			data: { error: 'resource' }
		});
		const guest = event('/Joh1', {
			guest: true,
			action: 'setHighlight',
			fields: { reference: 'Joh1,1', styleId: 'style' }
		});
		expect(await (await appAction(guest)).json()).toMatchObject({
			type: 'redirect',
			location: '/login'
		});
		expectNoWorkspaceAccess();
	});
	it.each([undefined, 'default'])(
		'rejects named workspace page/action before execution (%s)',
		async (action) => {
			const source = event(`/workspaces/${savedId}`, { action });
			const response = await (action ? appAction(source) : appPage(source));
			expect(response.status).toBe(404);
			expect(source.request.bodyUsed).toBe(false);
			expectNoWorkspaceAccess(source);
		}
	);
	it.each([
		['GET', listWorkspaces],
		['POST', createWorkspace],
		['PATCH', updateWorkspace],
		['DELETE', deleteWorkspace],
		['PUT', saveView],
		['POST', followWorkspace]
	] as const)('rejects named workspace REST %s before body parsing', async (method, handler) => {
		const source = event('/');
		source.request = new Request(`${origin}/api/reader/workspaces/${savedId}`, {
			method,
			headers: source.request.headers,
			...(method === 'GET' ? {} : { body: 'must not be parsed' })
		});
		source.params = { id: savedId };
		await expect(handler(source as never)).rejects.toMatchObject({ status: 403 });
		expect(source.request.bodyUsed).toBe(false);
		expectNoWorkspaceAccess(source);
	});
	it('does not change legacy workspace access or allow anonymous access through the header', () => {
		const legacy = event('/', { headers: { 'x-akribos-reader-mode': '' } });
		expect(requireWorkspaceUser(legacy)).toBe(owner);
		const noProtocol = event('/', { headers: { 'x-akribos-app': '' } });
		expect(requireWorkspaceUser(noProtocol)).toBe(owner);
		expect(() => requireWorkspaceUser(event('/', { guest: true }))).toThrow(
			expect.objectContaining({ status: 401 })
		);
	});
	it('rejects local mode with an unsupported app protocol before layout or resource access', async () => {
		const source = event('/', { headers: { 'x-akribos-app': '2' } });
		expect((await appBootstrap(source)).status).toBe(400);
		expect(mock.resources).not.toHaveBeenCalled();
		expectNoWorkspaceAccess(source);
	});
});
