import { expect, test } from '@playwright/test';

test('feedback table uses wide screens and scrolls locally on small screens', async ({ page }) => {
	await page.goto('/login?redirectTo=%2Fadmin%2Ffeedback');
	await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/feedback/);

	const table = page.getByRole('table', { name: 'Feedbackmeldungen' });
	const wrapper = table.locator('..');
	for (const width of [1440, 1608, 1920]) {
		await page.setViewportSize({ width, height: 900 });
		await expect
			.poll(() => wrapper.evaluate((element) => element.scrollWidth - element.clientWidth))
			.toBeLessThanOrEqual(1);
		const bounds = await table.boundingBox();
		expect(bounds?.width).toBeGreaterThan(width - 350);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(() => wrapper.evaluate((element) => element.scrollWidth - element.clientWidth))
		.toBeGreaterThan(100);
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
});
