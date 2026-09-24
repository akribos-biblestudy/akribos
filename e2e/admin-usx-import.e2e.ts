import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { resources, resourceUserGrants, users } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

const id = `USXZIP-${randomUUID().toUpperCase()}`;
function fixture(broken = false) {
	return Buffer.from(
		zipSync({
			'metadata.xml': strToU8(
				`<DBLMetadata revision="7"><identification><nameLocal>USX Testbibel</nameLocal><abbreviation>${id}</abbreviation></identification><language><ldml>de</ldml></language><copyright><fullStatement><statementContent><p>Testrechte</p></statementContent></fullStatement></copyright></DBLMetadata>`
			),
			'books/GEN.usx': strToU8(
				'<usx version="3.0"><book code="GEN"/><chapter number="1"/><para style="p"><verse number="1"/>USX Anfang.<verse eid="GEN 1:1"/></para></usx>'
			),
			'books/JHN.usx': strToU8(
				broken
					? '<usx>'
					: '<usx version="3.0"><book code="JHN"/><chapter number="3"/><para style="s1">USX Überschrift</para><para style="p"><verse number="16-17"/>USX Lesetext<note style="f" caller="+"><char style="ft">USX Erläuterung.</char></note>.<verse eid="JHN 3:16-17"/></para></usx>'
			)
		})
	);
}

test('admin imports a USX ZIP as one Bible and a broken reimport preserves its text', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	try {
		// Keep this import private so other parallel suites retain the public seed Bible list.
		const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
		await db.insert(resources).values({
			id,
			kind: 'bible',
			name: 'USX Testbibel',
			abbrev: id,
			language: 'de',
			status: 'importing',
			isPublic: false
		});
		await db.insert(resourceUserGrants).values({ resourceId: id, userId: admin!.id });
		await page.goto('/login');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden' }).click();
		await page.goto('/admin/import');
		await expect(page.getByLabel('Format').locator('option[value="usx-zip"]')).toHaveText(
			'USX-ZIP (Bibel, mehrere Bücher)'
		);
		await page
			.getByLabel('Datei', { exact: true })
			.setInputFiles({ name: 'USX-Test.zip', mimeType: 'application/zip', buffer: fixture() });
		await page.getByRole('button', { name: 'Importieren', exact: true }).click();
		await expect(
			page.getByText('Import gestartet (usx-zip). Der Fortschritt erscheint unten.')
		).toBeVisible();
		await expect(
			page.locator('li').filter({ hasText: id }).filter({ hasText: 'fertig' })
		).toBeVisible({ timeout: 20000 });
		const response = await page.request.get(`/api/reader/bibles/${id}/43/3`);
		expect(response.ok()).toBe(true);
		const before = await response.json();
		expect(JSON.stringify(before)).toContain('USX Erläuterung.');
		expect(JSON.stringify(before)).toContain('USX Überschrift');
		const genesis = await page.request.get(`/api/reader/bibles/${id}/1/1`);
		expect(await genesis.text()).toContain('USX Anfang.');

		await page.goto(`/Joh3,16?layout=single&tab=1.1:${id}:A:Joh3,16&active=1.1&focus=1`);
		await expect(
			page.locator('.flow-column').getByText('USX Lesetext', { exact: false })
		).toBeVisible();

		await page.getByRole('button', { name: 'Hinweis * öffnen' }).click();
		await expect(page.getByRole('note')).toHaveText('USX Erläuterung.');

		await page.goto('/admin/import');
		await page
			.getByLabel('Datei', { exact: true })
			.setInputFiles({ name: 'USX-Test.zip', mimeType: 'application/zip', buffer: fixture(true) });
		await page.getByRole('button', { name: 'Importieren', exact: true }).click();
		await expect(page.getByText('fehlgeschlagen', { exact: true }).first()).toBeVisible({
			timeout: 20000
		});
		await expect(page.getByText(/Ungültiges USX-ZIP: books\/JHN.usx/)).toBeVisible();
		const after = await page.request.get(`/api/reader/bibles/${id}/43/3`);
		expect(await after.json()).toEqual(before);
	} finally {
		await db.delete(resources).where(eq(resources.id, id));
		await client.end();
	}
});
