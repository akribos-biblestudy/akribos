import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { feedbackReports } from '../src/lib/server/db/feedback-schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('captures the complete page URL at the feedback click without an editable page field', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const description = `URL-Kontext ${randomUUID()}`;
	try {
		await page.goto('/login?redirectTo=%2Faccount');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/account$/);
		await page.goto(`/help?probe=vollstaendig&other=${'x'.repeat(900)}#lesezeichen`);
		const source = page.url();
		await page.getByRole('button', { name: 'Konto-Menü' }).click();
		await page.getByRole('menuitem', { name: 'Feedback geben' }).click();
		await expect(page).toHaveURL(/\/feedback$/);
		await expect(page.locator('input[name="page"]')).toHaveValue(source);
		await page.reload();
		await expect(page.locator('input[name="page"]')).toHaveValue(source);
		await expect(page.getByLabel(/Betroffene Seite/)).toHaveCount(0);
		await page.getByLabel('Art des Feedbacks').selectOption('other');
		await page.getByLabel('Beschreibung').fill(description);
		await page.getByRole('button', { name: 'Feedback senden' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Vielen Dank' })).toBeVisible();
		const [report] = await db
			.select()
			.from(feedbackReports)
			.where(eq(feedbackReports.description, description));
		expect(report?.page).toBe(source);
		const invalid = await page.request.post('/feedback', {
			headers: { origin: 'http://localhost:4173', accept: 'text/html' },
			form: { category: 'other', description: 'Ungültige URL', page: 'javascript:alert(1)' }
		});
		expect(invalid.status()).toBe(400);
		const tooLong = await page.request.post('/feedback', {
			headers: { origin: 'http://localhost:4173', accept: 'text/html' },
			form: {
				category: 'other',
				description: 'Zu lange URL',
				page: `http://localhost:4173/${'x'.repeat(65536)}`
			}
		});
		expect(tooLong.status()).toBe(400);
	} finally {
		await db.delete(feedbackReports).where(eq(feedbackReports.description, description));
		await client.end();
	}
});
