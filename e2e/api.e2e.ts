import { expect, test } from '@playwright/test';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * The public API: the domain gate and rate limiting (`hooks.server.ts` + `lib/server/api/`), and the
 * `/api/v1` endpoints themselves.
 */

/**
 * `request.get` sends none of the headers a real same-origin browser fetch would, so content
 * endpoint tests that do not care about auth pass this to satisfy the gate — it matches the `ORIGIN`
 * playwright.config.ts sets for the e2e server.
 */
const trusted = { origin: 'http://localhost:4173' };

function uniqueEmail(): string {
	return `e2e-api-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function registerAndCreateKey(
	page: import('@playwright/test').Page,
	scope: 'public' | 'personal'
): Promise<string> {
	const email = uniqueEmail();
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('E2E');
	await page.getByLabel('Passwort', { exact: true }).fill('ein-sicheres-passwort');
	await page.getByLabel('Passwort wiederholen').fill('ein-sicheres-passwort');
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/\/register\/check-email$/);

	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);

	await page.getByLabel('Name', { exact: true }).fill(`E2E ${scope}`);
	if (scope === 'personal') {
		await page.getByRole('radio', { name: /Auch persönliche Daten/ }).check();
	}
	await page.getByRole('button', { name: 'Schlüssel erstellen' }).click();

	const shown = await page.locator('code').filter({ hasText: 'sk_akribos_' }).textContent();
	return shown!.trim();
}

test('a request with no origin and no API key is refused', async ({ request }) => {
	const response = await request.get('/api/v1/ping');
	expect(response.status()).toBe(401);
	expect((await response.json()).error.code).toBe('missing_api_key');
});

test('an invalid API key is refused', async ({ request }) => {
	const response = await request.get('/api/v1/ping', {
		headers: { authorization: 'Bearer sk_akribos_does-not-exist' }
	});
	expect(response.status()).toBe(401);
	expect((await response.json()).error.code).toBe('invalid_api_key');
});

test('a same-origin browser fetch is trusted without a key', async ({ page }) => {
	await page.goto('/Joh3');
	const body = await page.evaluate(() => fetch('/api/v1/ping').then((response) => response.json()));
	expect(body).toEqual({ ok: true, auth: { kind: 'trusted' } });
});

test('a valid API key authenticates and reports its own scope', async ({ page, request }) => {
	const key = await registerAndCreateKey(page, 'personal');

	const response = await request.get('/api/v1/ping', {
		headers: { authorization: `Bearer ${key}` }
	});
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ok: true, auth: { kind: 'key', scope: 'personal' } });
});

test('exceeding the per-key rate limit returns 429 with Retry-After', async ({ page, request }) => {
	const key = await registerAndCreateKey(page, 'public');
	const headers = { authorization: `Bearer ${key}` };

	// Matches KEYED_LIMIT in src/lib/server/api/rate-limit.ts.
	const limit = 120;
	for (let i = 0; i < limit; i++) {
		const response = await request.get('/api/v1/ping', { headers });
		expect(response.status()).toBe(200);
	}

	const over = await request.get('/api/v1/ping', { headers });
	expect(over.status()).toBe(429);
	expect(over.headers()['retry-after']).toBeTruthy();
	expect((await over.json()).error.code).toBe('rate_limited');
});

test('GET /api/v1/books lists the 66-book canon', async ({ request }) => {
	const response = await request.get('/api/v1/books', { headers: trusted });
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.books).toHaveLength(66);
	expect(body.books.find((book: { id: number }) => book.id === 43)).toMatchObject({
		shortName: 'Joh'
	});
});

test('GET /api/v1/resources lists the seeded resources', async ({ request }) => {
	const response = await request.get('/api/v1/resources', { headers: trusted });
	expect(response.status()).toBe(200);
	const body = await response.json();
	const ids = body.resources.map((resource: { id: string }) => resource.id);
	expect(ids).toEqual(expect.arrayContaining(['SEEDDE', 'SEEDPLAIN', 'SEEDCOMMENTARY']));
});

test('GET /api/v1/bibles/:bible/:book/:chapter returns the chapter text', async ({ request }) => {
	const response = await request.get('/api/v1/bibles/SEEDDE/43/3', { headers: trusted });
	expect(response.status()).toBe(200);
	const body = await response.json();
	const verse16 = body.verses.find((verse: { verse: number }) => verse.verse === 16);
	expect(verse16.segments.some((segment: { strong?: string }) => segment.strong === 'G25')).toBe(
		true
	);
});

test('GET /api/v1/bibles/:bible/:book/:chapter 404s for an unknown bible', async ({ request }) => {
	const response = await request.get('/api/v1/bibles/NOPE/43/3', { headers: trusted });
	expect(response.status()).toBe(404);
	expect((await response.json()).error.code).toBe('unknown_bible');
});

test('GET /api/v1/strong/:id returns the lexicon entry', async ({ request }) => {
	const response = await request.get('/api/v1/strong/G25', { headers: trusted });
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.found).toBe(true);
	expect(body.entry.lemma).toBe('ἀγαπάω');
});

test('GET /api/v1/strong/:id combines book and translation-rendering filters', async ({
	request
}) => {
	const response = await request.get('/api/v1/strong/G25?resources=SEEDDE&book=43&gloss=geliebt', {
		headers: trusted
	});
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.filters).toEqual({ book: 43, gloss: 'geliebt' });
	expect(body.occurrences.total).toBeGreaterThan(0);
	expect(body.occurrences.occurrences).toEqual(
		expect.arrayContaining([expect.objectContaining({ book: 43, chapter: 3, verse: 16 })])
	);
});

test('GET /api/v1/search finds a word', async ({ request }) => {
	const response = await request.get('/api/v1/search?q=geliebt', { headers: trusted });
	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.hits.length).toBeGreaterThan(0);
});

test('GET /api/v1/lists and /api/v1/notes need a session or a personal-scope key', async ({
	request
}) => {
	const lists = await request.get('/api/v1/lists', { headers: trusted });
	expect(lists.status()).toBe(403);
	expect((await lists.json()).error.code).toBe('personal_scope_required');

	const notes = await request.get('/api/v1/notes', { headers: trusted });
	expect(notes.status()).toBe(403);
});

test('/api/docs renders the interactive API reference from the OpenAPI document', async ({
	page
}) => {
	const spec = await page.request.get('/openapi.json');
	expect(spec.status()).toBe(200);
	expect((await spec.json()).info.title).toBe('Akribos API');

	await page.goto('/api/docs');
	await expect(page).toHaveTitle('Akribos - Die Bibel präzise studieren');
	await expect(page.getByText('Akribos API').first()).toBeVisible();
	await expect(page.getByText('/api/v1/books').first()).toBeVisible();
});

test('a signed-in session reads its own lists and notes through the API', async ({ page }) => {
	const email = uniqueEmail();
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('E2E');
	await page.getByLabel('Passwort', { exact: true }).fill('ein-sicheres-passwort');
	await page.getByLabel('Passwort wiederholen').fill('ein-sicheres-passwort');
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/\/register\/check-email$/);

	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);

	// A real in-page fetch, not the request fixture: only a browser attaches the session cookie and
	// the same-origin signal this endpoint's "trusted" path checks for.
	const lists = await page.evaluate(() =>
		fetch('/api/v1/lists').then((response) => response.json())
	);
	expect(lists).toEqual({ lists: [] });

	const notes = await page.evaluate(() =>
		fetch('/api/v1/notes').then((response) => response.json())
	);
	expect(notes).toEqual({ notes: [] });
});
