import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { registerWithPassword } from './lib/auth.ts';

test('the guest reader loads a small logo and defers chart assets until a word study opens', async ({
	page
}) => {
	const requested: string[] = [];
	page.on('request', (request) => requested.push(request.url()));
	await page.goto('/Joh3,16');
	const logo = page.getByRole('img', { name: 'Akribos', exact: true });
	await expect(logo).toHaveAttribute('width', '140');
	await expect(logo).toHaveAttribute('height', '40');
	await expect
		.poll(() => logo.evaluate((image) => (image as HTMLImageElement).complete))
		.toBe(true);
	const source = await logo.evaluate((image) => (image as HTMLImageElement).currentSrc);
	expect(source).toMatch(/\/logo-140\.png$/);
	expect((await (await page.request.get(source)).body()).byteLength).toBeLessThan(7000);
	expect(requested.some((url) => /\/(?:DocumentEditor|GlossChart)\.[^/]+\.css/.test(url))).toBe(
		false
	);
	await page.locator('#Joh3_16 button.strong[data-strong="G2316"]').first().click();
	await expect(page.locator('.donut-chart canvas')).toBeVisible();
	expect(requested.some((url) => /\/GlossChart\.[^/]+\.css/.test(url))).toBe(true);
	expect(requested.some((url) => /\/DocumentEditor\.[^/]+\.css/.test(url))).toBe(false);
});

test('opening the note library keeps the editor deferred until a note is created', async ({
	page
}) => {
	await registerWithPassword(
		page,
		`startup-${randomUUID()}@example.com`,
		'a-secure-test-password',
		'Startup reader'
	);
	const requested: string[] = [];
	page.on('request', (request) => requested.push(request.url()));
	await page.goto('/Joh3,16');
	await page.getByTestId('layout-picker').click();
	await page.getByTestId('reader-notes-sidecar-toggle').click();
	const sidecar = page.getByTestId('reader-notes-sidecar');
	await expect(sidecar.getByTestId('reader-notes-sidecar-create')).toBeVisible();
	expect(requested.some((url) => /\/DocumentEditor\.[^/]+\.css/.test(url))).toBe(false);
	await sidecar.getByTestId('reader-notes-sidecar-create').click();
	await expect(sidecar.getByTestId('reader-notes-sidecar-title')).toBeVisible();
	await expect(sidecar.locator('.document-prose')).toBeVisible();
	expect(requested.some((url) => /\/DocumentEditor\.[^/]+\.css/.test(url))).toBe(true);
});

test('high density screens select logo variants without enlarging their displayed dimensions', async ({
	browser
}) => {
	for (const density of [2, 3]) {
		const context = await browser.newContext({
			deviceScaleFactor: density,
			viewport: { width: 1440, height: 900 }
		});
		const page = await context.newPage();
		await page.goto('/Joh3,16');
		const logo = page.getByRole('img', { name: 'Akribos', exact: true });
		await expect
			.poll(() => logo.evaluate((image) => (image as HTMLImageElement).complete))
			.toBe(true);
		expect(await logo.evaluate((image) => (image as HTMLImageElement).currentSrc)).toContain(
			`/logo-${density * 140}.png`
		);
		expect(await logo.boundingBox()).toMatchObject({ width: 140, height: 40 });
		await context.close();
	}
});
