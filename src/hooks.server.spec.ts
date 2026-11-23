import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: { marker: 'hooks-cache-test-db' },
	resolveSession: vi.fn(),
	recordWebVisit: vi.fn(),
	authenticateApiRequest: vi.fn(),
	checkApiRateLimit: vi.fn(),
	loggerWarn: vi.fn()
}));

vi.mock('$lib/server/db', () => ({ getDb: () => mocks.db }));
vi.mock('$lib/server/auth/session', () => ({
	resolveSession: mocks.resolveSession,
	pruneExpiredSessions: vi.fn()
}));
vi.mock('$lib/server/repositories/users', () => ({ recordWebVisit: mocks.recordWebVisit }));
vi.mock('$lib/server/api/gate', () => ({ authenticateApiRequest: mocks.authenticateApiRequest }));
vi.mock('$lib/server/api/rate-limit', () => ({
	checkApiRateLimit: mocks.checkApiRateLimit,
	KEYED_LIMIT: { requests: 60, windowSeconds: 60 },
	TRUSTED_LIMIT: { requests: 600, windowSeconds: 60 }
}));
vi.mock('$lib/server/import/jobs', () => ({ failInterruptedJobs: vi.fn() }));
vi.mock('$lib/server/backup/jobs', () => ({
	cleanStaleStagedFiles: vi.fn(),
	failInterruptedBackupJobs: vi.fn()
}));
vi.mock('$lib/server/backup/scheduler', () => ({ startBackupScheduler: vi.fn() }));
vi.mock('$lib/server/logger', () => ({ logger: { warn: mocks.loggerWarn } }));

import { handle } from './hooks.server.ts';

function event(pathname = '/api/v1/bibles/SEEDDE/40/3', headers: Record<string, string> = {}) {
	const url = new URL(pathname, 'https://example.test');
	return {
		url,
		request: new Request(url, { headers: { 'sec-fetch-site': 'same-origin', ...headers } }),
		route: { id: pathname },
		isDataRequest: pathname.endsWith('/__data.json'),
		isSubRequest: false,
		cookies: {},
		locals: { user: null, sessionId: null, apiAuth: null },
		getClientAddress: () => '127.0.0.1'
	};
}

beforeEach(() => {
	mocks.resolveSession.mockReset();
	mocks.recordWebVisit.mockReset();
	mocks.authenticateApiRequest.mockReset();
	mocks.checkApiRateLimit.mockReset();
	mocks.loggerWarn.mockReset();
	mocks.authenticateApiRequest.mockResolvedValue({
		ok: true,
		auth: { kind: 'trusted' },
		rateLimitSubject: 'ip:127.0.0.1'
	});
	mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
});

describe('authenticated website visits', () => {
	const navigation = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
	const resolve = async (status = 200) =>
		new Response('<html></html>', { status, headers: { 'content-type': 'text/html' } });

	it('records a successful authenticated top-level browser document', async () => {
		mocks.resolveSession.mockResolvedValue({ sessionId: 'session-id', user: { id: 'user-id' } });
		const result = await handle({
			event: event('/Joh1', navigation) as never,
			resolve: () => resolve()
		});
		expect(result.status).toBe(200);
		expect(mocks.recordWebVisit).toHaveBeenCalledExactlyOnceWith(mocks.db, 'user-id');
	});

	it.each<{ path: string; headers: Record<string, string>; status?: number }>([
		{ path: '/Joh1', headers: navigation, status: 404 },
		{ path: '/Joh1', headers: { ...navigation, 'sec-purpose': 'prefetch;prerender' } },
		{ path: '/Joh1', headers: { ...navigation, 'sec-fetch-dest': 'iframe' } },
		{ path: '/Joh1', headers: { ...navigation, 'x-akribos-app': '1' } },
		{ path: '/Joh1', headers: {} },
		{ path: '/Joh1/__data.json', headers: navigation },
		{ path: '/api/app/page', headers: navigation },
		{ path: '/app/editor/abc', headers: navigation }
	])(
		'ignores background, native or unsuccessful requests ($path $headers $status)',
		async ({ path, headers, status }) => {
			mocks.resolveSession.mockResolvedValue({ sessionId: 'session-id', user: { id: 'user-id' } });
			await handle({ event: event(path, headers) as never, resolve: () => resolve(status) });
			expect(mocks.recordWebVisit).not.toHaveBeenCalled();
		}
	);

	it('never records a signed-out reader', async () => {
		await handle({ event: event('/Joh1', navigation) as never, resolve: () => resolve() });
		expect(mocks.recordWebVisit).not.toHaveBeenCalled();
	});

	it('does not count a server-side subrequest', async () => {
		mocks.resolveSession.mockResolvedValue({ sessionId: 'session-id', user: { id: 'user-id' } });
		const source = { ...event('/Joh1', navigation), isSubRequest: true };
		await handle({ event: source as never, resolve: () => resolve() });
		expect(mocks.recordWebVisit).not.toHaveBeenCalled();
	});
});

describe('response cache privacy guard', () => {
	it('overrides a public Bible response after resolving an authenticated session', async () => {
		mocks.resolveSession.mockResolvedValue({
			sessionId: 'session-id',
			user: { id: 'user-id', role: 'user' }
		});
		const response = await handle({
			event: event() as never,
			resolve: vi.fn(
				async () =>
					new Response('{}', { headers: { 'cache-control': 'public, max-age=60, s-maxage=3600' } })
			)
		});

		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('preserves public caching for the same cookie-free Bible response', async () => {
		mocks.resolveSession.mockResolvedValue(undefined);
		const response = await handle({
			event: event() as never,
			resolve: vi.fn(
				async () =>
					new Response('{}', { headers: { 'cache-control': 'public, max-age=60, s-maxage=3600' } })
			)
		});

		expect(response.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600');
	});

	it('protects the early admin not-found response for a signed-in non-admin', async () => {
		mocks.resolveSession.mockResolvedValue({
			sessionId: 'session-id',
			user: { id: 'user-id', role: 'user' }
		});
		const resolve = vi.fn();
		const response = await handle({ event: event('/admin') as never, resolve });

		expect(response.status).toBe(404);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('protects an early v1 gate error after an authenticated session was resolved', async () => {
		mocks.resolveSession.mockResolvedValue({
			sessionId: 'session-id',
			user: { id: 'user-id', role: 'user' }
		});
		mocks.authenticateApiRequest.mockResolvedValue({
			ok: false,
			status: 401,
			code: 'missing_api_key'
		});
		const resolve = vi.fn();
		const response = await handle({ event: event() as never, resolve });

		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(resolve).not.toHaveBeenCalled();
	});
});
