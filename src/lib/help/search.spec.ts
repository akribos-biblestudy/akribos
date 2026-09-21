import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	getHelpArticle,
	getHelpGuides,
	getHelpHeadings,
	helpArticles,
	helpTopics
} from './catalog';
import { helpPlainText, helpQuery, searchHelp } from './search';
import { loadHelpArticle } from './load-article';

describe('help search', () => {
	it('finds German words with umlauts or keyboard transliterations', () => {
		expect(searchHelp('UMbENENNEN').map(({ article }) => article.id)).toContain(
			'arbeitsbereich-einrichten'
		);
		expect(searchHelp('Schlüssel').map(({ article }) => article.id)).toEqual(
			searchHelp('schluessel').map(({ article }) => article.id)
		);
	});

	it('finds a step by its content and links to its section', () => {
		const result = searchHelp('Stiftsymbol').find(
			({ article }) => article.id === 'arbeitsbereich-einrichten'
		);
		expect(result?.href).toBe('/help/reader/arbeitsbereich-einrichten#wechseln');
		expect(result?.sectionTitle).toBe('Arbeitsbereiche wechseln und verwalten');
	});

	it('ranks the matching title ahead of incidental article mentions', () => {
		expect(searchHelp('Import Export')[0]?.article.id).toBe('import-export');
	});

	it('requires every search term and handles punctuation and empty searches', () => {
		expect(searchHelp('Stiftsymbol unbekannteszzwort')).toEqual([]);
		expect(searchHelp(' ?! ')).toEqual([]);
		expect(searchHelp('')).toEqual([]);
		expect(searchHelp('"Neuer Arbeitsbereich"').map(({ article }) => article.id)).toContain(
			'arbeitsbereich-einrichten'
		);
	});

	it('indexes visible prose instead of HTML attributes and returns plain excerpts', () => {
		expect(searchHelp('href')).toEqual([]);
		expect(helpPlainText('<p>Text &amp; <strong>Kontext</strong></p>')).toBe('Text & Kontext');
		expect(searchHelp('Arbeitsbereich').every(({ excerpt }) => !excerpt.includes('<'))).toBe(true);
	});

	it('bounds user input and safely handles missing queries', () => {
		expect(helpQuery(null)).toBe('');
		expect(helpQuery('  Notiz  ')).toBe('Notiz');
		expect(helpQuery('x'.repeat(300))).toHaveLength(160);
	});

	it('returns search snippets without serializing complete article bodies', () => {
		const results = searchHelp('Bibel');
		expect(results.length).toBeGreaterThan(1);
		for (const result of results) {
			expect(result.article).not.toHaveProperty('sections');
			expect(result.article).not.toHaveProperty('keywords');
			expect(result.excerpt.length).toBeLessThanOrEqual(240);
		}
	});
});

describe('help catalog and routes', () => {
	it('keeps every former help fragment as an actual topic with readable content', () => {
		const legacy = [
			'erste-schritte',
			'bibelstellen',
			'reader',
			'strong',
			'suchen',
			'verse',
			'listen',
			'konto',
			'mobil',
			'dokumente',
			'predigten',
			'import-export',
			'probleme'
		];
		for (const id of legacy) {
			expect(helpTopics.find((topic) => topic.id === id)?.path).toBe(`/help/${id}`);
			expect(
				getHelpArticle(`/help/${id}`)?.sections.some(({ html }) => helpPlainText(html).length > 100)
			).toBe(true);
		}
	});

	it('has unique routes, valid section links, and no unresolved template markup', () => {
		expect(new Set(helpArticles.map(({ path }) => path)).size).toBe(helpArticles.length);
		for (const article of helpArticles) {
			const headings = getHelpHeadings(article);
			expect(new Set(headings.map(({ id }) => id)).size).toBe(headings.length);
			for (const heading of headings) {
				expect(
					article.sections.some(
						(section) => section.id === heading.id || section.html.includes(`id="${heading.id}"`)
					)
				).toBe(true);
			}
			expect(article.sections.every(({ html }) => !/\{[#/]each|<Icon/.test(html))).toBe(true);
		}
	});

	it('serves the nested guide and rejects unknown topics or tasks', () => {
		expect(loadHelpArticle('/help/reader/arbeitsbereich-einrichten').article.level).toBe('guide');
		expect(() => loadHelpArticle('/help/nicht-vorhanden')).toThrow();
		expect(() => loadHelpArticle('/help/reader/nicht-vorhanden')).toThrow();
	});

	it('keeps API and administration outside the user topic list', () => {
		expect(helpTopics.filter(({ audience }) => audience !== 'user').map(({ id }) => id)).toEqual([
			'api',
			'administration'
		]);
	});

	it('makes every guide discoverable from its topic and keeps sibling navigation compact', () => {
		const administrator = { role: 'admin' as const };
		for (const article of helpArticles.filter(({ level }) => level === 'guide')) {
			const topic = helpTopics.find(({ id }) => id === article.topic);
			expect(topic, article.path).toBeDefined();
			const overview = loadHelpArticle(topic!.path, administrator);
			expect(
				overview.guides.map(({ path }) => path),
				topic!.path
			).toContain(article.path);
			expect(overview.headings[0]?.id).toBe('anleitungen');
			const guide = loadHelpArticle(article.path, administrator);
			expect(guide.guides.map(({ path }) => path)).toEqual(
				getHelpGuides(article.topic, administrator).map(({ path }) => path)
			);
			expect(guide.guides.every((entry) => !('sections' in entry))).toBe(true);
		}
	});

	it('keeps editorial links to help pages and steps valid across guide packages', () => {
		for (const article of helpArticles) {
			for (const section of article.sections) {
				for (const match of section.html.matchAll(/href="(\/help[^"?]*)"/g)) {
					const [path, fragment] = match[1]!.split('#');
					if (path === '/help') continue;
					const target = getHelpArticle(path!, { role: 'admin' });
					expect(target, `${article.path} links to ${match[1]}`).toBeDefined();
					if (fragment) {
						expect(
							target!.sections.some(
								(entry) => entry.id === fragment || entry.html.includes(`id="${fragment}"`)
							),
							`${article.path} links to ${match[1]}`
						).toBe(true);
					}
				}
			}
		}
	});

	it('references actual WebP screenshots with useful alternatives and dimensions', () => {
		for (const article of helpArticles) {
			for (const { screenshot } of article.sections) {
				if (!screenshot) continue;
				const admin = article.audience === 'admin';
				expect(screenshot.src).toMatch(
					admin ? /^\/help\/media\/[a-z0-9-]+\.webp$/ : /^\/help\/live\/[a-z0-9-]+\.webp$/
				);
				const file = admin
					? resolve('src/lib/server/help/images', screenshot.src.split('/').at(-1)!)
					: resolve('static', screenshot.src.slice(1));
				expect(existsSync(file), `${article.path}: ${screenshot.src}`).toBe(true);
				const contents = readFileSync(file);
				expect(contents.subarray(0, 4).toString()).toBe('RIFF');
				expect(contents.subarray(8, 12).toString()).toBe('WEBP');
				expect(screenshot.width).toBeGreaterThan(0);
				expect(screenshot.height).toBeGreaterThan(0);
				expect(screenshot.alt.length).toBeGreaterThan(20);
				expect(screenshot.caption.length).toBeGreaterThan(20);
			}
		}
	});
});
