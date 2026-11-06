import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rate: vi.fn(),
	snapshot: vi.fn(),
	json: vi.fn(),
	usx: vi.fn()
}));
vi.mock('$lib/server/db', () => ({ getDb: () => ({}) }));
vi.mock('$lib/server/api/rate-limit', () => ({ checkApiRateLimit: mocks.rate }));
vi.mock('$lib/server/bible-export/snapshot', () => ({
	bibleSnapshot: mocks.snapshot,
	bibleSnapshotResponse: mocks.json
}));
vi.mock('$lib/server/bible-export/usx', () => ({ usxResponse: mocks.usx }));

import { GET } from './+server';

function event(format = '') {
	const url = new URL(`https://akribos.invalid/downloads/BIBLE${format}`);
	return {
		params: { id: 'BIBLE' },
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as Parameters<typeof GET>[0];
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.rate.mockResolvedValue({ allowed: true, retryAfterSeconds: 60 });
	mocks.snapshot.mockResolvedValue({ resource: { id: 'BIBLE' } });
	mocks.json.mockImplementation(() => new Response('json'));
	mocks.usx.mockImplementation(() => new Response('usx'));
});

describe('public download route', () => {
	it('applies the rate limit before checking public access and supports both formats', async () => {
		expect(await (await GET(event())).text()).toBe('json');
		expect(await (await GET(event('?format=usx'))).text()).toBe('usx');
		expect(mocks.rate).toHaveBeenCalledWith(expect.anything(), 'bible-download:ip:127.0.0.1', 20);
		expect(mocks.snapshot).toHaveBeenCalledWith(expect.anything(), 'BIBLE', true);
		mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
		const denied = await GET(event());
		expect(denied.status).toBe(429);
		expect(denied.headers.get('retry-after')).toBe('60');
		expect(mocks.snapshot).toHaveBeenCalledTimes(2);
	});

	it('rejects an unavailable Bible and frees the slot', async () => {
		mocks.snapshot.mockResolvedValueOnce(null);
		await expect(GET(event())).rejects.toMatchObject({ status: 404 });
		expect(await (await GET(event())).text()).toBe('json');
	});

	it('bounds concurrent JSON and USX builds with a shared limit', async () => {
		const finish: Array<(snapshot: unknown) => void> = [];
		mocks.snapshot.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
		const first = GET(event());
		const second = GET(event('?format=usx'));
		await vi.waitFor(() => expect(finish).toHaveLength(2));
		const busy = await GET(event());
		expect(busy.status).toBe(503);
		expect(busy.headers.get('retry-after')).toBe('30');
		finish.forEach((resolve) => resolve({ resource: { id: 'BIBLE' } }));
		expect(await (await first).text()).toBe('json');
		expect(await (await second).text()).toBe('usx');
	});
});
