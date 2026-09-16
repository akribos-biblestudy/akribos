import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { inArray } from 'drizzle-orm';
import type { VerseSegment } from '../src/lib/bible/segments.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	resources,
	resourceBooks,
	verses,
	verseWords,
	lexiconEntries
} from '../src/lib/server/db/schema.ts';
import { refreshStrongStatisticsBlocking } from '../src/lib/server/db/statistics.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { registerWithPassword } from './lib/auth.ts';

test('German Bible word forms share lemma counts in a Greek lexicon and retain old API filters', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const bibleId = `LEMMA_BIBLE_${randomUUID()}`;
	const lexiconId = `LEMMA_LEX_${randomUUID()}`;
	try {
		await db.insert(resources).values([
			{
				id: bibleId,
				name: 'Lemma-Bibel',
				abbrev: 'LB',
				tabTitle: 'Lemma-Bibel',
				kind: 'bible',
				language: 'de-CH',
				status: 'ready',
				isPublic: true,
				sortOrder: 99999,
				hasStrongs: true,
				canon: 'nt'
			},
			{
				id: lexiconId,
				name: 'Lemma-Lexikon',
				abbrev: 'LL',
				kind: 'lexicon',
				language: 'grc',
				status: 'ready',
				isPublic: true,
				sortOrder: 99999
			}
		]);
		await db
			.insert(resourceBooks)
			.values({ resourceId: bibleId, bookId: 43, chapterCount: 3, verseCount: 5 });
		await db.insert(lexiconEntries).values({
			resourceId: lexiconId,
			strong: 'G932',
			language: 'grc',
			lemma: 'βασιλεία',
			definitionHtml: '<p>Reich.</p>'
		});
		const forms = [['Reich'], ['Reiche'], ['Reiches', 'Reich'], ['Königreich'], ['das']];
		for (const [index, words] of forms.entries()) {
			const segments: VerseSegment[] = words.flatMap((text) => [
				{ kind: 'w' as const, text, strong: 'G932' },
				' '
			]);
			const [verse] = await db
				.insert(verses)
				.values({
					resourceId: bibleId,
					bookId: 43,
					chapter: 3,
					verse: 16 + index,
					text: words.join(' '),
					segments
				})
				.returning({ id: verses.id });
			await db.insert(verseWords).values(
				words.map((word, position) => ({
					resourceId: bibleId,
					verseId: verse!.id,
					bookId: 43,
					position,
					word,
					strong: 'G932'
				}))
			);
		}
		await refreshStrongStatisticsBlocking(db);
		await registerWithPassword(
			page,
			`lemma-${randomUUID()}@example.com`,
			'lemma-test-password',
			'Lemma Reader'
		);
		await page.goto(
			`/Joh3?layout=columns-2&tab=1.1:${bibleId}:A:Joh3&tab=2.1:${lexiconId}:A:Joh3&active=1.1&active=2.1&focus=1&lookup=2.1:G932&source=2.1:${bibleId}&sourceRef=2.1:Joh3,16`
		);
		const chart = page.locator('.lexicon-tab .donut-chart');
		await expect(chart.locator('.chart-summary strong')).toHaveText('3');
		await expect(chart.locator('.chart-summary')).toContainText('6 Vorkommen');
		await expect(chart.locator('.lemma-hint')).toBeVisible();
		const reich = chart
			.locator('tbody tr')
			.filter({ has: page.getByRole('cell', { name: 'Reich', exact: true }) });
		await expect(reich).toContainText('Reich (2)');
		await expect(reich).toContainText('Reiche (1)');
		await expect(reich).toContainText('Reiches (1)');
		await expect(chart.locator('tbody tr')).toHaveCount(3);
		const search = await page.request.get(`/api/reader/search?resource=${bibleId}&q=G932`);
		expect(search.ok()).toBe(true);
		expect((await search.json()).glosses[0]).toMatchObject({ display: 'Reich', occurrences: 4 });
		for (const gloss of ['Reich', 'Reiches']) {
			const result = await page.request.get(
				`/api/v1/strong/G932?resources=${bibleId}&gloss=${gloss}`,
				{ headers: { origin: 'http://localhost:4173' } }
			);
			expect(result.ok()).toBe(true);
			const body = await result.json();
			expect(body.occurrences.total).toBe(3);
			expect(body.occurrences.occurrences.map((row: { verse: number }) => row.verse)).toEqual([
				16, 17, 18
			]);
			expect(body.statistics.occurrences).toBe(6);
		}
	} finally {
		await db.delete(resources).where(inArray(resources.id, [bibleId, lexiconId]));
		await refreshStrongStatisticsBlocking(db);
		await client.end();
	}
});

test('standalone word studies keep old form links active and offer lemma filters on desktop and mobile', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/G25?gloss=geliebt');
	const chart = page.locator('.donut-chart').filter({ visible: true });
	await expect(chart.locator('.lemma-hint')).toBeVisible();
	const filter = chart.locator('.gloss-filters a').filter({ hasText: 'lieben' });
	await expect(filter).toHaveAttribute('aria-current', 'true');
	await expect(filter).toHaveAttribute('title', /geliebt/);
	await filter.click();
	await expect(page).toHaveURL((url) => url.searchParams.get('gloss') === 'lieben');
	await expect(page.locator('ol[aria-label="Vorkommen"] > li')).toHaveCount(1);
	await expect(page.locator('ol[aria-label="Vorkommen"] > li')).toHaveAttribute(
		'data-reference',
		'Joh 3,16'
	);
	await page.setViewportSize({ width: 740, height: 900 });
	await page.goto('/G25?gloss=geliebt');
	const summary = page.locator('summary').filter({ hasText: 'Nach Übersetzungsvariante filtern' });
	await summary.click();
	const mobile = summary.locator('..');
	await expect(mobile.getByRole('link', { name: /lieben/ })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(mobile.getByRole('link', { name: /lieben/ })).toHaveAttribute('title', /geliebt/);
	await mobile.getByRole('link', { name: /lieben/ }).click();
	await expect(page).toHaveURL((url) => url.searchParams.get('gloss') === 'lieben');
	await expect(page.locator('ol[aria-label="Vorkommen"] > li')).toHaveCount(1);
});
