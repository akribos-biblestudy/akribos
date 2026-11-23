import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { seedAdminSession } from './lib/admin-session.ts';

test('legacy Umami settings cannot display consent or load the tracker', async ({
	baseURL,
	context,
	page
}) => {
	const databaseUrl =
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(
			process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
		);
	const sql = postgres(databaseUrl, { max: 1 });
	const legacyKey = 'analytics.umami';
	const trackerOrigin = 'https://removed-analytics.invalid';
	const config = {
		enabled: true,
		scriptUrl: `${trackerOrigin}/script.js`,
		websiteId: 'a0520ae9-6fc7-4bde-9273-066bfba7eddf',
		provider: 'Testbetreiber',
		privacyUrl: `${trackerOrigin}/privacy`,
		privacyDetails: 'Testkonfiguration'
	};
	const revision = createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 20);
	const [previous] = await sql`select value from settings where key = ${legacyKey}`;

	try {
		await sql`insert into settings (key, value) values (${legacyKey}, ${sql.json(config)})
			on conflict (key) do update set value = excluded.value`;

		const trackerRequests: string[] = [];
		await context.route(`${trackerOrigin}/**`, async (route) => {
			trackerRequests.push(route.request().url());
			await route.abort();
		});
		await context.addCookies([
			{ name: 'analytics-consent', value: `${revision}.yes`, url: baseURL! }
		]);

		await page.goto('/');
		await expect(
			page.locator('.hero').getByRole('link', { name: 'Jetzt Bibel lesen', exact: true })
		).toBeVisible();
		await expect(page.getByText('Freiwillige Nutzungsanalyse')).toHaveCount(0);
		expect((await context.cookies()).some(({ name }) => name === 'analytics-consent')).toBe(false);

		await page.goto('/datenschutz#konto-loeschen');
		await expect(page.getByRole('heading', { name: 'Datenschutzerklärung' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Akribos-Konto und Daten löschen' })
		).toBeVisible();
		await expect(page.getByText(/Umami|Freiwillige Nutzungsanalyse/)).toHaveCount(0);
		expect(trackerRequests).toEqual([]);

		await seedAdminSession(context);
		await page.goto('/admin');
		await expect(page).toHaveURL('/admin');
		await expect(page.getByRole('link', { name: 'Umami', exact: true })).toHaveCount(0);
		const retired = await page.request.get('/admin/analytics', { maxRedirects: 0 });
		expect(retired.ok()).toBe(false);
	} finally {
		if (previous)
			await sql`update settings set value = ${sql.json(previous.value)} where key = ${legacyKey}`;
		else await sql`delete from settings where key = ${legacyKey}`;
		await sql.end();
	}
});
