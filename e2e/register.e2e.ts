import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { createEmailVerification } from '../src/lib/server/repositories/users.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { lastMailCodeTo, lastMailLinkTo } from './lib/mail-outbox.ts';

const PASSWORD = 'ein-sicheres-passwort';
const dbUrl =
	process.env.E2E_DATABASE_URL ??
	testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs');
function uniqueEmail() {
	return `e2e-login-${randomUUID()}@example.com`;
}
async function start(page: Page, email: string, route = '/login') {
	await page.goto(route);
	await expect(page.getByLabel('Passwort', { exact: true })).toHaveCount(0);
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
}

for (const javaScriptEnabled of [true, false]) {
	test(`a new reader registers with a code and can set a password with JavaScript ${javaScriptEnabled}`, async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled });
		const page = await context.newPage();
		const email = uniqueEmail();
		try {
			await start(page, email, '/register');
			await expect(page.getByLabel('Anmeldecode')).toBeVisible();
			const { db, client } = createDb(dbUrl);
			try {
				expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
			} finally {
				await client.end();
			}
			const code = await lastMailCodeTo(email);
			const link = await lastMailLinkTo(email);
			await page.reload();
			await expect(page.getByLabel('Anmeldecode')).toBeVisible();
			expect(await lastMailLinkTo(email)).toBe(link);
			await page.getByLabel('Anmeldecode').fill(`${code.slice(0, 3)} ${code.slice(3)}`);
			await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
			await expect(page).toHaveURL(/\/account$/);
			await expect(
				page.getByRole('heading', { name: 'Passwort festlegen', exact: true })
			).toBeVisible();
			await expect(page.getByLabel('Aktuelles Passwort')).toHaveCount(0);
			await page.getByLabel('Neues Passwort').fill(PASSWORD);
			await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
			await page
				.locator('form[action="?/password"]')
				.getByRole('button', { name: 'Speichern', exact: true })
				.click();
			await expect(page.getByLabel('Aktuelles Passwort')).toBeVisible();
			await page.getByRole('button', { name: 'Abmelden', exact: true }).click();
			await page.goto(link);
			await expect(page.getByRole('alert')).toContainText('bereits verwendet');
			await start(page, email);
			await expect(page.getByLabel('Passwort', { exact: true })).toBeVisible();
			await expect(page.getByLabel('Anmeldecode')).toHaveCount(0);
			await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
			await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
			await expect(page).toHaveURL(/\/account$/);
		} finally {
			await context.close();
		}
	});
}

test('a link works in another browser, previews do not consume it, and a passwordless account receives another email', async ({
	page,
	browser
}) => {
	const email = uniqueEmail();
	await start(page, email, '/login?redirectTo=%2Fnotes');
	const link = await lastMailLinkTo(email);
	const other = await browser.newContext();
	try {
		const confirmation = await other.newPage();
		const response = await confirmation.goto(link);
		expect(response?.headers()['cache-control']).toBe('private, no-store');
		await expect(confirmation.getByText(email, { exact: true })).toBeVisible();
		await confirmation.reload();
		await expect(confirmation.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible();
		await expect(page.getByLabel('Anmeldecode')).toBeVisible();
		await confirmation.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(confirmation).toHaveURL(/\/notes$/);
		await page.getByLabel('Anmeldecode').fill(await lastMailCodeTo(email));
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('bereits verwendet');
		await start(page, email, '/login?restart=1');
		await expect(page.getByLabel('Anmeldecode')).toBeVisible();
		expect(await lastMailLinkTo(email)).not.toBe(link);
		await page.getByLabel('Anmeldecode').fill(await lastMailCodeTo(email));
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/account$/);
	} finally {
		await other.close();
	}
});

test('resending replaces the old link and code; a wrong code can be corrected', async ({
	page
}) => {
	const email = uniqueEmail();
	await start(page, email);
	const previous = await lastMailLinkTo(email);
	await page.getByRole('button', { name: 'Anmelde-E-Mail erneut senden' }).click();
	await expect(page.getByLabel('Anmeldecode')).toBeVisible();
	const code = await lastMailCodeTo(email);
	expect(await lastMailLinkTo(email)).not.toBe(previous);
	const response = await page.request.get(previous);
	expect(await response.text()).toContain('bereits verwendet');
	await page.getByLabel('Anmeldecode').fill(code === '000000' ? '000001' : '000000');
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	await page.getByLabel('Anmeldecode').fill(code);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
});

test('a filled honeypot does not create an account or send a mail', async ({ page }) => {
	const email = uniqueEmail();
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.locator('input[name="company"]').fill('Acme');
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await expect(page.getByLabel('Anmeldecode')).toBeVisible();
	await page.goto('/account');
	await expect(page).toHaveURL(/\/login/);
	const { db, client } = createDb(dbUrl);
	try {
		expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
	} finally {
		await client.end();
	}
});

test('legacy password accounts still require email activation and their existing links work', async ({
	page
}) => {
	const email = uniqueEmail();
	const { db, client } = createDb(dbUrl);
	let token: string;
	try {
		const [user] = await db
			.insert(users)
			.values({ email, passwordHash: await hashPassword(PASSWORD) })
			.returning();
		token = await createEmailVerification(db, user!.id);
	} finally {
		await client.end();
	}
	await start(page, email);
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('bestätige');
	await page.getByRole('button', { name: 'Aktivierungslink erneut senden' }).click();
	await expect(page.getByText('ist eine neue E-Mail unterwegs')).toBeVisible();
	await page.goto(`/register/verify/${token}`);
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);
});
