import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: { marker: 'chapter-route-test-db' },
	listBibles: vi.fn(),
	loadChapter: vi.fn()
}));

vi.mock('$lib/server/db', () => ({ getDb: () => mocks.db }));
vi.mock('$lib/server/repositories/resources', () => ({ listBibles: mocks.listBibles }));
vi.mock('$lib/server/repositories/chapter', () => ({ loadChapter: mocks.loadChapter }));

import { GET } from './+server.ts';

const publicBible = { id: 'PUBLIC' };

function event(params: { bible: string; book?: string; chapter?: string }) {
	return {
		params: {
			bible: params.bible,
			book: params.book ?? '40',
			chapter: params.chapter ?? '3'
		},
		setHeaders: vi.fn()
	};
}

beforeEach(() => {
	mocks.listBibles.mockReset();
	mocks.loadChapter.mockReset();
});

describe('public Bible chapter API', () => {
	it('serves structured text from an explicitly readable Bible with public cache headers', async () => {
		mocks.listBibles.mockResolvedValue([publicBible]);
		mocks.loadChapter.mockResolvedValue({
			book: 40,
			chapter: 3,
			rows: [
				{
					verse: 12,
					cells: [
						{
							verse: 12,
							verseEnd: null,
							span: 1,
							segments: ['Er hat die Worfschaufel in seiner Hand.'],
							heading: null
						}
					]
				}
			],
			headings: new Map([[12, 'Die kommende Ernte']]),
			empty: false
		});
		const requestEvent = event({ bible: 'PUBLIC' });

		const response = await GET(requestEvent as never);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			bible: 'PUBLIC',
			book: 40,
			chapter: 3,
			verses: [
				{
					verse: 12,
					verseEnd: null,
					segments: ['Er hat die Worfschaufel in seiner Hand.'],
					heading: null
				}
			],
			headings: [[12, 'Die kommende Ernte']]
		});
		expect(mocks.listBibles).toHaveBeenCalledWith(mocks.db);
		expect(mocks.loadChapter).toHaveBeenCalledWith(mocks.db, {
			resourceIds: ['PUBLIC'],
			book: 40,
			chapter: 3
		});
		expect(requestEvent.setHeaders).toHaveBeenCalledWith({
			'cache-control': 'public, max-age=60, s-maxage=3600'
		});
	});

	it('never queries a resource absent from the public-ready Bible projection', async () => {
		mocks.listBibles.mockResolvedValue([publicBible]);
		const requestEvent = event({ bible: 'PRIVATE-OR-DRAFT' });

		const response = await GET(requestEvent as never);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: {
				code: 'unknown_bible',
				message: 'No bible with id "PRIVATE-OR-DRAFT".'
			}
		});
		expect(mocks.loadChapter).not.toHaveBeenCalled();
		expect(requestEvent.setHeaders).not.toHaveBeenCalled();
	});

	it('does not advertise an empty or malformed chapter as cacheable content', async () => {
		mocks.listBibles.mockResolvedValue([publicBible]);
		mocks.loadChapter.mockResolvedValue({
			book: 40,
			chapter: 3,
			rows: [],
			headings: new Map(),
			empty: true
		});
		const missingEvent = event({ bible: 'PUBLIC' });
		const missing = await GET(missingEvent as never);
		expect(missing.status).toBe(404);
		expect(missingEvent.setHeaders).not.toHaveBeenCalled();

		const malformedEvent = event({ bible: 'PUBLIC', chapter: '3.5' });
		const malformed = await GET(malformedEvent as never);
		expect(malformed.status).toBe(404);
		expect(mocks.loadChapter).toHaveBeenCalledTimes(1);
		expect(malformedEvent.setHeaders).not.toHaveBeenCalled();
	});
});
