import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { load } from './+layout.server';

const calls = vi.hoisted(() => ({
	db: vi.fn(),
	resources: vi.fn(),
	workspaces: vi.fn(),
	context: vi.fn(),
	analytics: vi.fn()
}));
vi.mock('$lib/server/db', () => ({ getDb: calls.db }));
vi.mock('$lib/server/repositories/resources', () => ({ listBibles: calls.resources }));
vi.mock('$lib/server/repositories/saved-reader-workspaces', () => ({
	listSavedReaderWorkspaces: calls.workspaces
}));
vi.mock('$lib/server/reader-workspace-context', () => ({
	resolveReaderWorkspaceContext: calls.context
}));
vi.mock('$lib/server/analytics/settings', () => ({ readAnalyticsSettings: calls.analytics }));

describe('embedded editor root layout isolation', () => {
	beforeEach(() => vi.clearAllMocks());
	it.each(['', '/__data.json'])('does not read or mutate browser workspaces%s', async (suffix) => {
		const cookieWrite = vi.fn();
		const user = {
			id: 'owner',
			readerWorkspace: { privateBrowserLayout: true },
			readerColumns: ['BROWSER_ONLY'],
			readerFontScale: 125,
			theme: 'dark'
		} as unknown as App.Locals['user'];
		const result = await load({
			cookies: {
				get: () => undefined,
				set: cookieWrite,
				delete: cookieWrite
			} as unknown as Cookies,
			locals: { user, sessionId: 'session' },
			url: new URL(`https://akribos.test/app/editor/document${suffix}`)
		} as Parameters<typeof load>[0]);
		expect(result.appEditor).toBe(true);
		expect(result.user?.readerWorkspace).toBeNull();
		expect(result.user?.readerColumns).toEqual([]);
		expect(user?.readerColumns).toEqual(['BROWSER_ONLY']);
		expect(result.savedWorkspaces).toEqual([]);
		expect(result.activeSavedWorkspaceId).toBeNull();
		expect(result.analytics.enabled).toBe(false);
		expect(result.readerFontScale).toBe(125);
		expect(cookieWrite).not.toHaveBeenCalled();
		for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
	});
});
