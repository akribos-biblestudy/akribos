import { expect, test } from '@playwright/test';

test.use({
	storageState: {
		cookies: [
			{
				name: 'tour-guest-done',
				value: '1',
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: false,
				secure: false,
				sameSite: 'Lax'
			}
		],
		origins: []
	}
});

for (const [width, height, columns] of [
	[390, 844, 1],
	[900, 1200, 2],
	[1440, 900, 3],
	[3840, 2160, 4]
] as const) {
	test(`a first visit at ${width}px starts with ${columns} complementary columns and keeps the choice`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height });
		await page.goto('/');
		const layout = columns === 1 ? 'single' : `columns-${columns}`;
		await expect(page).toHaveURL((url) => url.searchParams.get('layout') === layout);
		await expect(page.locator('.reader-tile')).toHaveCount(columns);
		expect(new URL(page.url()).searchParams.getAll('tab').map((tab) => tab.split(':')[1])).toEqual(
			['SEEDDE', 'SEEDCOMMENTARY', 'STRONGS_GREEK', 'SEEDTSK'].slice(0, columns)
		);
		await expect(page.locator('.flow-column[data-resource-id="SEEDDE"]')).toBeVisible();
		await page.setViewportSize({ width: width === 390 ? 3840 : 390, height: 900 });
		await page.goto('/Joh3');
		await expect(page).toHaveURL((url) => url.searchParams.get('layout') === layout);
		await page.reload();
		await expect(page).toHaveURL((url) => url.searchParams.get('layout') === layout);
	});
}

test('the 4K header puts the logo at the left and the controls at the right edge', async ({
	page
}) => {
	await page.setViewportSize({ width: 3840, height: 2160 });
	for (const route of ['/Joh3', '/help']) {
		await page.goto(route);
		const header = page.getByRole('banner');
		const bounds = await header.boundingBox();
		const logo = await header.getByRole('link', { name: 'Akribos – Startseite' }).boundingBox();
		const controls = await header.locator('nav').boundingBox();
		expect(logo!.x).toBeLessThanOrEqual(24);
		expect(bounds!.x + bounds!.width - controls!.x - controls!.width).toBeLessThanOrEqual(24);
	}
});

test('a copied workspace wins over the first-visit viewport choice', async ({ page }) => {
	await page.setViewportSize({ width: 3840, height: 2160 });
	await page.goto('/Joh3?layout=single&tab=1.1:SEEDPLAIN:A:Joh3&active=1.1&focus=1.1');
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await expect(page.locator('.flow-column[data-resource-id="SEEDPLAIN"]')).toBeVisible();
	await page.reload();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await expect(page.locator('.flow-column[data-resource-id="SEEDPLAIN"]')).toBeVisible();
	await page.goto('/Joh3');
	await expect(page).toHaveURL((url) => url.searchParams.get('layout') === 'columns-4');
	await expect(page.locator('.flow-column[data-resource-id="SEEDDE"]')).toBeVisible();
});

test('a first visit without JavaScript still shows the first Bible', async ({ browser }) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 }
	});
	try {
		const page = await context.newPage();
		const response = await page.goto('http://localhost:4173/Joh3');
		expect(response?.status()).toBe(200);
		expect(response?.headers()['cache-control']).toBe('private, no-store');
		await expect(page.locator('.reader-tile')).toHaveCount(1);
		await expect(page.locator('.flow-column[data-resource-id="SEEDDE"]')).toBeVisible();
	} finally {
		await context.close();
	}
});
