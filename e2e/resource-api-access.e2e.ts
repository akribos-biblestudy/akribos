import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	apiKeys,
	resourceBooks,
	resources,
	resourceUserGrants,
	users,
	verses
} from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('an administrator can disable API text while the granted Reader and previews remain usable', async ({
	page,
	request
}, testInfo) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const resourceId = `API-LICENCE-${randomUUID()}`;
	const token = randomUUID();
	const keyId = createHash('sha256').update(token).digest('hex');
	const chapterPath = `/api/v1/bibles/${resourceId}/43/3`;
	const text = 'Dieser Testtext bleibt im berechtigten Reader lesbar.';
	try {
		const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
		await db.insert(resources).values({
			id: resourceId,
			kind: 'bible',
			name: resourceId,
			abbrev: 'API-Test',
			language: 'de',
			status: 'ready',
			isPublic: false
		});
		await db
			.insert(resourceBooks)
			.values({ resourceId, bookId: 43, chapterCount: 3, verseCount: 1 });
		await db
			.insert(verses)
			.values({ resourceId, bookId: 43, chapter: 3, verse: 16, text, segments: [text] });
		await db.insert(resourceUserGrants).values({ resourceId, userId: admin!.id });
		await db.insert(apiKeys).values({
			id: keyId,
			userId: admin!.id,
			name: 'API licence regression',
			scope: 'personal',
			prefix: 'test'
		});
		const headers = { authorization: `Bearer ${token}` };
		expect((await request.get(chapterPath, { headers })).status()).toBe(200);
		expect((await request.get(`/api/reader/bibles/${resourceId}/43/3`, { headers })).status()).toBe(
			404
		);
		await page.goto('/login');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/account$/);
		await page.goto(`/admin/resources?resource=${resourceId}`);
		await expect(page.getByLabel('Über die öffentliche API abrufbar')).toBeChecked();
		await page.getByLabel('Über die öffentliche API abrufbar').uncheck();
		await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
		await expect(
			page.getByRole('status').filter({ hasText: `${resourceId} wurde gespeichert.` })
		).toBeVisible();
		await page
			.locator('form')
			.filter({ has: page.getByLabel('Über die öffentliche API abrufbar') })
			.screenshot({ path: testInfo.outputPath('resource-api-access-disabled.png') });
		expect((await request.get(chapterPath, { headers })).status()).toBe(404);
		const sameOrigin = await page.evaluate(async (path) => (await fetch(path)).status, chapterPath);
		expect(sameOrigin).toBe(404);
		const preview = await page.evaluate(async (id) => {
			const response = await fetch(`/api/reader/bibles/${id}/43/3`);
			return {
				status: response.status,
				body: await response.json(),
				cache: response.headers.get('cache-control')
			};
		}, resourceId);
		expect(preview.status).toBe(200);
		expect(preview.body.verses[0].segments).toEqual([text]);
		expect(preview.cache).toBe('private, no-store');
		await page.goto(`/Joh3,16?layout=single&tab=1.1:${resourceId}:A:Joh3,16&active=1.1&focus=1`);
		await expect(page.locator(`.flow-column[data-resource-id="${resourceId}"]`)).toContainText(
			text
		);
		await page.goto(`/admin/resources?resource=${resourceId}`);
		await expect(page.getByLabel('Über die öffentliche API abrufbar')).not.toBeChecked();
		await page.getByLabel('Über die öffentliche API abrufbar').check();
		await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
		await expect(
			page.getByRole('status').filter({ hasText: `${resourceId} wurde gespeichert.` })
		).toBeVisible();
		expect((await request.get(chapterPath, { headers })).status()).toBe(200);
	} finally {
		await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
		await db.delete(resources).where(eq(resources.id, resourceId));
		await client.end();
	}
});
