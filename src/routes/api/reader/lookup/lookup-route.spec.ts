import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: {}, resources: vi.fn(), entry: vi.fn() }));
vi.mock('$lib/server/db', () => ({ getDb: () => mocks.db }));
vi.mock('$lib/server/repositories/resources', () => ({ listReaderResources: mocks.resources }));
vi.mock('$lib/server/repositories/strong', () => ({ findLexiconEntry: mocks.entry }));
import { GET } from './+server.ts';

function event(query: string, userId?: string) {
	return {
		url: new URL(`https://akribos.test/api/reader/lookup?${query}`),
		locals: { user: userId ? { id: userId } : null },
		setHeaders: vi.fn()
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.resources.mockResolvedValue([{ id: 'LEX', kind: 'lexicon' }]);
});

describe('Reader dictionary lookup', () => {
	it.each(['G26', 'agape', 'ἀγάπη'])(
		'resolves %s only within the explicit dictionary',
		async (query) => {
			const entry = { strong: 'G26', lemma: 'ἀγάπη', definitionHtml: '<p>Liebe</p>' };
			mocks.entry.mockResolvedValue(entry);
			const request = event(`resource=LEX&q=${encodeURIComponent(query)}`);
			const response = await GET(request as never);
			expect(await response.json()).toEqual({ resourceId: 'LEX', query, entry });
			expect(mocks.resources).toHaveBeenCalledWith(mocks.db, undefined);
			expect(mocks.entry).toHaveBeenCalledWith(mocks.db, 'LEX', query, undefined);
			expect(request.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
		}
	);
	it('rechecks session grants on every lookup and does not fall back after revocation', async () => {
		mocks.entry.mockResolvedValue(undefined);
		const request = event('resource=LEX&q=G999', 'reader');
		expect(await (await GET(request as never)).json()).toEqual({
			resourceId: 'LEX',
			query: 'G999',
			entry: null
		});
		expect(mocks.entry).toHaveBeenCalledWith(mocks.db, 'LEX', 'G999', 'reader');
		mocks.resources.mockResolvedValue([]);
		await expect(GET(request as never)).rejects.toMatchObject({ status: 404 });
		expect(mocks.resources).toHaveBeenLastCalledWith(mocks.db, 'reader');
		expect(mocks.entry).toHaveBeenCalledTimes(1);
	});
	it.each(['q=G26', 'resource=OTHER&q=G26', 'resource=BIBLE&q=G26'])(
		'rejects unavailable or non-dictionary selections: %s',
		async (query) => {
			mocks.resources.mockResolvedValue([
				{ id: 'LEX', kind: 'lexicon' },
				{ id: 'BIBLE', kind: 'bible' }
			]);
			await expect(GET(event(query) as never)).rejects.toMatchObject({ status: 404 });
			expect(mocks.entry).not.toHaveBeenCalled();
		}
	);
	it('rejects blank input before I/O and bounds lookup text', async () => {
		await expect(GET(event('resource=LEX&q=%20') as never)).rejects.toMatchObject({ status: 400 });
		expect(mocks.resources).not.toHaveBeenCalled();
		await GET(event(`resource=LEX&q=${'a'.repeat(250)}`) as never);
		expect(mocks.entry).toHaveBeenCalledWith(mocks.db, 'LEX', 'a'.repeat(200), undefined);
	});
});
