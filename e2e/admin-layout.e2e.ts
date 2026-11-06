import { expect, test } from '@playwright/test';
import { seedAdminSession } from './lib/admin-session.ts';

test('administration uses the available width and offers accessible navigation on mobile', async ({
	page
}) => {
	await seedAdminSession(page.context());
	await page.goto('/admin/import');
	await expect(page).toHaveURL(/\/admin\/import/);

	for (const width of [1440, 1920]) {
		await page.setViewportSize({ width, height: 900 });
		const currentLink = page
			.getByRole('navigation', { name: 'Verwaltungsbereiche' })
			.getByRole('link', { name: 'Importieren' });
		await expect(currentLink).toHaveAttribute('aria-current', 'page');
		const header = page
			.getByRole('heading', { name: 'Ressource importieren' })
			.locator('xpath=../..');
		const bounds = await header.boundingBox();
		expect(bounds).not.toBeNull();
		expect(bounds!.x + bounds!.width).toBeGreaterThan(width - 50);
	}

	await page.setViewportSize({ width: 390, height: 844 });
	const menu = page
		.locator('details')
		.filter({ has: page.getByText('Verwaltung', { exact: true }) })
		.first();
	await expect(menu.locator('summary')).toContainText('Importieren');
	await menu.locator('summary').click();
	const nav = menu.getByRole('navigation', { name: 'Verwaltungsbereiche' });
	await expect(nav.getByRole('link', { name: 'Importieren' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await nav.getByRole('link', { name: 'Feedback', exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/feedback/);
	await expect(menu.locator('summary')).toContainText('Feedback');
	await expect(menu).not.toHaveAttribute('open', '');
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
});
