import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getHelpArticle, helpArticles, helpTopics } from './catalog';
import { helpPlainText, helpQuery, searchHelp } from './search';
import { loadHelpTopic, redirectHelpGuide } from './load-topic';
import { helpAnchor } from './links';

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
		expect(result?.href).toBe('/help/reader#arbeitsbereich-einrichten--wechseln');
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
				helpArticles
					.filter(({ topic }) => topic === id)
					.some(({ sections }) => sections.some(({ html }) => helpPlainText(html).length > 100))
			).toBe(true);
		}
	});

	it('provides unique anchors on each topic and resolves the earlier topic fragments', () => {
		expect(new Set(helpArticles.map(({ path }) => path)).size).toBe(helpArticles.length);
		for (const topic of helpTopics) {
			const articles = helpArticles.filter((article) => article.topic === topic.id);
			const anchors = articles.flatMap((article) => [
				...(article.level === 'guide' ? [helpAnchor(article)] : []),
				...article.sections.map(({ id }) => helpAnchor(article, id))
			]);
			const aliases = Object.entries(topic.anchors ?? {});
			const all = [...anchors, ...aliases.map(([from]) => from)];
			expect(new Set(all).size, topic.path).toBe(all.length);
			for (const [, target] of aliases) expect(anchors, topic.path).toContain(target);
			for (const article of articles) {
				expect(article.sections.every(({ html }) => !/\{[#/]each|<Icon/.test(html))).toBe(true);
			}
		}
	});

	it('redirects old guide URLs to the help topic and rejects unknown topics or tasks', () => {
		const setHeaders = () => {};
		expect(() =>
			redirectHelpGuide('reader', 'arbeitsbereich-einrichten', null, setHeaders)
		).toThrow(
			expect.objectContaining({
				status: 308,
				location: '/help/reader?anleitung=arbeitsbereich-einrichten'
			})
		);
		expect(() => loadHelpTopic('nicht-vorhanden', null, setHeaders)).toThrow(
			expect.objectContaining({ status: 404 })
		);
		expect(() => redirectHelpGuide('reader', 'nicht-vorhanden', null, setHeaders)).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});

	it('keeps API and administration outside the user topic list', () => {
		expect(helpTopics.filter(({ audience }) => audience !== 'user').map(({ id }) => id)).toEqual([
			'api',
			'administration'
		]);
	});

	it('returns complete guides directly with their topics', () => {
		for (const guide of helpArticles.filter(({ level }) => level === 'guide')) {
			const topic = loadHelpTopic(guide.topic, { role: 'admin' }, () => {});
			expect(topic.guides, topic.topic.path).toContain(guide);
		}
	});

	it('keeps editorial links to canonical help topics, guides and steps valid', () => {
		for (const article of helpArticles) {
			for (const section of article.sections) {
				for (const match of section.html.matchAll(/href="(\/help[^"?]*)"/g)) {
					const [path, fragment] = match[1]!.split('#');
					if (path === '/help') continue;
					const topic = getHelpArticle(
						path!,
						article.audience === 'admin' ? { role: 'admin' } : null
					);
					expect(topic?.level, `${article.path} links to ${match[1]}`).toBe('overview');
					if (fragment) {
						const targets = helpArticles.filter(({ topic: id }) => id === topic!.id);
						expect(
							targets.some(
								(target) =>
									helpAnchor(target) === fragment ||
									target.sections.some(({ id }) => helpAnchor(target, id) === fragment)
							),
							`${article.path} links to ${match[1]}`
						).toBe(true);
					}
				}
			}
		}
	});

	it('places each finished episode in at least one public help topic or guide', () => {
		const episodes = new Set(
			helpArticles
				.filter(({ audience }) => audience === 'user')
				.flatMap(({ episode, sections }) => [
					episode,
					...sections.map((section) => section.episode)
				])
				.filter((episode) => episode != null)
		);
		expect(Array.from(episodes).sort((a, b) => a - b)).toEqual(
			Array.from({ length: 15 }, (_, i) => i + 1)
		);
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
