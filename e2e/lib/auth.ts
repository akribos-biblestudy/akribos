import { expect, type Page } from '@playwright/test';
import { lastMailLinkTo } from './mail-outbox.ts';

/** Existing feature tests need named accounts with passwords, now set after email confirmation. */
export async function registerWithPassword(
	page: Page,
	email: string,
	password: string,
	displayName: string
) {
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await expect(page.getByLabel('Anmeldecode')).toBeVisible();
	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
	await page.getByLabel('Anzeigename').fill(displayName);
	await page
		.locator('form[action="?/profile"]')
		.getByRole('button', { name: 'Speichern', exact: true })
		.click();
	await expect(page.getByText('Gespeichert.', { exact: true })).toBeVisible();
	await page.getByLabel('Neues Passwort', { exact: true }).fill(password);
	await page.getByLabel('Passwort wiederholen').fill(password);
	await page
		.locator('form[action="?/password"]')
		.getByRole('button', { name: 'Speichern', exact: true })
		.click();
	await expect(page.getByLabel('Aktuelles Passwort')).toBeVisible();
}
