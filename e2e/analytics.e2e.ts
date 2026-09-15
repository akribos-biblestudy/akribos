import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawn, execFile as execFileCallback, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';

const execFile = promisify(execFileCallback);

test('Umami settings, consent, private URL filtering and revocation work together', async ({
	browser
}) => {
	test.setTimeout(90_000);
	// Enabling analytics is a global setting. Give this test its own database and production server
	// so its consent banner cannot affect the ordinary reader scenarios running in parallel.
	const database = new URL(
		process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
	);
	const databaseName = `akribos_analytics_${randomUUID().replaceAll('-', '')}`;
	const maintenance = new URL(database);
	maintenance.pathname = '/postgres';
	database.pathname = `/${databaseName}`;
	const adminDb = postgres(maintenance.toString(), { max: 1, onnotice: () => {} });
	const origin = 'http://localhost:4181';
	const env = {
		...process.env,
		DATABASE_URL: database.toString(),
		ORIGIN: origin,
		PORT: '4181',
		HOST: '127.0.0.1',
		SESSION_SECRET: 'analytics-test-secret-0123456789abcdef',
		NODE_ENV: 'production',
		LOG_LEVEL: 'error'
	};
	let server: ChildProcess | undefined;
	let created = false;
	const adminContext = await browser.newContext({ baseURL: origin });
	const guestContext = await browser.newContext({ baseURL: origin });
	const admin = await adminContext.newPage();
	const guest = await guestContext.newPage();
	const calls: { url: string; body: string | null; referrer?: string }[] = [];
	try {
		await adminDb.unsafe(`create database "${databaseName}"`);
		created = true;
		await execFile(process.execPath, ['scripts/migrate.ts'], { env });
		await execFile(process.execPath, ['scripts/seed.ts'], { env });
		server = spawn(process.execPath, ['build/index.js'], { env, stdio: 'ignore' });
		await expect
			.poll(
				async () => {
					try {
						return (await fetch(`${origin}/healthz`)).status;
					} catch {
						return 0;
					}
				},
				{ timeout: 15_000 }
			)
			.toBe(200);
		await guestContext.addCookies([{ name: 'tour-guest-done', value: '1', url: origin }]);
		await guest.goto('/datenschutz');
		await expect(
			guest.getByText('Die freiwillige Umami-Nutzungsanalyse ist derzeit deaktiviert.', {
				exact: false
			})
		).toBeVisible();
		await admin.goto('/login');
		await admin.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await admin.getByLabel('Passwort').fill('seed-admin-password');
		await admin.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(admin).toHaveURL(/\/account$/);
		await admin.goto('/admin/analytics');
		await admin.getByLabel('Umami aktivieren').check();
		await Promise.all([
			admin.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					new URL(response.url()).pathname === '/admin/analytics'
			),
			admin.getByRole('button', { name: 'Analyse-Einstellungen speichern' }).click()
		]);
		await expect(admin.getByRole('alert')).toContainText('erforderlich');
		await admin.getByLabel('Skript-Adresse (HTTPS)').fill('https://stats.example.test/script.js');
		await admin.getByLabel('Website-ID').fill('a0520ae9-6fc7-4bde-9273-066bfba7eddf');
		await admin.getByLabel('Betreiber der Umami-Instanz').fill('Testbetreiber');
		await admin
			.getByLabel('Datenschutzhinweise des Betreibers (HTTPS)')
			.fill('https://stats.example.test/privacy');
		await admin
			.getByLabel('Verarbeitung und Speicherfristen beim Betreiber')
			.fill('Testinstanz in Deutschland. Analysedaten werden nach 30 Tagen gelöscht.');
		await Promise.all([
			admin.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					new URL(response.url()).pathname === '/admin/analytics'
			),
			admin.getByRole('button', { name: 'Analyse-Einstellungen speichern' }).click()
		]);
		await expect(
			admin.getByRole('status').filter({ hasText: 'Analyse-Einstellungen gespeichert.' })
		).toBeVisible();
		await admin.reload();
		await expect(admin.getByLabel('Umami aktivieren')).toBeChecked();

		// Analytics must preserve the Origin header of native forms, including without JavaScript.
		// A document-wide no-referrer policy turns it into "null" and SvelteKit rejects the login.
		for (const javaScriptEnabled of [true, false]) {
			const loginContext = await browser.newContext({ baseURL: origin, javaScriptEnabled });
			try {
				const loginPage = await loginContext.newPage();
				await loginPage.goto('/login');
				await loginPage.getByLabel('E-Mail-Adresse').fill('admin@example.com');
				await loginPage.getByLabel('Passwort').fill('seed-admin-password');
				const [response] = await Promise.all([
					loginPage.waitForResponse(
						(response) =>
							response.request().method() === 'POST' &&
							new URL(response.url()).pathname === '/login'
					),
					loginPage.getByRole('button', { name: 'Anmelden', exact: true }).click()
				]);
				expect(response.status()).toBe(303);
				expect(await response.request().headerValue('origin')).toBe(origin);
				await expect(loginPage).toHaveURL(/\/account$/);
			} finally {
				await loginContext.close();
			}
		}
		for (const untrustedOrigin of ['null', 'https://untrusted.example.test']) {
			const response = await guestContext.request.post('/login?/login', {
				headers: { origin: untrustedOrigin },
				form: { email: '', password: '' }
			});
			expect(response.status()).toBe(403);
		}

		await guestContext.route('https://stats.example.test/**', async (route) => {
			const request = route.request();
			if (request.method() === 'OPTIONS') {
				await route.fulfill({
					status: 204,
					headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
				});
				return;
			}
			calls.push({
				url: request.url(),
				body: request.postData(),
				referrer: request.headers().referer
			});
			if (request.url().endsWith('/script.js')) {
				await route.fulfill({
					contentType: 'application/javascript',
					body: `const script = document.currentScript;
if (script.dataset.autoTrack !== 'false' || script.referrerPolicy !== 'no-referrer') throw new Error('unsafe tracker configuration');
window.umami = { track(payload) {
  const safe = window[script.dataset.beforeSend]('event', payload);
  return safe ? fetch('https://stats.example.test/api/send', { method: 'POST', body: JSON.stringify(safe) }) : undefined;
} };`
				});
			} else
				await route.fulfill({
					contentType: 'application/json',
					body: '{}',
					headers: { 'access-control-allow-origin': '*' }
				});
		});
		await guest.reload();
		await expect(
			guest.getByRole('complementary', { name: 'Freiwillige Nutzungsanalyse' })
		).toBeVisible();
		expect(calls).toHaveLength(0);
		await guest.getByRole('button', { name: 'Analyse ablehnen' }).click();
		await guest.goto('/Joh3,16?privateQuery=do-not-send');
		await expect(guest.getByRole('button', { name: 'Analyse erlauben' })).toHaveCount(0);
		expect(calls).toHaveLength(0);
		await guest.goto('/datenschutz');
		await guest.getByRole('button', { name: 'Analyse erlauben' }).click();
		await expect.poll(() => calls.filter((call) => call.body).length).toBe(1);
		await guest.goto('/Joh3,16?privateQuery=do-not-send#private-fragment');
		await expect.poll(() => calls.filter((call) => call.body).length).toBe(2);
		const payloads = calls.filter((call) => call.body).map((call) => JSON.parse(call.body!));
		expect(payloads.map((payload) => payload.url)).toEqual(['/datenschutz', '/reader']);
		for (const payload of payloads)
			expect(Object.keys(payload).sort()).toEqual(['title', 'url', 'website']);
		expect(calls.every((call) => !call.referrer)).toBe(true);
		expect(JSON.stringify(calls)).not.toContain('do-not-send');
		await guest.evaluate(() => {
			const link = document.createElement('a');
			link.href = '/login?redirectTo=/notes/private-document-id';
			link.textContent = 'Konto im Test öffnen';
			document.body.append(link);
		});
		await guest.getByRole('link', { name: 'Konto im Test öffnen' }).click();
		await expect(guest.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
		expect(calls.filter((call) => call.body)).toHaveLength(2);
		await guest.goto('/datenschutz');
		await expect.poll(() => calls.filter((call) => call.body).length).toBe(3);
		await guest.getByRole('button', { name: 'Einwilligung widerrufen' }).click();
		await guest.goto('/Joh3,16');
		expect(calls.filter((call) => call.body)).toHaveLength(3);

		// A changed recipient invalidates a prior decision; a disabled integration never loads.
		await guest.goto('/datenschutz');
		await guest.getByRole('button', { name: 'Analyse erlauben' }).click();
		await expect.poll(() => calls.filter((call) => call.body).length).toBe(4);
		const dntContext = await browser.newContext({ baseURL: origin });
		try {
			await dntContext.addCookies(await guestContext.cookies());
			await dntContext.addInitScript(() =>
				Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' })
			);
			let dntRequests = 0;
			await dntContext.route('https://stats.example.test/**', (route) => {
				dntRequests += 1;
				return route.abort();
			});
			const dntPage = await dntContext.newPage();
			await dntPage.goto('/datenschutz');
			await expect(
				dntPage.getByText('Dein Browser widerspricht der Analyse. Umami wird nicht geladen.')
			).toBeVisible();
			expect(dntRequests).toBe(0);
		} finally {
			await dntContext.close();
		}
		await admin.getByLabel('Betreiber der Umami-Instanz').fill('Neuer Testbetreiber');
		await Promise.all([
			admin.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					new URL(response.url()).pathname === '/admin/analytics'
			),
			admin.getByRole('button', { name: 'Analyse-Einstellungen speichern' }).click()
		]);
		await expect(
			admin.getByRole('status').filter({ hasText: 'Analyse-Einstellungen gespeichert.' })
		).toBeVisible();
		await guest.goto('/Joh3,16');
		await expect(guest.getByRole('button', { name: 'Analyse erlauben' })).toBeVisible();
		expect(calls.filter((call) => call.body)).toHaveLength(4);
		await admin.getByLabel('Umami aktivieren').uncheck();
		await Promise.all([
			admin.waitForResponse(
				(response) =>
					response.request().method() === 'POST' &&
					new URL(response.url()).pathname === '/admin/analytics'
			),
			admin.getByRole('button', { name: 'Analyse-Einstellungen speichern' }).click()
		]);
		await expect(
			admin.getByRole('status').filter({ hasText: 'Analyse-Einstellungen gespeichert.' })
		).toBeVisible();
		await guest.goto('/datenschutz');
		await expect(
			guest.getByText('Die freiwillige Umami-Nutzungsanalyse ist derzeit deaktiviert.', {
				exact: false
			})
		).toBeVisible();
		expect(calls.filter((call) => call.body)).toHaveLength(4);
	} finally {
		await adminContext.close();
		await guestContext.close();
		if (server && server.exitCode === null) {
			server.kill('SIGTERM');
			await Promise.race([
				new Promise<void>((resolve) => server!.once('exit', () => resolve())),
				new Promise<void>((resolve) => setTimeout(resolve, 3000))
			]);
			if (server.exitCode === null) server.kill('SIGKILL');
		}
		if (created) await adminDb.unsafe(`drop database "${databaseName}" with (force)`);
		await adminDb.end();
	}
});
