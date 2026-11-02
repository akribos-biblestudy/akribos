import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	lexiconEntries,
	resources,
	resourceUserGrants,
	users
} from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('an administrator can grant and revoke offline access to a lexicon', async ({
	page,
	request
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const resourceId = `OFFLINE-LEXICON-${randomUUID()}`;
	const path = `/api/app/offline/v2/lexicons/${resourceId}`;
	const headers = { 'x-akribos-app': '1' };
	try {
		const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
		await db.insert(resources).values({
			id: resourceId,
			kind: 'lexicon',
			name: resourceId,
			abbrev: 'Offline lexicon',
			language: 'grc',
			status: 'ready',
			isPublic: false,
			sortOrder: 99999,
			offlineEnabled: false
		});
		await db.insert(resourceUserGrants).values({ resourceId, userId: admin!.id });
		await db.insert(lexiconEntries).values({
			resourceId,
			strong: 'G26',
			language: 'grc',
			lemma: 'ἀγάπη',
			definitionHtml: '<p>love</p>'
		});
		expect((await request.get(path, { headers })).status()).toBe(404);
		await page.goto('/login?redirectTo=%2Faccount');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/account$/);
		await page.goto(`/admin/resources?resource=${resourceId}`);
		const offline = page.getByLabel('Offline-Nutzung erlauben');
		await expect(offline).not.toBeChecked();
		await offline.check();
		await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
		await expect(
			page.getByRole('status').filter({ hasText: `${resourceId} wurde gespeichert.` })
		).toBeVisible();
		const packageResponse = await page.request.get(path, { headers });
		expect(packageResponse.status()).toBe(200);
		expect(await packageResponse.json()).toMatchObject({
			version: 2,
			resource: { id: resourceId, kind: 'lexicon' },
			entries: [{ strong: 'G26', lemma: 'ἀγάπη' }]
		});
		expect((await request.get(path, { headers })).status()).toBe(404);
		await page.reload();
		await expect(offline).toBeChecked();
		await offline.uncheck();
		await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
		await expect(
			page.getByRole('status').filter({ hasText: `${resourceId} wurde gespeichert.` })
		).toBeVisible();
		expect((await page.request.get(path, { headers })).status()).toBe(404);
	} finally {
		await db.delete(resources).where(eq(resources.id, resourceId));
		await client.end();
	}
});
