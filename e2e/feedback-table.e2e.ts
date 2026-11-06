import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { createDb } from '../src/lib/server/db/client.ts';
import { feedbackReports } from '../src/lib/server/db/feedback-schema.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('feedback table sorts, filters, previews and links locations; export uses the same filters', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const token = randomUUID();
	const prefix = `Test ${token}`;
	let ids: string[] = [];
	try {
		const [author] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, 'reader@example.com'));
		const inserted = await db
			.insert(feedbackReports)
			.values([
				{
					userId: author!.id,
					category: 'content',
					resourceId: 'SEEDDE',
					resourceName: 'Testübersetzung',
					location: 'Joh 3,16, Strong G25',
					description: `${prefix} A ${'langer Text '.repeat(15)}`
				},
				{
					userId: author!.id,
					category: 'content',
					resourceId: 'SEEDDE',
					resourceName: 'Testübersetzung',
					location: 'Joh 3,17',
					description: `${prefix} Z zweiter Eintrag`
				},
				{ userId: author!.id, category: 'application', description: `${prefix} Anwendung` }
			])
			.returning({ id: feedbackReports.id });
		ids = inserted.map((row) => row.id);
		await page.goto('/login?redirectTo=%2Fadmin%2Ffeedback');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/admin\/feedback/);
		await page.getByLabel('Feedback filtern').fill(prefix);
		await page.getByLabel('Kategorie filtern').selectOption('content');
		await page.getByRole('button', { name: 'Filter anwenden' }).click();
		const table = page.getByRole('table', { name: 'Feedbackmeldungen' });
		let rows = table.locator('tbody tr');
		await expect(rows).toHaveCount(2);
		await page.getByRole('link', { name: 'Feedback sortieren' }).click();
		rows = table.locator('tbody tr');
		await expect(rows.first()).toContainText(`${prefix} A`);
		await expect(rows.first()).toContainText('...');
		await expect(rows.first().getByRole('link', { name: 'Joh 3,16' })).toHaveAttribute(
			'href',
			/^\/Joh3,16\?/
		);
		await expect(rows.first().getByRole('link', { name: 'G25' })).toHaveAttribute('href', '/G25');
		const toggle = rows.first().getByRole('link', { name: 'Meldung öffnen' });
		await expect(rows.first().locator('td').first().getByRole('link')).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		await toggle.click();
		await expect(page.getByRole('article', { name: 'Meldungsdetails' })).toContainText(
			'langer Text '.repeat(10).trim()
		);
		await expect(rows.first().getByRole('link', { name: 'Meldung schließen' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		await rows.first().getByRole('link', { name: 'Meldung schließen' }).click();
		await expect(page.getByRole('article', { name: 'Meldungsdetails' })).toHaveCount(0);
		await page.getByLabel('Stelle filtern').fill('3,17');
		await page.getByLabel('Person filtern').fill('reader@example.com');
		await page.getByRole('button', { name: 'Filter anwenden' }).click();
		await expect(table.locator('tbody tr')).toHaveCount(1);
		await expect(table.locator('tbody tr').first()).toContainText(`${prefix} Z`);
		const href = await page
			.getByRole('link', { name: 'Inhaltliche Fehler als Excel exportieren' })
			.getAttribute('href');
		const exported = await page.request.get(href!);
		expect(exported.status()).toBe(200);
		const xml = strFromU8(unzipSync(await exported.body())['xl/worksheets/sheet1.xml']!);
		expect(xml).toContain(`${prefix} Z`);
		expect(xml).not.toContain(`${prefix} A`);
		expect(xml).not.toContain('reader@example.com');
	} finally {
		if (ids.length) await db.delete(feedbackReports).where(inArray(feedbackReports.id, ids));
		await client.end();
	}
});

test('pagination preserves filters and the export includes every matching report', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const token = `Seitenprobe ${randomUUID()}`;
	let ids: string[] = [];
	try {
		const reports = Array.from({ length: 51 }, (_, index) => ({
			category: 'content',
			resourceId: 'SEEDDE',
			resourceName: 'Testübersetzung',
			location: 'Joh 3,16',
			description: `${token} ${String(index).padStart(3, '0')}`
		}));
		ids = (
			await db.insert(feedbackReports).values(reports).returning({ id: feedbackReports.id })
		).map((row) => row.id);
		await page.goto('/login?redirectTo=%2Fadmin%2Ffeedback');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await page.getByLabel('Feedback filtern').fill(token);
		await page.getByRole('button', { name: 'Filter anwenden' }).click();
		await page.getByRole('link', { name: 'Feedback sortieren' }).click();
		const rows = page.getByRole('table', { name: 'Feedbackmeldungen' }).locator('tbody tr');
		await expect(rows).toHaveCount(50);
		await expect(rows.first()).toContainText(`${token} 000`);
		await page
			.getByRole('navigation', { name: 'Feedbackseiten' })
			.getByRole('link', { name: 'Weiter' })
			.click();
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText(`${token} 050`);
		const href = await page
			.getByRole('link', { name: 'Inhaltliche Fehler als Excel exportieren' })
			.getAttribute('href');
		const response = await page.request.get(href!);
		const xml = strFromU8(unzipSync(await response.body())['xl/worksheets/sheet1.xml']!);
		expect(xml).toContain(`${token} 000`);
		expect(xml).toContain(`${token} 050`);
	} finally {
		if (ids.length) await db.delete(feedbackReports).where(inArray(feedbackReports.id, ids));
		await client.end();
	}
});
