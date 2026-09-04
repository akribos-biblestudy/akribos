import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: { marker: 'hooks-cache-test-db' },
	resolveSession: vi.fn(),
	authenticateApiRequest: vi.fn(),
	checkApiRateLimit: vi.fn(),
	loggerWarn: vi.fn()
}));

vi.mock('$lib/server/db', () => ({ getDb: () => mocks.db }));
vi.mock('$lib/server/auth/session', () => ({
	resolveSession: mocks.resolveSession,
	pruneExpiredSessions: vi.fn()
}));
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

function event(pathname = '/api/v1/bibles/SEEDDE/40/3') {
	const url = new URL(pathname, 'https://example.test');
	return {
		url,
		request: new Request(url, { headers: { 'sec-fetch-site': 'same-origin' } }),
		cookies: {},
		locals: { user: null, sessionId: null, apiAuth: null },
		getClientAddress: () => '127.0.0.1'
	};
}

beforeEach(() => {
	mocks.resolveSession.mockReset();
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
