import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: {},
	getPublishedDocumentBySlug: vi.fn(),
	listBibles: vi.fn(),
	chapterCount: vi.fn()
}));
vi.mock('$lib/server/config', () => ({ config: () => ({ ORIGIN: 'https://example.test/' }) }));
vi.mock('$lib/server/db', () => ({ getDb: () => mocks.db }));
vi.mock('$lib/server/repositories/document-publications', () => ({
	getPublishedDocumentBySlug: mocks.getPublishedDocumentBySlug
}));
vi.mock('$lib/server/repositories/resources', () => ({
	listBibles: mocks.listBibles,
	chapterCount: mocks.chapterCount
}));
import { GET as getIndex } from './+server.ts';
import { load as loadPublication } from './[slug]/+page.server.ts';
import { GET as getFeed } from './feed.xml/+server.ts';
import { GET as getRobots } from '../../robots.txt/+server.ts';
import { GET as getSitemap } from '../../sitemap.xml/+server.ts';

const publication = {
	documentId: 'ae775b37-8dca-4073-ae94-1b0920e1c597',
	slug: 'hoffnung-und-liebe',
	title: 'Hoffnung & Liebe',
	excerpt: 'Ein Überblick',
	bodyHtml: '<p>Fest & frei</p>',
	bodyMarkdown: 'Fest & frei',
	authorName: 'Ada Beispiel',
	visibility: 'unlisted',
	passages: [],
	tags: [],
	publicationRevision: 2,
	firstPublishedAt: new Date('2026-06-01T09:00:00Z'),
	publishedAt: new Date('2026-06-02T10:00:00Z')
};
beforeEach(() => {
	vi.resetAllMocks();
	mocks.listBibles.mockResolvedValue([]);
	mocks.chapterCount.mockResolvedValue(0);
});

describe('unlisted note sharing', () => {
	it.each(['unlisted', 'public'])(
		'marks even a legacy %s snapshot as unlisted and noindex without exposing private fields',
		async (visibility) => {
			mocks.getPublishedDocumentBySlug.mockResolvedValueOnce({ ...publication, visibility });
			const setHeaders = vi.fn();
			const result = await loadPublication({
				params: { slug: publication.slug },
				setHeaders
			} as never);
			expect(result.publication).toMatchObject({
				slug: publication.slug,
				bodyHtml: publication.bodyHtml,
				visibility: 'unlisted'
			});
			expect(result.publication).not.toHaveProperty('bodyMarkdown');
			expect(result.publication).not.toHaveProperty('documentId');
			expect(setHeaders).toHaveBeenCalledWith({
				'cache-control': 'private, no-store',
				'x-robots-tag': 'noindex, nofollow'
			});
		}
	);
	it('returns 404 for a missing or withdrawn snapshot', async () => {
		mocks.getPublishedDocumentBySlug.mockResolvedValueOnce(undefined);
		await expect(
			loadPublication({ params: { slug: 'missing' }, setHeaders: vi.fn() } as never)
		).rejects.toMatchObject({ status: 404 });
	});
	it.each([getIndex, getFeed])(
		'retires discovery with 410, noindex and no database lookup',
		async (get) => {
			const response = get();
			expect(response.status).toBe(410);
			expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
			expect(response.headers.get('cache-control')).toBe('private, no-store');
			expect(await response.text()).not.toContain(publication.slug);
			expect(mocks.getPublishedDocumentBySlug).not.toHaveBeenCalled();
		}
	);
	it('keeps general pages and imported Bible chapters in the sitemap, without any notes', async () => {
		mocks.chapterCount.mockImplementation(async (_db, _resources, bookId) =>
			bookId === 43 ? 1 : 0
		);
		const xml = await (await getSitemap({ setHeaders: vi.fn() } as never)).text();
		expect(xml).toContain('<loc>https://example.test/about</loc>');
		expect(xml).toContain('<loc>https://example.test/Joh1</loc>');
		expect(xml).not.toContain('/notes');
		expect(mocks.getPublishedDocumentBySlug).not.toHaveBeenCalled();
	});
	it('lets crawlers read the noindex and 410 responses while excluding private workspaces', async () => {
		const robots = await (await getRobots({ setHeaders: vi.fn() } as never)).text();
		expect(robots).toContain('Disallow: /notes\n');
		expect(robots).toContain('Allow: /notes/published\n');
		expect(robots).toContain('Disallow: /sermons\n');
	});
});
