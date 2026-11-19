import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { testUserSession } from './lib/admin-session.ts';
import { lastMailCodeTo } from './lib/mail-outbox.ts';

const deletionPage = '/datenschutz#konto-loeschen';
const dbUrl =
	process.env.E2E_DATABASE_URL ??
	testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('the existing app link can permanently delete a passwordless account', async ({
	page,
	browser,
	request,
	baseURL
}) => {
	const email = `e2e-delete-${randomUUID()}@example.com`;
	const { db, client } = createDb(dbUrl);
	const appContext = await browser.newContext({
		baseURL,
		extraHTTPHeaders: { 'x-akribos-app': '1' }
	});
	try {
		const [account] = await db
			.insert(users)
			.values({ email, emailVerifiedAt: new Date() })
			.returning({ id: users.id });
		const userId = account!.id;
		await testUserSession(appContext, email);
		const appBefore = await appContext.request.get('/api/app/bootstrap');
		expect(await appBefore.json()).toMatchObject({ data: { user: { id: userId } } });

		await page.goto(deletionPage);
		const section = page.locator('#konto-loeschen');
		await expect(
			section.getByRole('heading', { name: 'Akribos-Konto und Daten löschen' })
		).toBeInViewport();
		const deleteButton = section.getByRole('button', { name: 'Konto dauerhaft löschen' });
		await expect(deleteButton).toHaveCount(0);
		const postOptions = {
			headers: { accept: 'text/html', origin: new URL(page.url()).origin },
			maxRedirects: 0
		};
		const deletionAction = '/datenschutz?/deleteAccount';
		const guestAttempt = await request.post(deletionAction, {
			...postOptions,
			form: { userId, confirm: 'yes' }
		});
		expect(guestAttempt.status()).toBe(401);

		await section.getByRole('link', { name: 'Zur Anmeldung' }).click();
		await page.getByLabel('E-Mail-Adresse').fill(email);
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await expect(page.getByLabel('Anmeldecode')).toBeVisible();
		await expect(page.getByLabel('Passwort', { exact: true })).toHaveCount(0);
		await page.getByLabel('Anmeldecode').fill(await lastMailCodeTo(email));
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(new URL(deletionPage, baseURL).href);
		await expect(deleteButton).toBeVisible();

		const unconfirmed = await page.request.post(deletionAction, {
			...postOptions,
			form: { userId }
		});
		expect(unconfirmed.status()).toBe(400);
		const staleForm = await page.request.post(deletionAction, {
			...postOptions,
			form: { userId: randomUUID(), confirm: 'yes' }
		});
		expect(staleForm.status()).toBe(409);

		const confirmation = section.getByRole('checkbox', {
			name: 'Ich möchte dieses Konto und die zugehörigen Daten dauerhaft löschen.'
		});
		await expect(confirmation).not.toBeChecked();
		await confirmation.check();
		await deleteButton.click();
		await expect(section.getByRole('status')).toHaveText(
			'Dein Akribos-Konto wurde dauerhaft gelöscht.'
		);
		expect(await db.select({ id: users.id }).from(users).where(eq(users.id, userId))).toHaveLength(
			0
		);

		await page.goto('/account');
		await expect(page).toHaveURL(/\/login\?/);
		const appAfter = await appContext.request.get('/api/app/bootstrap');
		expect(await appAfter.json()).toMatchObject({ data: { user: null } });
	} finally {
		await appContext.close();
		try {
			await db.delete(users).where(eq(users.email, email));
		} finally {
			await client.end();
		}
	}
});
