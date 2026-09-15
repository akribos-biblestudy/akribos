import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { resources } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('resource metadata stays populated after unchanged and edited saves and resource switches', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const ids = [randomUUID(), randomUUID()].map((id) => `META_${id}`);
	try {
		await db.insert(resources).values(
			ids.map((id, index) => ({
				id,
				name: `Metadata ${index}`,
				abbrev: `M${index}`,
				kind: 'bible' as const,
				language: 'de',
				status: 'ready' as const,
				isPublic: true,
				sortOrder: 99999,
				coverTitle: `Cover ${index}`,
				tabTitle: `Tab ${index}`,
				selectionTitle: `Selection ${index}`,
				selectionSubtitle: `Subtitle ${index}`,
				licenseHtml: `<p>Rights ${index}</p>`
			}))
		);
		await page.goto('/login');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/account$/);
		await page.goto(`/admin/resources?resource=${ids[0]}`);
		const form = page.locator('form[action^="?/save"]');
		const values = {
			coverTitle: 'Cover 0',
			tabTitle: 'Tab 0',
			selectionTitle: 'Selection 0',
			selectionSubtitle: 'Subtitle 0',
			licenseHtml: '<p>Rights 0</p>'
		};
		const assertValues = async () => {
			for (const [name, value] of Object.entries(values))
				await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
			await expect(form.getByLabel('Öffentlich sichtbar')).toBeChecked();
		};
		await assertValues();
		await form.getByRole('button', { name: 'Änderungen speichern' }).click();
		await expect(page.getByText(`${ids[0]} wurde gespeichert.`, { exact: true })).toBeVisible();
		await assertValues();
		values.tabTitle = 'Edited tab';
		values.selectionSubtitle = '';
		await form.getByLabel('Tab-Titel').fill(values.tabTitle);
		await form.getByLabel('Untertitel in der Auswahl').fill('');
		const saved = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && new URL(response.url()).searchParams.has('/save')
		);
		await form.getByRole('button', { name: 'Änderungen speichern' }).click();
		await saved;
		await assertValues();
		await page.reload();
		await assertValues();
		await page.getByRole('button', { name: `${ids[1]} bearbeiten`, exact: true }).click();
		await expect(form.getByLabel('Tab-Titel')).toHaveValue('Tab 1');
		await page.getByRole('button', { name: `${ids[0]} bearbeiten`, exact: true }).click();
		await assertValues();
	} finally {
		await db.delete(resources).where(inArray(resources.id, ids));
		await client.end();
	}
});
