import { expect, test } from '@playwright/test';

for (const javaScriptEnabled of [true, false]) {
	test(`native login preserves its same-origin POST with JavaScript ${javaScriptEnabled}`, async ({
		browser,
		baseURL
	}) => {
		const origin = new URL(baseURL!).origin;
		const context = await browser.newContext({ baseURL: origin, javaScriptEnabled });
		try {
			const page = await context.newPage();
			await page.goto('/login?redirectTo=%2Faccount');
			await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
			await page.getByRole('button', { name: 'Weiter', exact: true }).click();
			await page.getByLabel('Passwort').fill('seed-admin-password');
			const [response] = await Promise.all([
				page.waitForResponse(
					(response) =>
						response.request().method() === 'POST' && new URL(response.url()).pathname === '/login'
				),
				page.getByRole('button', { name: 'Anmelden', exact: true }).click()
			]);
			expect(response.status()).toBe(303);
			expect(await response.request().headerValue('origin')).toBe(origin);
			await expect(page).toHaveURL(/\/account$/);
		} finally {
			await context.close();
		}
	});
}

test('login rejects null and cross-origin form submissions', async ({ request }) => {
	for (const origin of ['null', 'https://untrusted.example.test']) {
		const response = await request.post('/login?/login', {
			headers: { origin },
			form: { email: '', password: '' }
		});
		expect(response.status(), origin).toBe(403);
	}
});
