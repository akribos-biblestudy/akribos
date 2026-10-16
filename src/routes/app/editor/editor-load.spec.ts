import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './[id]/+page.server';

const mocks = vi.hoisted(() => ({ db: vi.fn(() => ({})), document: vi.fn(), bibles: vi.fn() }));
vi.mock('$lib/server/db', () => ({ getDb: mocks.db }));
vi.mock('$lib/server/repositories/documents', () => ({ getDocument: mocks.document }));
vi.mock('$lib/server/repositories/resources', () => ({ listBibles: mocks.bibles }));
const id = 'd6a404c4-81c2-4e0b-bf4d-3801f991381e';
const instanceId = '3f275b91-bb2e-41ef-9c19-8312683f8d37';
function event(user: App.Locals['user'], query = `instanceId=${instanceId}`) {
	return {
		params: { id },
		locals: { user },
		url: new URL(`https://akribos.test/app/editor/${id}?${query}`),
		setHeaders: vi.fn()
	} as unknown as Parameters<typeof load>[0];
}
const user = { id: 'owner', defaultBibleId: 'private' } as App.Locals['user'];
describe('native editor page access', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.bibles.mockResolvedValue([{ id: 'public' }]);
	});
	it('requires a real account before any repository lookup', async () => {
		const request = event(null);
		await expect(load(request)).rejects.toMatchObject({ status: 401 });
		expect(mocks.db).not.toHaveBeenCalled();
		expect(request.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});
	it('requires a valid per-WebView instance identifier', async () => {
		await expect(load(event(user, 'instanceId=old'))).rejects.toMatchObject({ status: 400 });
		expect(mocks.db).not.toHaveBeenCalled();
	});
	it('checks ownership and does not expose another account document', async () => {
		mocks.document.mockResolvedValue(null);
		await expect(load(event(user))).rejects.toMatchObject({ status: 404 });
		expect(mocks.document).toHaveBeenCalledWith({}, 'owner', id);
		expect(mocks.bibles).not.toHaveBeenCalled();
	});
	it('returns only authorized quotation resources and bounded appearance with a private CSP', async () => {
		mocks.document.mockResolvedValue({ id, title: 'Test', revision: 2 });
		const request = event(
			user,
			`instanceId=${instanceId}&bible=private&fontScale=999&theme=dark&eInk=1`
		);
		await expect(load(request)).resolves.toMatchObject({
			instanceId,
			editorUserId: 'owner',
			bibleId: 'public',
			editorAppearance: { fontScale: 100, theme: 'dark', eInk: true }
		});
		expect(request.setHeaders).toHaveBeenCalledWith(
			expect.objectContaining({
				'content-security-policy': expect.stringContaining("connect-src 'self'")
			})
		);
	});
});
