import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { testDatabaseUrl } from '../scripts/lib/test-database';

// Old installations can retain this settings row. It must no longer activate a
// remote tracker, even if a visitor also carries the former consent cookie.
test('retired analytics configuration cannot load a tracker or consent UI', async ({
	page,
	context,
	baseURL
}) => {
	const databaseUrl =
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(
			process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
		);
	const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	const previous = await sql`select value from settings where key = 'analytics.umami'`;
	const config = {
		enabled: true,
		scriptUrl: 'https://removed-analytics.invalid/script.js',
		websiteId: 'a0520ae9-6fc7-4bde-9273-066bfba7eddf',
		provider: 'Synthetic test',
		privacyUrl: 'https://removed-analytics.invalid/privacy',
		privacyDetails: 'Synthetic test only'
	};
	const revision = createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 20);
	try {
		await sql`insert into settings (key, value) values ('analytics.umami', ${sql.json(config)})
			on conflict (key) do update set value = excluded.value`;
		await context.addCookies([
			{ name: 'analytics-consent', value: `${revision}.yes`, url: baseURL! }
		]);
		const trackerRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith('https://removed-analytics.invalid/'))
				trackerRequests.push(request.url());
		});
		await page.goto('/datenschutz');
		await expect(page.getByRole('heading', { name: 'Datenschutz' })).toBeVisible();
		await expect(page.getByText('Umami')).toHaveCount(0);
		await expect(page.getByText('Freiwillige Nutzungsanalyse')).toHaveCount(0);
		await expect(page.locator('script[src*="removed-analytics.invalid"]')).toHaveCount(0);
		expect(trackerRequests).toEqual([]);
		expect((await context.cookies()).some((cookie) => cookie.name === 'analytics-consent')).toBe(
			false
		);
		// Cleanup of the browser cookie does not silently delete old server settings.
		expect(await sql`select value from settings where key = 'analytics.umami'`).toHaveLength(1);
	} finally {
		if (previous.length) {
			await sql`update settings set value = ${sql.json(previous[0].value)} where key = 'analytics.umami'`;
		} else {
			await sql`delete from settings where key = 'analytics.umami'`;
		}
		await sql.end();
	}
});
