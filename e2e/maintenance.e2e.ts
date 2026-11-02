import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const maintenance = readFileSync('static/maintenance.html', 'utf8');

test('wartet auf gültige Bereitschaft und behält die ursprüngliche Adresse', async ({ page }) => {
	let navigationCount = 0;
	let probeCount = 0;
	await page.route('https://maintenance-test.invalid/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/healthz') {
			probeCount++;
			const responses = [
				{ status: 503, body: '{"status":"error"}' },
				{ status: 200, body: '{"status":"ok","restore":"running"}' },
				{ status: 200, body: 'kein JSON' },
				{ status: 200, body: '{"status":"ok"}' }
			];
			const response = responses[Math.min(probeCount - 1, responses.length - 1)];
			await route.fulfill({ ...response, contentType: 'application/json' });
			return;
		}
		navigationCount++;
		await route.fulfill({
			status: navigationCount === 1 ? 503 : 200,
			contentType: 'text/html; charset=utf-8',
			body: navigationCount === 1 ? maintenance : '<h1>Akribos wieder verfügbar</h1>'
		});
	});
	await page.clock.install();
	await page.goto('https://maintenance-test.invalid/reader?book=gen#verse');
	await expect(page.getByRole('heading', { name: 'Wir sind gleich wieder da.' })).toBeVisible();
	for (let count = 1; count <= 3; count++) {
		await page.clock.runFor(5100);
		await expect.poll(() => probeCount).toBe(count);
		await expect(page.getByRole('heading', { name: 'Wir sind gleich wieder da.' })).toBeVisible();
		expect(navigationCount).toBe(1);
	}
	await page.clock.runFor(5100);
	await expect(page.getByRole('heading', { name: 'Akribos wieder verfügbar' })).toBeVisible();
	expect(page.url()).toBe('https://maintenance-test.invalid/reader?book=gen#verse');
});

test('bleibt ohne JavaScript und bei reduzierter Bewegung bedienbar', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
	const page = await context.newPage();
	await page.route('https://maintenance-test.invalid/**', (route) =>
		route.fulfill({ status: 503, contentType: 'text/html', body: maintenance })
	);
	await page.goto('https://maintenance-test.invalid/');
	await expect(page.getByRole('link', { name: 'Jetzt erneut versuchen' })).toBeVisible();
	await expect(page.locator('.status')).toBeHidden();
	await expect(page.locator('.orbit')).toHaveCSS('animation-name', 'none');
	await context.close();
});

test('kennzeichnet die direkte Asset-Vorschau und startet keine Prüfung', async ({ page }) => {
	let probes = 0;
	await page.route('https://maintenance-test.invalid/**', (route) => {
		if (new URL(route.request().url()).pathname === '/healthz') probes++;
		return route.fulfill({ status: 200, contentType: 'text/html', body: maintenance });
	});
	await page.clock.install();
	await page.goto('https://maintenance-test.invalid/maintenance.html');
	await expect(page.getByText('Vorschau der Wartungsseite')).toBeVisible();
	await expect(page.locator('.status')).toBeHidden();
	await page.clock.runFor(12000);
	expect(probes).toBe(0);
});
