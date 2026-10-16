import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from './hooks.client';

const initialize = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('$lib/reader/browser-tab', () => ({ initializeReaderBrowserTab: initialize }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('client startup', () => {
	it('leaves browser identity and resume untouched in the embedded editor', async () => {
		vi.stubGlobal('location', { pathname: '/app/editor/document' });
		await init();
		expect(initialize).not.toHaveBeenCalled();
	});
	it('keeps ordinary reader startup', async () => {
		vi.stubGlobal('location', { pathname: '/Joh1' });
		await init();
		expect(initialize).toHaveBeenCalledOnce();
	});
});
