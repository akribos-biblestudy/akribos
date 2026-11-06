import { expect, test } from '@playwright/test';
import { seedAdminSession } from './lib/admin-session.ts';

test('feedback table uses wide screens and scrolls locally on small screens', async ({ page }) => {
	await seedAdminSession(page.context());
	await page.goto('/admin/feedback');
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
