import { describe, expect, it, vi } from 'vitest';
import { error, fail, redirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { appAction, appBootstrap, appCookies, appPage } from './adapter';
import { resolveAppRoute, type AppPageModule } from './routes';

const origin = 'https://akribos.test';
const id = 'b5f284be-271b-4f93-9f9f-970700b6176c';

function cookieFixture() {
	const values = new Map<string, string>();
	const cookies: Cookies = {
		get: (name) => values.get(name),
		getAll: () => [...values].map(([name, value]) => ({ name, value })),
		set: vi.fn((name, value) => {
			values.set(name, value);
		}),
		delete: vi.fn((name) => {
			values.delete(name);
		}),
		serialize: (name, value) => `${name}=${value}`
	};
	return { values, cookies };
}

function event(
	path = '/notes',
	options: {
		action?: string;
		fields?: unknown;
		headers?: Record<string, string>;
		role?: 'admin' | 'user';
		body?: FormData;
	} = {}
): RequestEvent {
	const url = new URL(`/api/app/${options.action ? 'action' : 'page'}`, origin);
	url.searchParams.set('path', path);
	if (options.action) url.searchParams.set('action', options.action);
	const headers = new Headers({ 'x-akribos-app': '1', ...options.headers });
	let body: string | FormData | undefined;
	if (options.action) {
		body = options.body ?? JSON.stringify({ fields: options.fields ?? {} });
		if (!options.body && !headers.has('content-type'))
			headers.set('content-type', 'application/json');
	}
	return {
		url,
		request: new Request(url, { method: options.action ? 'POST' : 'GET', headers, body }),
		cookies: cookieFixture().cookies,
		locals: {
			user: options.role ? { id, role: options.role } : null,
			sessionId: options.role ? 'session-id' : null,
			readerBrowserTabId: id,
			apiAuth: null
		},
		params: {},
		route: { id: '/api/app/page' },
		setHeaders: vi.fn(),
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
}

function dependencies(module: AppPageModule, layout: Record<string, unknown> = {}) {
	return {
		loadLayout: vi.fn(async () => layout),
		resolveRoute: (path: string | null, base: string) => {
			const route = resolveAppRoute(path, base);
			return route ? { ...route, module: async () => module } : null;
		}
	};
}

describe('first-party route allowlist', () => {
	it.each([
		'https://evil.test/account',
		'//evil.test/account',
		'/\\evil.test',
		'/admin/../account',
		'/%2e%2e/account',
		'/help%2fadministration',
		'/api/v1/resources',
		'/healthz',
		'/unknown',
		'/account#fragment',
		'/account\n',
		'/help/%00',
		'/admin/backup/download'
	])('rejects unknown or ambiguous path %s', (path) => {
		expect(resolveAppRoute(path, origin)).toBeNull();
	});
	it('resolves canonical Reader, Strong, nested help and scoped document routes', () => {
		expect(resolveAppRoute('/Joh3,16?tab=1.1%3ASEEDDE%3AA%3AJoh3%2C16', origin)?.params).toEqual({
			reference: 'Joh3,16'
		});
		expect(resolveAppRoute('/G26/2', origin)?.params).toEqual({ strong: 'G26', page: '2' });
		expect(resolveAppRoute('/help/reader/navigation', origin)?.params).toEqual({
			topic: 'reader',
			article: 'navigation'
		});
		expect(resolveAppRoute(`/notes/${id}`, origin)?.actions).not.toContain('publish');
		expect(resolveAppRoute(`/workspaces/${id}`, origin)?.actions).toEqual(['default']);
	});
});

describe('app API request and role boundaries', () => {
	it.each<Record<string, string>>([
		{ 'x-akribos-app': '' },
		{ 'x-akribos-app': '2' },
		{ origin: 'https://evil.test' },
		{ origin: 'null' },
		{ 'sec-fetch-site': 'cross-site' }
	])('rejects incompatible and cross-site requests before loading data', async (headers) => {
		const deps = dependencies({ load: () => ({ secret: true }) });
		const result = await appPage(event('/notes', { headers }), deps);
		expect(result.status).toBeGreaterThanOrEqual(400);
		expect(deps.loadLayout).not.toHaveBeenCalled();
		expect(await result.json()).toMatchObject({ type: 'failure' });
	});
	it.each([undefined, 'user', 'admin'] as const)(
		'denies admin loads and writes for %s',
		async (role) => {
			const action = vi.fn();
			const deps = dependencies({ load: vi.fn(), actions: { delete: action } });
			const loaded = await appPage(event('/admin/resources', { role }), deps);
			const mutated = await appAction(event('/admin/resources', { role, action: 'delete' }), deps);
			expect(loaded.status).toBe(404);
			expect(mutated.status).toBe(404);
			expect(deps.loadLayout).not.toHaveBeenCalled();
			expect(action).not.toHaveBeenCalled();
		}
	);
	it('keeps even public source data private', async () => {
		const result = await appPage(
			event('/l/shared', { role: 'admin', headers: { origin } }),
			dependencies({
				load: ({ setHeaders }) => {
					setHeaders({ 'cache-control': 'public, max-age=3600' });
					return { resources: [] };
				}
			})
		);
		expect(result.status).toBe(200);
		expect(result.headers.get('cache-control')).toBe('private, no-store');
		expect(result.headers.get('vary')).toBe('Cookie');
	});
	it('retains the real document page authentication guard', async () => {
		const result = await appPage(event('/notes'), {
			resolveRoute: resolveAppRoute,
			loadLayout: async () => ({})
		});
		expect(await result.json()).toMatchObject({
			type: 'redirect',
			status: 303,
			location: '/login?redirectTo=%2Fnotes'
		});
	});
	it.each(['preview', 'confirm'])(
		'rejects guest import %s before reading its body',
		async (action) => {
			const source = event('/notes/import?kind=note', {
				action,
				fields: { invalid: { bodyMustNotBeParsed: true } }
			});
			const runAction = vi.fn();
			const result = await appAction(source, dependencies({ actions: { [action]: runAction } }));
			expect(await result.json()).toEqual({
				type: 'redirect',
				status: 303,
				location: '/login?redirectTo=%2Fnotes%2Fimport%3Fkind%3Dnote'
			});
			expect(source.request.bodyUsed).toBe(false);
			expect(runAction).not.toHaveBeenCalled();
		}
	);
	it('bootstrap includes protocol, canon and role-filtered navigation', async () => {
		const deps = dependencies({}, { readerResources: [{ id: 'SEEDDE' }] });
		const guest = await (await appBootstrap(event('/'), deps)).json();
		const admin = await (await appBootstrap(event('/', { role: 'admin' }), deps)).json();
		expect(guest.data.protocolVersion).toBe(1);
		expect(guest.data.books).toHaveLength(66);
		expect(guest.data.readerResources).toEqual([{ id: 'SEEDDE' }]);
		expect(guest.data.navigation.map((item: { id: string }) => item.id)).not.toContain('admin');
		expect(admin.data.navigation.map((item: { id: string }) => item.id)).not.toContain('admin');
	});
	it('excludes administration help for every identity and narrows help discovery only', async () => {
		const source = event('/help', { role: 'admin' });
		const deps = dependencies({ load: ({ locals }) => ({ audience: locals.user?.role }) });
		const result = await appPage(source, deps);
		expect(await result.json()).toMatchObject({ data: { audience: 'user' } });
		expect(source.locals.user?.role).toBe('admin');
		expect(resolveAppRoute('/help/administration', origin)).toBeNull();
		expect(resolveAppRoute('/help/administration/import', origin)).toBeNull();
	});
});

describe('app page and action protocol', () => {
	it('preserves source URL, route, params, inherited layout and browser-tab context', async () => {
		const result = await appPage(
			event(`/notes/${id}?returnTo=%2Fnotes`),
			dependencies(
				{
					load: async (source) => ({
						path: source.url.pathname,
						requestUrl: source.request.url,
						params: source.params,
						routeId: source.route.id,
						tab: source.locals.readerBrowserTabId,
						parentData: await source.parent(),
						createdAt: new Date('2026-01-02T03:04:05Z')
					})
				},
				{ layoutField: 'preserved' }
			)
		);
		expect(await result.json()).toEqual({
			type: 'success',
			status: 200,
			data: {
				_path: `/notes/${id}?returnTo=%2Fnotes`,
				layoutField: 'preserved',
				path: `/notes/${id}`,
				requestUrl: `${origin}/notes/${id}?returnTo=%2Fnotes`,
				params: { id },
				routeId: '/notes/[id]',
				tab: id,
				parentData: { layoutField: 'preserved' },
				createdAt: '2026-01-02T03:04:05.000Z'
			}
		});
	});
	it('turns repeated JSON strings into real form fields', async () => {
		const result = await appAction(
			event('/account', {
				action: 'profile',
				fields: { displayName: 'Leserin', tags: ['eins', 'zwei'] }
			}),
			dependencies({
				actions: {
					profile: async ({ request }) => {
						const form = await request.formData();
						return { name: form.get('displayName'), tags: form.getAll('tags'), url: request.url };
					}
				}
			})
		);
		expect(await result.json()).toEqual({
			type: 'success',
			status: 200,
			data: { name: 'Leserin', tags: ['eins', 'zwei'], url: `${origin}/account` }
		});
	});
	it('preserves uploaded files', async () => {
		const body = new FormData();
		body.append('file', new File(['# Notiz'], 'study.md', { type: 'text/markdown' }));
		const result = await appAction(
			event('/notes/import', { action: 'preview', role: 'user', body }),
			dependencies({
				actions: {
					preview: async ({ request }) => {
						const file = (await request.formData()).get('file') as File;
						return { name: file.name, content: await file.text() };
					}
				}
			})
		);
		expect(await result.json()).toMatchObject({
			type: 'success',
			data: { name: 'study.md', content: '# Notiz' }
		});
	});
	it('keeps validation failures and revisions instead of converting them to success', async () => {
		const result = await appAction(
			event('/notes', { action: 'create' }),
			dependencies({
				actions: { create: () => fail(409, { error: 'conflict', currentRevision: 7 }) }
			})
		);
		expect(result.status).toBe(409);
		expect(await result.json()).toEqual({
			type: 'failure',
			status: 409,
			data: { error: 'conflict', currentRevision: 7 }
		});
	});
	it('returns same-origin redirects as data and rejects an off-origin redirect', async () => {
		const good = await appAction(
			event('/notes', { action: 'create' }),
			dependencies({ actions: { create: () => redirect(303, `/notes/${id}`) } })
		);
		const bad = await appAction(
			event('/notes', { action: 'create' }),
			dependencies({ actions: { create: () => redirect(303, 'https://evil.test/') } })
		);
		expect(good.status).toBe(200);
		expect(await good.json()).toEqual({ type: 'redirect', status: 303, location: `/notes/${id}` });
		expect(bad.status).toBe(500);
	});
	it('returns thrown domain errors without weakening their HTTP status', async () => {
		const result = await appPage(
			event('/help/not-found'),
			dependencies({ load: () => error(404, 'Nicht gefunden') })
		);
		expect(result.status).toBe(404);
		expect(await result.json()).toMatchObject({
			type: 'failure',
			data: { message: 'Nicht gefunden' }
		});
	});
	it.each(['__proto__', 'constructor', 'unknown', 'delete'])(
		'rejects action %s outside the exact route allowlist',
		async (action) => {
			const operation = vi.fn();
			const result = await appAction(
				event('/account', { action }),
				dependencies({ actions: { [action]: operation } })
			);
			expect(result.status).toBe(404);
			expect(operation).not.toHaveBeenCalled();
		}
	);
	it('rejects nested JSON data and oversized bodies before invoking an action', async () => {
		const operation = vi.fn();
		const deps = dependencies({ actions: { profile: operation } });
		const invalid = await appAction(
			event('/account', { action: 'profile', fields: { displayName: { nested: true } } }),
			deps
		);
		const oversized = await appAction(
			event('/account', {
				action: 'profile',
				fields: { displayName: 'a'.repeat(2 * 1024 * 1024) }
			}),
			deps
		);
		expect(invalid.status).toBe(400);
		expect(oversized.status).toBe(413);
		expect(operation).not.toHaveBeenCalled();
	});
});

describe('native email challenge cookie isolation', () => {
	it('rewrites only the email challenge name/path and leaves session cookies intact', () => {
		const { cookies, values } = cookieFixture();
		values.set('email-login', 'web-challenge');
		values.set('app-email-login', 'native-challenge');
		const wrapped = appCookies(cookies);
		expect(wrapped.get('email-login')).toBe('native-challenge');
		wrapped.set('email-login', 'next-challenge', {
			path: '/login',
			httpOnly: true,
			sameSite: 'lax',
			secure: true
		});
		expect(cookies.set).toHaveBeenCalledWith('app-email-login', 'next-challenge', {
			path: '/api/app',
			httpOnly: true,
			sameSite: 'lax',
			secure: true
		});
		wrapped.set('session', 'session-token', { path: '/', httpOnly: true });
		expect(cookies.set).toHaveBeenCalledWith('session', 'session-token', {
			path: '/',
			httpOnly: true
		});
		wrapped.delete('email-login', { path: '/login' });
		expect(cookies.delete).toHaveBeenCalledWith('app-email-login', { path: '/api/app' });
		expect(values.get('email-login')).toBe('web-challenge');
	});
});
