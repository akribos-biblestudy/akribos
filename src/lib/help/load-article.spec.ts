import { describe, expect, it, vi } from 'vitest';
import {
	getHelpArticle,
	getHelpArticles,
	getHelpGuides,
	getHelpTopics,
	helpArticles
} from './catalog';
import { loadHelpArticle } from './load-article';
import { searchHelp } from './search';
import type { HelpViewer } from '$lib/server/help/access';
import { load as loadOverview } from '../../routes/help/+page.server';
import { load as loadTopic } from '../../routes/help/[topic]/+page.server';
import { load as loadGuide } from '../../routes/help/[topic]/[article]/+page.server';

const administrator = { role: 'admin' as const };
const restrictedArticles = helpArticles.filter(({ audience }) => audience === 'admin');
const publicArticles = helpArticles.filter(({ audience }) => audience !== 'admin');
const readerRoles = [
	{ label: 'guest', user: null },
	{ label: 'standard account', user: { role: 'user' as const } }
];

function event(path: string, user: HelpViewer) {
	const [, , topic, article] = path.split('/');
	return {
		url: new URL(path, 'https://example.test'),
		params: { topic, article },
		locals: { user },
		setHeaders: vi.fn()
	};
}

describe('help catalog access', () => {
	it('defaults to public articles, including API help, unless the administrator role is supplied', () => {
		expect(getHelpArticles()).toEqual(publicArticles);
		expect(getHelpTopics().every(({ audience }) => audience !== 'admin')).toBe(true);
		expect(getHelpArticle('/help/api')).toBeDefined();
		expect(getHelpGuides('administration')).toEqual([]);
		for (const article of restrictedArticles) {
			expect(getHelpArticle(article.path)).toBeUndefined();
		}
		expect(getHelpArticles(administrator)).toEqual(helpArticles);
		expect(getHelpGuides('administration', administrator).length).toBeGreaterThan(0);
	});

	it.each(readerRoles)('does not return restricted search results for a $label', ({ user }) => {
		for (const query of ['Administration', 'Backup', 'Umami', 'Nutzer verwalten']) {
			expect(searchHelp(query).every(({ article }) => article.audience !== 'admin')).toBe(true);
			expect(
				searchHelp(query, getHelpArticles(user)).every(
					({ article }) => article.audience !== 'admin'
				)
			).toBe(true);
		}
		expect(
			searchHelp('Backup', getHelpArticles(administrator)).some(
				({ article }) => article.audience === 'admin'
			)
		).toBe(true);
	});

	it.each(readerRoles)('rejects every restricted article for a $label', ({ user }) => {
		for (const article of restrictedArticles) {
			expect(() => loadHelpArticle(article.path, user)).toThrow(
				expect.objectContaining({ status: 404 })
			);
		}
	});
});

describe('help server loads', () => {
	it.each(readerRoles)(
		'excludes restricted metadata and content from every public article response for a $label',
		({ user }) => {
			for (const article of publicArticles) {
				const data = loadHelpArticle(article.path, user);
				expect(data.article).toBe(article);
				expect(data.topics.every(({ audience }) => audience !== 'admin')).toBe(true);
				const serialized = JSON.stringify(data);
				for (const restricted of restrictedArticles) {
					expect(serialized, article.path).not.toContain(restricted.path);
				}
			}
		}
	);

	it.each(readerRoles)(
		'filters the actual overview/search load and prevents shared caching for a $label',
		async ({ user }) => {
			for (const query of ['', 'Backup', 'Umami', 'Bibel']) {
				const request = event(`/help?q=${query}`, user);
				const data = await loadOverview(request as never);
				expect(data).toBeDefined();
				const serialized = JSON.stringify(data);
				for (const article of restrictedArticles) {
					expect(serialized).not.toContain(article.path);
				}
				expect(request.setHeaders).toHaveBeenCalledWith({
					'cache-control': 'private, no-store',
					vary: 'Cookie'
				});
			}
		}
	);

	it.each(readerRoles)(
		'guards direct topic and guide loads before returning any data for a $label',
		async ({ user }) => {
			for (const article of restrictedArticles) {
				const request = event(article.path, user);
				const load = article.level === 'overview' ? loadTopic : loadGuide;
				await expect(Promise.resolve().then(() => load(request as never))).rejects.toMatchObject({
					status: 404
				});
				expect(request.setHeaders).toHaveBeenCalledWith({
					'cache-control': 'private, no-store',
					vary: 'Cookie'
				});
			}
		}
	);

	it('serves every restricted page to administrators without allowing caches or indexing', async () => {
		for (const article of restrictedArticles) {
			const request = event(article.path, administrator);
			const load = article.level === 'overview' ? loadTopic : loadGuide;
			const data = await load(request as never);
			expect(data).toMatchObject({ article });
			expect(request.setHeaders).toHaveBeenCalledWith({
				'cache-control': 'private, no-store',
				vary: 'Cookie'
			});
			expect(request.setHeaders).toHaveBeenCalledWith({ 'x-robots-tag': 'noindex, nofollow' });
		}
	});

	it('includes administration in the authenticated administrator overview and search', async () => {
		const request = event('/help?q=Backup', administrator);
		const data = await loadOverview(request as never);
		expect(data).toMatchObject({
			topics: expect.arrayContaining([expect.objectContaining({ audience: 'admin' })]),
			results: expect.arrayContaining([
				expect.objectContaining({ article: expect.objectContaining({ audience: 'admin' }) })
			])
		});
		expect(request.setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store',
			vary: 'Cookie'
		});
	});
});
