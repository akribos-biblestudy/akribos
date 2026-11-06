import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { registerWithPassword } from './lib/auth.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { feedbackReports } from '../src/lib/server/db/feedback-schema.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('feedback stays private, survives account deletion and exports only content without account data', async ({
	page,
	browser
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const email = `feedback-${randomUUID()}@example.com`;
	const description = `Textfehler ${randomUUID()}`;
	let reportId: string | undefined;
	const adminContext = await browser.newContext({ baseURL: 'http://localhost:4173' });
	try {
		await page.goto('/feedback');
		await expect(page).toHaveURL(/\/login/);
		await registerWithPassword(page, email, 'ein-sicheres-passwort', 'Testperson');
		expect((await page.request.get('/admin/feedback')).status()).toBe(404);
		await page.goto('/feedback');
		await page.getByLabel('Werk (erforderlich)').selectOption('SEEDDE');
		await page.getByLabel('Stelle (erforderlich)').fill('Joh 3,16, Wort 2');
		await page.getByLabel('Beschreibung').fill(description);
		await page.getByLabel('Korrekturvorschlag (optional)').fill('=kein Ausdruck');
		await page.locator('input[type=file]').setInputFiles({
			name: 'hinweis.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('Anhang')
		});
		await page.getByRole('button', { name: 'Feedback senden' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Vielen Dank' })).toBeVisible();
		const [report] = await db
			.select()
			.from(feedbackReports)
			.where(eq(feedbackReports.description, description));
		expect(report).toBeDefined();
		reportId = report!.id;
		expect((await page.request.get(`/admin/feedback/${reportId}/attachment`)).status()).toBe(404);
		const admin = await adminContext.newPage();
		await admin.goto('/login?redirectTo=%2Faccount');
		await admin.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await admin.getByRole('button', { name: 'Weiter', exact: true }).click();
		await admin.getByLabel('Passwort').fill('seed-admin-password');
		await admin.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(admin).toHaveURL(/\/account$/);
		await admin.goto('/admin/feedback');
		const row = admin.getByRole('row').filter({ hasText: description });
		await expect(row).toContainText('Joh 3,16, Wort 2');
		await expect(row.getByRole('link', { name: 'Joh 3,16' })).toHaveAttribute(
			'href',
			/^\/Joh3,16\?/
		);
		await row.getByRole('link', { name: 'Meldung öffnen' }).click();
		const entry = admin.getByRole('article', { name: 'Meldungsdetails' });
		await expect(entry).toContainText(description);
		const attachment = await admin.request.get(`/admin/feedback/${reportId}/attachment`);
		expect(attachment.status()).toBe(200);
		expect(await attachment.text()).toBe('Anhang');
		expect(attachment.headers()['content-disposition']).toContain('attachment');
		const excel = await admin.request.get('/admin/feedback/export?resource=SEEDDE');
		expect(excel.status()).toBe(200);
		const files = unzipSync(await excel.body());
		const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
		expect(sheet).toContain(description);
		expect(sheet).toContain('=kein Ausdruck');
		expect(sheet).not.toContain(email);
		expect(sheet).not.toContain('Testperson');
		expect(sheet).not.toContain('<f>');
		const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
		const tooLarge = await page.request.post('/feedback', {
			headers: { origin: 'http://localhost:4173', accept: 'text/html' },
			multipart: {
				category: 'other',
				description: 'too big',
				attachment: {
					name: 'large.bin',
					mimeType: 'application/octet-stream',
					buffer: Buffer.alloc(4 * 1024 * 1024)
				}
			}
		});
		expect(tooLarge.status()).toBe(413);
		const limitDescription = `rate-${reportId}`;
		await db.insert(feedbackReports).values(
			Array.from({ length: 8 }, () => ({
				userId: user!.id,
				category: 'other',
				description: limitDescription
			}))
		);
		const submissions = await Promise.all(
			Array.from({ length: 2 }, () =>
				page.request.post('/feedback', {
					headers: { origin: 'http://localhost:4173', accept: 'text/html' },
					multipart: { category: 'other', description: limitDescription }
				})
			)
		);
		expect(submissions.map((response) => response.status()).sort()).toEqual([200, 429]);
		await db.delete(feedbackReports).where(eq(feedbackReports.description, limitDescription));
		await db.delete(users).where(eq(users.id, user!.id));
		const [remaining] = await db
			.select()
			.from(feedbackReports)
			.where(eq(feedbackReports.id, reportId));
		expect(remaining?.userId).toBeNull();
		expect(remaining?.description).toBe(description);
		await admin.reload();
		await expect(entry).toContainText('Konto gelöscht');
	} finally {
		await db.delete(feedbackReports).where(eq(feedbackReports.description, description));
		if (reportId)
			await db.delete(feedbackReports).where(eq(feedbackReports.description, `rate-${reportId}`));
		await db.delete(users).where(eq(users.email, email));
		await adminContext.close();
		await client.end();
	}
});
