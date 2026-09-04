import { expect, test } from '@playwright/test';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * The product tour: automatic for a first-time reader (signed out and signed in), restartable from
 * the menu, and reduced to the signed-in-only steps for someone who already finished it while signed
 * out. Runs against the fixture from `pnpm db:seed` (SEEDDE + SEEDPLAIN on `/Joh3`, see reader.e2e.ts).
 *
 * The automatic first-run sequence belongs to the reader; route-specific tours for documents and
 * sermons can additionally be started from the menu. Visiting `/Joh3` is what "a new visitor" means
 * for these tests.
 *
 * Every other suite's context starts with the signed-out tour already marked done (see
 * `playwright.config.ts`), so its overlay never gets in the way of an unrelated test's clicks. This
 * suite is the exception: it needs an actually first-time visitor, so it resets to a cookie-less
 * context.
 */
test.use({ storageState: { cookies: [], origins: [] } });

function uniqueEmail(): string {
	return `e2e-tour-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const PASSWORD = 'ein-sicheres-passwort';

async function register(page: import('@playwright/test').Page, email: string): Promise<void> {
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('E2E');
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/\/register\/check-email$/);

	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);
}

test('a new guest sees the product tour automatically and it stays closed once dismissed', async ({
	page
}) => {
	await page.goto('/Joh3');

	const tour = page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' });
	await expect(tour).toBeVisible();
	await expect(page.getByText('Schritt 1 von 6')).toBeVisible();

	await page.getByRole('button', { name: 'Tour überspringen' }).click();
	await expect(tour).toHaveCount(0);

	// A fresh visit — even a different chapter — must not offer it again on its own.
	await page.goto('/Joh4');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toHaveCount(0);
});

test('the tour walks through its signed-out steps with Weiter and can be finished', async ({
	page
}) => {
	await page.goto('/Joh3');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toBeVisible();
	await page.getByRole('button', { name: 'Weiter' }).click();
	await expect(page.getByRole('dialog', { name: 'Stelle und Werk durchsuchen' })).toBeVisible();

	await page.getByRole('button', { name: 'Weiter' }).click();
	await expect(page.getByRole('dialog', { name: 'Wortstudie' })).toBeVisible();

	// Zurück returns to the previous step instead of advancing.
	await page.getByRole('button', { name: 'Zurück' }).click();
	await expect(page.getByRole('dialog', { name: 'Stelle und Werk durchsuchen' })).toBeVisible();
	await page.getByRole('button', { name: 'Weiter' }).click();

	await page.getByRole('button', { name: 'Weiter' }).click(); // -> Werkauswahl
	await expect(page.getByRole('dialog', { name: 'Werkauswahl' })).toBeVisible();
	await page.getByRole('button', { name: 'Weiter' }).click(); // -> Tabs verknüpfen
	await expect(page.getByRole('dialog', { name: 'Tabs verknüpfen' })).toBeVisible();
	await page.getByRole('button', { name: 'Weiter' }).click(); // -> Tab hinzufügen, the last step
	await expect(page.getByRole('dialog', { name: 'Tab hinzufügen' })).toBeVisible();

	// Last step for a guest: its button reads "Fertig" rather than "Weiter".
	await page.getByRole('button', { name: 'Fertig' }).click();
	await expect(page.getByRole('dialog', { name: 'Tab hinzufügen' })).toHaveCount(0);

	await page.goto('/Joh3');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toHaveCount(0);
});

test('the "Produkt-Tour" menu item restarts it from the beginning', async ({ page }) => {
	await page.goto('/Joh3');
	await page.getByRole('button', { name: 'Tour überspringen' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await page.getByRole('menuitem', { name: 'Produkt-Tour' }).click();

	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toBeVisible();
	await expect(page.getByText('Schritt 1 von 6')).toBeVisible();
});

test('escape closes the tour and counts as dismissed', async ({ page }) => {
	await page.goto('/Joh3');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.goto('/Joh3');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toHaveCount(0);
});

test('someone who already finished the guest tour only sees the signed-in-only steps after registering', async ({
	page
}) => {
	// Finish the tour as a guest first, in the same browser context registration will reuse.
	await page.goto('/Joh3');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toBeVisible();
	await page.getByRole('button', { name: 'Tour überspringen' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await register(page, uniqueEmail());

	// Registration lands on /account, which has nothing for the tour to point at; the reader does.
	await page.goto('/Joh3');
	const tour = page.getByRole('dialog', { name: 'Versmenü' });
	await expect(tour).toBeVisible();
	await expect(page.getByText('Schritt 2 von 3')).toBeVisible();

	await page.getByRole('button', { name: 'Weiter' }).click();
	await expect(page.getByRole('dialog', { name: 'Dein Konto' })).toBeVisible();
	// `complete()` fires the account-level "done" request without the click handler waiting for it
	// (see the `keepalive` comment in `ProductTour.svelte`), so it can still be in flight when this
	// test moves on. Waiting for it here — something a real reader idly would too, just by not
	// reloading the very same instant — is what makes the next navigation's server-side read of
	// `tourCompletedAt` deterministic.
	const completed = page.waitForResponse('/api/tour');
	await page.getByRole('button', { name: 'Fertig' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await completed;

	await page.goto('/Joh3');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('someone who never saw the guest tour gets the full sequence once signed in', async ({
	page
}) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await expect(page.getByRole('dialog', { name: 'Reader-Layout und Notizspalte' })).toBeVisible();
	await expect(page.getByText('Schritt 1 von 9')).toBeVisible();
});
