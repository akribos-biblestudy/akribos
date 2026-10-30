import { expect, test } from '@playwright/test';
import { parseReference } from '../src/lib/bible/reference';

for (const signedIn of [false, true]) {
	test(`startup reveals only the final reader, signed in: ${signedIn}`, async ({
		page,
		context
	}) => {
		await context.clearCookies();
		await context.addCookies([
			{ name: 'tour-guest-done', value: '1', domain: 'localhost', path: '/' }
		]);
		if (signedIn) {
			const response = await page.request.post('/login?/login', {
				form: { email: 'reader@example.com', password: 'seed-reader-password' },
				headers: { origin: 'http://localhost:4173' }
			});
			expect(response.ok()).toBe(true);
		}
		let release!: () => void;
		const scripts = new Promise<void>((resolve) => (release = resolve));
		let releaseData!: () => void;
		const data = new Promise<void>((resolve) => (releaseData = resolve));
		let requestedData!: () => void;
		const dataRequested = new Promise<void>((resolve) => (requestedData = resolve));
		await page.route('**/_app/**/*.js', async (route) => {
			await scripts;
			await route.continue();
		});
		await page.route('**/__data.json*', async (route) => {
			requestedData();
			await data;
			await route.continue();
		});
		try {
			await page.goto('/', { waitUntil: 'commit' });
			const logo = page.getByRole('img', { name: 'Akribos', exact: true, includeHidden: true });
			await logo.waitFor({ state: 'attached' });
			// A slow module download must never expose the provisional server view before hiding it.
			await expect(logo).toBeHidden();
			release();
			await dataRequested;
			await expect(logo).toBeHidden();
			releaseData();
			await expect(logo).toBeVisible();
			await expect(page.locator('.reader-tile').first()).toBeVisible();
			await expect(page.locator('html')).not.toHaveAttribute('data-reader-bootstrapping');
			if (!signedIn) await expect(page.locator('.reader-tile')).toHaveCount(3);
		} finally {
			release();
			releaseData();
		}
	});
}

test('a first visit without JavaScript keeps the server-rendered Bible usable', async ({
	browser
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		storageState: { cookies: [], origins: [] }
	});
	try {
		const page = await context.newPage();
		await page.goto('/');
		await expect(page.locator('.reader-tile')).toHaveCount(1);
		await expect(page.locator('.reader-tile')).toBeVisible();
		await expect(page.getByRole('img', { name: 'Akribos', exact: true })).toBeVisible();
	} finally {
		await context.close();
	}
});

for (const javaScriptEnabled of [true, false]) {
	test(`password sign-in opens the Bible by default, JavaScript: ${javaScriptEnabled}`, async ({
		browser
	}) => {
		const context = await browser.newContext({ javaScriptEnabled });
		try {
			const page = await context.newPage();
			await page.goto('/login');
			await page.getByLabel('E-Mail-Adresse').fill('reader@example.com');
			await page.getByRole('button', { name: 'Weiter', exact: true }).click();
			await page.getByLabel('Passwort', { exact: true }).fill('seed-reader-password');
			await expect(page.locator('input[name="redirectTo"]').first()).toHaveValue('/');
			await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
			// Existing accounts resume their saved passage rather than always resetting to John 1.
			await expect(page).toHaveURL((url) => parseReference(url.pathname.slice(1)) !== null);
			await expect(page.locator('.reader-tile').first()).toBeVisible();
		} finally {
			await context.close();
		}
	});
}
