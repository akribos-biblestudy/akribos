import { expect, test, type Page } from '@playwright/test';
import { registerWithPassword } from './lib/auth';

async function actualFonts(page: Page, selector: string) {
	const session = await page.context().newCDPSession(page);
	try {
		await session.send('DOM.enable');
		await session.send('CSS.enable');
		const { root } = await session.send('DOM.getDocument');
		const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
		const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
		return fonts.filter((font) => font.glyphCount > 0).map((font) => font.familyName);
	} finally {
		await session.detach();
	}
}

test('Akribos Text renders Latin and polytonic Greek with real styles and matching prose sizes', async ({
	page,
	context,
	baseURL
}) => {
	await context.addCookies([
		{ name: 'columns', value: 'SEEDDE,SEEDCOMMENTARY,STRONGS_GREEK', url: baseURL! }
	]);
	await page.goto('/Joh3,16');
	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(page.locator('.lexicon-body').first()).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	const bible = page.locator('.flow-verse').first();
	const commentary = page.locator('.commentary-body').first();
	const lexicon = page.locator('.lexicon-body').first();
	await expect(bible).toHaveCSS('font-size', '18px');
	await expect(commentary).toHaveCSS('font-size', '17px');
	await expect(lexicon).toHaveCSS('font-size', '17px');
	await expect(page.locator('.occurrence p').first()).toHaveCSS('font-size', '18px');
	expect(await actualFonts(page, '.flow-verse .verse-text')).toContain('Akribos Text');
	expect(await actualFonts(page, '.headword h2')).toContain('Akribos Text');

	// Loading every declared style verifies actual font decoding, not just a CSS family string.
	const styles = await page.evaluate(async () => {
		const sample = 'ÄÖÜ äöü ß ẞ ἀγάπη Ἐν ἀρχῇ λόγος';
		return Promise.all(
			[400, 600, 700].flatMap((weight) =>
				['normal', 'italic'].map(async (style) => {
					const faces = await document.fonts.load(`${style} ${weight} 18px "Akribos Text"`, sample);
					return faces.length > 0 && faces.every((face) => face.status === 'loaded');
				})
			)
		);
	});
	expect(styles).toEqual([true, true, true, true, true, true]);
	const label = page.locator('.lexicon-definition h3').first();
	const labelSize = await label.evaluate((element) => getComputedStyle(element).fontSize);
	await page.getByRole('button', { name: 'Bibeltext vergrößern' }).click();
	await expect(bible).toHaveCSS('font-size', '18.9px');
	await expect(commentary).toHaveCSS('font-size', '17.85px');
	await expect(lexicon).toHaveCSS('font-size', '17.85px');
	await expect(label).toHaveCSS('font-size', labelSize);
});

for (const [width, scale, theme] of [
	[320, 140, 'light'],
	[390, 85, 'dark'],
	[1440, 140, 'dark']
] as const) {
	test(`reading typography fits ${width}px at ${scale}% in ${theme}`, async ({
		page,
		context,
		baseURL
	}, testInfo) => {
		await page.setViewportSize({ width, height: 850 });
		await context.addCookies([
			{ name: 'reader-font-scale', value: String(scale), url: baseURL! },
			{ name: 'theme', value: theme, url: baseURL! }
		]);
		await page.goto('/Joh3,16');
		await page.evaluate(() => document.fonts.ready);
		await expect(page.locator('.flow-verse').first()).toHaveCSS(
			'font-size',
			`${(18 * scale) / 100}px`
		);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
		const column = page.locator('.flow-column:visible').first();
		expect(await column.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
			true
		);
		await page.screenshot({ path: testInfo.outputPath('reading.png'), fullPage: true });
	});
}

test('a delayed font keeps the current verse after navigation and keeps chapter-only URLs', async ({
	page
}) => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/akribos-text-regular*.woff2', async (route) => {
		await held;
		await route.continue();
	});
	try {
		await page.goto('/Joh3,16', { waitUntil: 'domcontentloaded' });
		const field = page.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ }).first();
		await field.fill('1Mo 1,3');
		await field.press('Enter');
		// toHaveURL waits for the load event, intentionally held open by the font request here.
		await expect.poll(() => new URL(page.url()).pathname).toBe('/1Mo1,3');
		release();
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveURL((url) => url.pathname === '/1Mo1,3');
		await expect
			.poll(() =>
				page
					.locator('.flow-column')
					.first()
					.evaluate((column) => {
						const verse = column.querySelector('[data-verse-key="1:1:3"]')!;
						return Math.abs(
							verse.getBoundingClientRect().top - column.getBoundingClientRect().top - 24
						);
					})
			)
			.toBeLessThan(2);
		await field.fill('Joh 3');
		await field.press('Enter');
		await expect(page).toHaveURL((url) => url.pathname === '/Joh3');
		await page.evaluate(() => document.fonts.load('italic 700 18px "Akribos Text"'));
		await expect(page).toHaveURL((url) => url.pathname === '/Joh3');
		await expect(field).toHaveValue('Joh 3');
	} finally {
		release();
	}
});

test('reading remains available when local fonts cannot be downloaded', async ({ page }) => {
	await page.route('**/*.woff2', (route) => route.abort());
	await page.goto('/Joh3,16');
	await expect(
		page.locator('.flow-verse').filter({ hasText: 'Denn also hat' }).first()
	).toBeVisible();
	await page
		.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ })
		.first()
		.fill('1Mo 1');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL((url) => url.pathname === '/1Mo1');
	await expect(page.locator('.flow-verse').first()).toContainText('Im Anfang');
});

test('account preview and size controls use this device even when the account has another size', async ({
	page,
	context,
	baseURL
}) => {
	await registerWithPassword(
		page,
		`typography-${crypto.randomUUID()}@example.com`,
		'typography-test-password',
		'Typography'
	);
	await page.request.post('/account?/reader', { form: { fontScale: '140' } });
	await context.addCookies([{ name: 'reader-font-scale', value: '85', url: baseURL! }]);
	await page.goto('/account?tab=appearance');
	await expect(page.getByText('85 %', { exact: true })).toBeVisible();
	const preview = page.locator('p[style*="--reader-text-size"]');
	await expect(preview).toHaveCSS('font-size', '15.3px');
	await page.getByRole('button', { name: 'Bibeltext vergrößern' }).click();
	await expect(page.getByText('90 %', { exact: true })).toBeVisible();
	await expect(preview).toHaveCSS('font-size', '16.2px');
});
