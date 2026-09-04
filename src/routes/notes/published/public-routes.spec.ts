import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: { marker: 'publication-test-db' },
	listPublishedDocuments: vi.fn(),
	listPublishedDocumentSummaries: vi.fn(),
	listPublishedDocumentSlugs: vi.fn(),
	getPublishedDocumentBySlug: vi.fn(),
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
	listPublishedDocuments: mocks.listPublishedDocuments,
	listPublishedDocumentSummaries: mocks.listPublishedDocumentSummaries,
	listPublishedDocumentSlugs: mocks.listPublishedDocumentSlugs,
	getPublishedDocumentBySlug: mocks.getPublishedDocumentBySlug
}));

vi.mock('$lib/server/repositories/resources', () => ({
	listBibles: mocks.listBibles,
	chapterCount: mocks.chapterCount
}));

import { load as loadPublicationIndex } from './+page.server.ts';
import { load as loadPublication } from './[slug]/+page.server.ts';
import { GET as getFeed } from './feed.xml/+server.ts';
import { GET as getRobots } from '../../robots.txt/+server.ts';
import { GET as getSitemap } from '../../sitemap.xml/+server.ts';

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
	mocks.listPublishedDocuments.mockReset();
	mocks.listPublishedDocumentSummaries.mockReset();
	mocks.listPublishedDocumentSlugs.mockReset();
	mocks.getPublishedDocumentBySlug.mockReset();
	mocks.listBibles.mockReset();
	mocks.listBibles.mockResolvedValue([]);
	mocks.chapterCount.mockReset();
});

describe('public note page loads', () => {
	it('returns snapshot summaries without shared-caching the personalised root layout', async () => {
		mocks.listPublishedDocumentSummaries.mockResolvedValueOnce([publication]);
		const setHeaders = vi.fn();

		const result = await loadPublicationIndex({
			setHeaders,
			url: new URL('https://example.test/notes/published')
		} as never);

		expect(mocks.listPublishedDocumentSummaries).toHaveBeenCalledWith(mocks.db, {
			limit: 25,
			offset: 0
		});
		expect(result.publications).toEqual([
			expect.objectContaining({ slug: publication.slug, title: publication.title })
		]);
		expect(result.publications[0]).not.toHaveProperty('bodyMarkdown');
		expect(result.publications[0]).not.toHaveProperty('documentId');
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });

		mocks.listPublishedDocumentSummaries.mockResolvedValueOnce([]);
		const signedInHeaders = vi.fn();
		await loadPublicationIndex({
			setHeaders: signedInHeaders,
			url: new URL('https://example.test/notes/published')
		} as never);
		expect(signedInHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
	});

	it('serves an unlisted snapshot by its direct slug and returns 404 when none exists', async () => {
		mocks.getPublishedDocumentBySlug.mockResolvedValueOnce({
			...publication,
			visibility: 'unlisted'
		});
		const setHeaders = vi.fn();

		const result = await loadPublication({
			params: { slug: publication.slug },
			setHeaders
		} as never);

		expect(mocks.getPublishedDocumentBySlug).toHaveBeenCalledWith(mocks.db, publication.slug);
		expect(mocks.listBibles).toHaveBeenCalledWith(mocks.db);
		expect(result.bibles).toEqual([]);
		expect(result.publication).toMatchObject({
			slug: publication.slug,
			bodyHtml: publication.bodyHtml,
			visibility: 'unlisted'
		});
		expect(result.publication).not.toHaveProperty('bodyMarkdown');
		expect(result.publication).not.toHaveProperty('documentId');
		expect(setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
		expect(setHeaders).toHaveBeenCalledWith({ 'x-robots-tag': 'noindex, nofollow' });

		mocks.getPublishedDocumentBySlug.mockResolvedValueOnce(undefined);
		await expect(
			loadPublication({
				params: { slug: 'nicht-vorhanden' },
				setHeaders: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('published-notes feed', () => {
	it('renders escaped Atom from the public-snapshot listing only', async () => {
		mocks.listPublishedDocuments.mockResolvedValueOnce([publication]);
		const setHeaders = vi.fn();

		const response = await getFeed({ setHeaders } as never);
		const xml = await response.text();

		expect(mocks.listPublishedDocuments).toHaveBeenCalledWith(mocks.db, { limit: 50 });
		expect(xml).toContain('<title>Hoffnung &amp; &lt;Liebe&gt;</title>');
		expect(xml).toContain('<author><name>Ada &lt;Beispiel&gt;</name></author>');
		expect(xml).toContain('&lt;p&gt;Fest &amp; frei&lt;/p&gt;');
		expect(xml).toContain('term="Theologie &amp; Alltag"');
		expect(xml).not.toContain(publication.documentId);
		expect(setHeaders).toHaveBeenCalledWith({
			'content-type': 'application/atom+xml; charset=utf-8',
			'cache-control': 'public, max-age=0, must-revalidate'
		});
	});
});

describe('published-note discovery', () => {
	it('adds every public snapshot returned by the publication repository to the sitemap', async () => {
		mocks.listBibles.mockResolvedValueOnce([]);
		mocks.chapterCount.mockResolvedValue(0);
		mocks.listPublishedDocumentSlugs.mockResolvedValueOnce([publication.slug]);

		const response = await getSitemap({ setHeaders: vi.fn() } as never);
		const xml = await response.text();

		expect(xml).toContain('<loc>https://example.test/notes/published/hoffnung-und-liebe</loc>');
		expect(mocks.listPublishedDocumentSlugs).toHaveBeenCalledWith(mocks.db, {
			limit: 100,
			offset: 0
		});
	});

	it('keeps private note and sermon workspaces out of crawling', async () => {
		const response = await getRobots({ setHeaders: vi.fn() } as never);
		const robots = await response.text();

		expect(robots).toContain('Disallow: /notes\n');
		expect(robots).toContain('Allow: /notes/published\n');
		expect(robots).toContain('Disallow: /sermons\n');
	});
});
