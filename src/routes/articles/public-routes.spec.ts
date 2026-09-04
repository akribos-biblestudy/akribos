import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: { marker: 'publication-test-db' },
	listPublishedArticles: vi.fn(),
	getPublishedArticleBySlug: vi.fn(),
	listBibles: vi.fn(),
	chapterCount: vi.fn()
}));

vi.mock('$lib/server/config', () => ({
	config: () => ({ ORIGIN: 'https://example.test/' })
}));

vi.mock('$lib/server/db', () => ({
	getDb: () => mocks.db
}));

vi.mock('$lib/server/repositories/document-publications', () => ({
	listPublishedArticles: mocks.listPublishedArticles,
	getPublishedArticleBySlug: mocks.getPublishedArticleBySlug
}));

vi.mock('$lib/server/repositories/resources', () => ({
	listBibles: mocks.listBibles,
	chapterCount: mocks.chapterCount
}));

import { load as loadArticleIndex } from './+page.server.ts';
import { load as loadArticle } from './[slug]/+page.server.ts';
import { GET as getFeed } from './feed.xml/+server.ts';
import { GET as getRobots } from '../robots.txt/+server.ts';
import { GET as getSitemap } from '../sitemap.xml/+server.ts';

const publication = {
	documentId: 'ae775b37-8dca-4073-ae94-1b0920e1c597',
	slug: 'hoffnung-und-liebe',
	title: 'Hoffnung & <Liebe>',
	excerpt: 'Ein "kurzer" Überblick & Ausblick',
	bodyHtml: '<p>Fest & frei</p>',
	bodyMarkdown: 'Fest & frei',
	authorName: 'Ada <Beispiel>',
	visibility: 'public' as const,
	passages: [],
	tags: ['Theologie & Alltag'],
	publicationRevision: 2,
	firstPublishedAt: new Date('2026-06-01T09:00:00.000Z'),
	publishedAt: new Date('2026-06-02T10:00:00.000Z')
};

beforeEach(() => {
	mocks.listPublishedArticles.mockReset();
	mocks.getPublishedArticleBySlug.mockReset();
	mocks.listBibles.mockReset();
	mocks.chapterCount.mockReset();
});

describe('public article page loads', () => {
	it('returns snapshot summaries and makes only anonymous responses publicly cacheable', async () => {
		mocks.listPublishedArticles.mockResolvedValueOnce([publication]);
		const setHeaders = vi.fn();

		const result = await loadArticleIndex({ locals: { user: null }, setHeaders } as never);

		expect(mocks.listPublishedArticles).toHaveBeenCalledWith(mocks.db, {
			limit: 100,
			offset: 0
		});
		expect(result.articles).toEqual([
			expect.objectContaining({ slug: publication.slug, title: publication.title })
		]);
		expect(result.articles[0]).not.toHaveProperty('bodyMarkdown');
		expect(result.articles[0]).not.toHaveProperty('documentId');
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'public, max-age=0, s-maxage=300'
		});

		mocks.listPublishedArticles.mockResolvedValueOnce([]);
		const signedInHeaders = vi.fn();
		await loadArticleIndex({
			locals: { user: { id: 'user-id' } },
			setHeaders: signedInHeaders
		} as never);
		expect(signedInHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});

	it('serves an unlisted snapshot by its direct slug and returns 404 when none exists', async () => {
		mocks.getPublishedArticleBySlug.mockResolvedValueOnce({
			...publication,
			visibility: 'unlisted'
		});
		const setHeaders = vi.fn();

		const result = await loadArticle({
			locals: { user: null },
			params: { slug: publication.slug },
			setHeaders
		} as never);

		expect(mocks.getPublishedArticleBySlug).toHaveBeenCalledWith(mocks.db, publication.slug);
		expect(result.article).toMatchObject({
			slug: publication.slug,
			bodyHtml: publication.bodyHtml,
			visibility: 'unlisted'
		});
		expect(result.article).not.toHaveProperty('bodyMarkdown');
		expect(result.article).not.toHaveProperty('documentId');
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'public, max-age=0, s-maxage=300'
		});

		mocks.getPublishedArticleBySlug.mockResolvedValueOnce(undefined);
		await expect(
			loadArticle({
				locals: { user: null },
				params: { slug: 'nicht-vorhanden' },
				setHeaders: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('article feed', () => {
	it('renders escaped Atom from the public-snapshot listing only', async () => {
		mocks.listPublishedArticles.mockResolvedValueOnce([publication]);
		const setHeaders = vi.fn();

		const response = await getFeed({ setHeaders } as never);
		const xml = await response.text();

		expect(mocks.listPublishedArticles).toHaveBeenCalledWith(mocks.db, { limit: 50 });
		expect(xml).toContain('<title>Hoffnung &amp; &lt;Liebe&gt;</title>');
		expect(xml).toContain('<author><name>Ada &lt;Beispiel&gt;</name></author>');
		expect(xml).toContain('&lt;p&gt;Fest &amp; frei&lt;/p&gt;');
		expect(xml).toContain('term="Theologie &amp; Alltag"');
		expect(xml).not.toContain(publication.documentId);
		expect(setHeaders).toHaveBeenCalledWith({
			'content-type': 'application/atom+xml; charset=utf-8',
			'cache-control': 'public, max-age=0, s-maxage=900'
		});
	});
});

describe('article discovery', () => {
	it('adds every public snapshot returned by the publication repository to the sitemap', async () => {
		mocks.listBibles.mockResolvedValueOnce([]);
		mocks.chapterCount.mockResolvedValue(0);
		mocks.listPublishedArticles.mockResolvedValueOnce([publication]);

		const response = await getSitemap({ setHeaders: vi.fn() } as never);
		const xml = await response.text();

		expect(xml).toContain('<loc>https://example.test/articles/hoffnung-und-liebe</loc>');
		expect(mocks.listPublishedArticles).toHaveBeenCalledWith(mocks.db, {
			limit: 100,
			offset: 0
		});
	});

	it('keeps private note and sermon workspaces out of crawling', async () => {
		const response = await getRobots({ setHeaders: vi.fn() } as never);
		const robots = await response.text();

		expect(robots).toContain('Disallow: /notes\n');
		expect(robots).toContain('Disallow: /sermons\n');
	});
});
