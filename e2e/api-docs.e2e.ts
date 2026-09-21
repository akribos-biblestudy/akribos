import { expect, test, type Page } from '@playwright/test';

async function hostAppearance(page: Page) {
	return page.evaluate(() => {
		const body = getComputedStyle(document.body);
		const header = getComputedStyle(document.querySelector('header')!);
		const heading = getComputedStyle(document.querySelector('h1')!);
		return {
			rootClasses: [...document.documentElement.classList].sort(),
			bodyClasses: [...document.body.classList].sort(),
			background: body.backgroundColor,
			backgroundImage: body.backgroundImage,
			color: body.color,
			font: body.fontFamily,
			lineHeight: body.lineHeight,
			overflow: body.overflow,
			headerBackground: header.backgroundColor,
			headerHeight: header.height,
			headingSize: heading.fontSize,
			headingColor: heading.color
		};
	});
}

for (const theme of ['light', 'dark']) {
	test(`interactive API reference restores the ${theme} application after SPA navigation`, async ({
		page,
		context,
		baseURL
	}) => {
		await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
		await page.goto('/help/api');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('API & Integrationen');
		const before = await hostAppearance(page);
		await page.evaluate(() => {
			Reflect.set(window, 'apiReferenceNavigationMarker', 'same-document');
		});

		// The second visit must recreate both the viewer and its styles from a cached route module.
		for (let visit = 0; visit < 2; visit += 1) {
			const reference = page.getByRole('link', { name: 'technischen API-Referenz' });
			await expect(reference).toHaveAttribute('href', '/api/docs');
			await reference.click();
			await expect(page).toHaveURL(/\/api\/docs(?:#.*)?$/);
			await expect(page.getByRole('heading', { name: 'Akribos API', exact: true })).toBeVisible();
			await expect(page.locator('.scalar-api-reference')).toBeVisible();

			// Scalar teleports this dialog into the document. It must stay styled while the viewer
			// is mounted, then disappear and release its scroll lock when browser Back leaves it.
			await page.keyboard.press('Control+k');
			const dialog = page.getByRole('dialog', { name: 'Search', exact: true });
			const search = dialog.getByRole('combobox', { name: 'Enter search query' });
			await expect(search).toBeVisible();
			const searchWidth = await search.evaluate((element) => element.getBoundingClientRect().width);
			expect(searchWidth).toBeGreaterThan(200);
			await search.fill('Resources');
			await expect(dialog.getByRole('option').first()).toContainText('Available bibles');
			await page.goBack();
			await expect(page).toHaveURL('/help/api');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('API & Integrationen');
			await expect(page.getByRole('dialog')).toHaveCount(0);
			await expect.poll(() => hostAppearance(page)).toEqual(before);
			expect(await page.evaluate(() => Reflect.get(window, 'apiReferenceNavigationMarker'))).toBe(
				'same-document'
			);
		}
	});
}
