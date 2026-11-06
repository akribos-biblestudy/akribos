import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { registerWithPassword } from './lib/auth.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	bibleDownloadGrants,
	resourceBooks,
	resources,
	users,
	verses
} from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('public Bible downloads require a grant and admin routes remain private', async ({
	page,
	browser
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const id = `DOWNLOAD-TEST-${randomUUID()}`;
	const email = `download-${randomUUID()}@example.com`;
	const adminContext = await browser.newContext({ baseURL: 'http://localhost:4173' });
	try {
		await db.insert(resources).values({
			id,
			kind: 'bible',
			name: id,
			abbrev: 'Test',
			language: 'de',
			isPublic: true,
			status: 'ready',
			verseCount: 1
		});
		await db
			.insert(resourceBooks)
			.values({ resourceId: id, bookId: 43, chapterCount: 1, verseCount: 1 });
		await db.insert(verses).values({
			resourceId: id,
			bookId: 43,
			chapter: 1,
			verse: 1,
			segments: ['Testtext'],
			text: 'Testtext'
		});
		expect((await page.request.get(`/downloads/${id}`)).status()).toBe(404);
		expect((await page.request.get(`/downloads/${id}?format=usx`)).status()).toBe(404);
		await registerWithPassword(page, email, 'ein-sicheres-passwort', 'Testperson');
		expect((await page.request.get(`/admin/bible-downloads/${id}`)).status()).toBe(404);
		expect(
			(
				await page.request.post('/admin/bible-downloads?/restore', {
					form: { confirm: id },
					headers: { origin: 'http://localhost:4173' }
				})
			).status()
		).toBe(404);
		const admin = await adminContext.newPage();
		await admin.goto('/login?redirectTo=%2Faccount');
		await admin.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await admin.getByRole('button', { name: 'Weiter', exact: true }).click();
		await admin.getByLabel('Passwort').fill('seed-admin-password');
		await admin.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(admin).toHaveURL(/\/account$/);
		expect((await admin.request.get(`/admin/bible-downloads/${id}`)).status()).toBe(200);
		await admin.goto('/admin/bible-downloads');
		const entry = admin.locator('li').filter({ hasText: id });
		await admin.setViewportSize({ width: 390, height: 844 });
		await expect(entry.getByLabel(/Ich bestätige/)).toBeVisible();
		expect(
			await admin.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
		).toBeLessThanOrEqual(1);
		await admin.setViewportSize({ width: 1280, height: 900 });
		await entry.getByLabel(/Ich bestätige/).check();
		await entry.getByRole('button', { name: 'Öffentlichen Download freigeben' }).click();
		await expect(entry).toContainText('Öffentlicher Download freigegeben');
		expect((await page.request.get(`/downloads/${id}`)).status()).toBe(200);
		expect((await page.request.get(`/downloads/${id}?format=usx`)).status()).toBe(200);
		await entry.getByRole('button', { name: 'Freigabe aufheben' }).click();
		expect((await page.request.get(`/downloads/${id}`)).status()).toBe(404);
		await entry.getByLabel(/Ich bestätige/).check();
		await entry.getByRole('button', { name: 'Öffentlichen Download freigeben' }).click();
		const result = await admin.request.post('/admin/resources?/save', {
			form: { id },
			headers: { origin: 'http://localhost:4173' }
		});
		expect(result.status()).toBe(200);
		expect(
			await db.select().from(bibleDownloadGrants).where(eq(bibleDownloadGrants.resourceId, id))
		).toHaveLength(0);
		expect((await page.request.get(`/downloads/${id}`)).status()).toBe(404);
		await db.update(resources).set({ isPublic: true }).where(eq(resources.id, id));
		expect((await page.request.get(`/downloads/${id}`)).status()).toBe(404);
	} finally {
		await db.delete(resources).where(eq(resources.id, id));
		await db.delete(users).where(eq(users.email, email));
		await adminContext.close();
		await client.end();
	}
});
