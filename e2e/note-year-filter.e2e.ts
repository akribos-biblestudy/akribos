import { expect, test } from '@playwright/test';
import { createDb } from '../src/lib/server/db/client.ts';
import { documents, users } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('filters notes by creation year before pagination and preserves the year across library links', async ({
	page
}) => {
	const email = `note-years-${crypto.randomUUID()}@example.com`;
	const password = 'ein-sicheres-passwort';
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	try {
		const [owner] = await db
			.insert(users)
			.values({
				email,
				passwordHash: await hashPassword(password),
				emailVerifiedAt: new Date(),
				tourCompletedAt: new Date()
			})
			.returning();
		await db.insert(documents).values([
			...Array.from({ length: 25 }, (_, index) => ({
				userId: owner.id,
				kind: 'note' as const,
				title: `Jahresnotiz ${index}`,
				bodyMarkdown: 'Joh 3,16',
				bodyHtml: '<p>Joh 3,16</p>',
				plainText: 'Joh 3,16',
				createdAt: new Date('2025-06-01T12:00:00Z')
			})),
			{
				userId: owner.id,
				kind: 'note',
				title: 'Ältere Notiz frisch bearbeitet',
				bodyMarkdown: '',
				bodyHtml: '',
				plainText: '',
				createdAt: new Date('2024-12-31T22:59:59Z'),
				updatedAt: new Date('2026-06-01T12:00:00Z')
			},
			{
				userId: owner.id,
				kind: 'note',
				title: 'Notiz 2026',
				bodyMarkdown: '',
				bodyHtml: '',
				plainText: '',
				createdAt: new Date('2026-06-01T12:00:00Z')
			}
		]);
	} finally {
		await client.end();
	}
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
	await page.goto('/notes');
	const year = page.getByLabel('Erstellungsjahr');
	await expect(year.locator('option')).toHaveText(['Alle Jahre', '2026', '2025', '2024']);
	await year.selectOption('2025');
	await page.getByRole('button', { name: 'Suchen', exact: true }).click();
	await expect(page.getByRole('heading', { name: /^Jahresnotiz / })).toHaveCount(24);
	await expect(page.getByRole('heading', { name: 'Notiz 2026', exact: true })).toHaveCount(0);
	await page
		.getByRole('navigation', { name: 'Notizseiten' })
		.getByRole('link', { name: 'Weiter' })
		.click();
	await expect(page.getByRole('heading', { name: /^Jahresnotiz / })).toHaveCount(1);
	await expect(page).toHaveURL(
		(url) => url.searchParams.get('year') === '2025' && url.searchParams.get('page') === '2'
	);
	await page.reload();
	await expect(year).toHaveValue('2025');
	await page.getByRole('heading', { name: /^Jahresnotiz / }).click();
	await page.getByRole('link', { name: 'Zur Notizbibliothek' }).click();
	await expect(page).toHaveURL(
		(url) => url.searchParams.get('year') === '2025' && url.searchParams.get('page') === '2'
	);
	await page
		.getByRole('navigation', { name: 'Schlagwörter' })
		.getByRole('link', { name: 'Alle', exact: true })
		.click();
	await expect(page).toHaveURL(
		(url) => url.searchParams.get('year') === '2025' && !url.searchParams.has('page')
	);
	await page.getByRole('link', { name: 'Listenansicht', exact: true }).click();
	await expect(page).toHaveURL(
		(url) => url.searchParams.get('year') === '2025' && url.searchParams.get('view') === 'list'
	);
	await page.goto('/notes?year=2024');
	await expect(page.getByRole('heading', { name: 'Ältere Notiz frisch bearbeitet' })).toBeVisible();
	await expect(page.locator('time')).toHaveText('Erstellt am 31.12.2024, 23:59');
	await page.goto('/notes?year=2023');
	await expect(year).toHaveValue('2023');
	await expect(page.getByText('Keine Dokumente passen zu diesen Filtern.')).toBeVisible();
	await page.goto('/notes?year=2025oops');
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Jahresnotiz / })).toHaveCount(0);
});
