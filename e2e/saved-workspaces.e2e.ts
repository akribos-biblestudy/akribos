import { expect, test, type Page } from '@playwright/test';
import { createDb } from '../src/lib/server/db/client.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

async function loginReader(page: Page) {
	const email = `saved-workspace-${crypto.randomUUID()}@example.com`;
	const password = 'ein-sicheres-passwort';
	// Each scenario gets an isolated account without consuming the shared IP's registration quota.
	// Registration and verification themselves are covered by the account suite.
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	try {
		await db.insert(users).values({
			email,
			passwordHash: await hashPassword(password),
			displayName: 'Arbeitsbereich Reader',
			emailVerifiedAt: new Date(),
			tourCompletedAt: new Date()
		});
	} finally {
		await client.end();
	}
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
}

async function openMenu(page: Page) {
	await page.getByRole('button', { name: 'Arbeitsbereiche', exact: true }).click();
	return page.getByRole('menu', { name: 'Arbeitsbereiche', exact: true });
}

async function saveWorkspace(page: Page, name: string) {
	const menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Aktuellen Arbeitsbereich speichern …' }).click();
	const dialog = page.getByRole('dialog', { name: 'Arbeitsbereich speichern', exact: true });
	await dialog.getByLabel('Name', { exact: true }).fill(name);
	await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(dialog).not.toBeVisible();
}

async function manageWorkspace(page: Page, name: string) {
	const menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: `Arbeitsbereich „${name}“ bearbeiten` }).click();
	return page.getByRole('dialog', { name: 'Arbeitsbereich bearbeiten' });
}

const state =
	'layout=grid-4&tab=1.1:SEEDDE:A:Joh3,16&tab=1.2:SEEDPLAIN:A:Joh3,16&tab=2.1:STRONGS_GREEK:A:Joh3,16&tab=3.1:SEEDDE:B:Joh1,1&active=1.1&active=2.1&active=3.1&focus=1&lookup=2.1:G25&source=2.1:SEEDDE&sourceRef=2.1:Joh3,16&word=2.1:geliebt&search=3.1:Wort';

test('saves, opens from another page, renames, explicitly replaces and deletes a named workspace', async ({
	page
}) => {
	await loginReader(page);
	await page.goto(`/Joh3,16?${state}`);
	await expect(page.locator('.reader-tile')).toHaveCount(4);
	await expect(page.locator('.reader-tile').nth(2).getByRole('searchbox')).toHaveValue('Wort');
	const splitter = page.getByRole('separator', { name: 'Spaltenbreite anpassen' });
	await splitter.focus();
	await splitter.press('ArrowRight');
	const savedWidth = await splitter.getAttribute('aria-valuenow');
	await saveWorkspace(page, 'Johannes-Studium');
	const response = await page.request.get('/api/reader/workspaces');
	expect(response.headers()['cache-control']).toBe('private, no-store');
	const { workspaces } = await response.json();
	expect(workspaces).toHaveLength(1);
	expect(Object.keys(workspaces[0]).sort()).toEqual(['id', 'name', 'revision']);

	await page.goto('/Joh1?layout=single&tab=1.1:SEEDPLAIN:A:Joh1&active=1.1&focus=1');
	await page.goto('/notes');
	let menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Johannes-Studium', exact: true }).click();
	await expect(page).toHaveURL(
		(url) => url.pathname === '/Joh3,16' && url.searchParams.get('layout') === 'grid-4'
	);
	await expect(page.locator('.reader-tile')).toHaveCount(4);
	await expect(page.locator('.reader-tile').first().locator('.resource-tab')).toHaveCount(2);
	await expect(page.locator('.reader-tile').nth(2).getByRole('searchbox')).toHaveValue('Wort');
	await expect(page.locator('.reader-tile').nth(1).getByRole('searchbox')).toHaveValue('G25');
	await expect(splitter).toHaveAttribute('aria-valuenow', savedWidth!);
	await page.reload();
	await expect(page).toHaveURL(
		(url) =>
			url.searchParams.get('focus') === '1' && url.searchParams.get('source') === '2.1:SEEDDE'
	);

	expect(new URL(page.url()).searchParams.getAll('tab')).toContain('3.1:SEEDDE:B:Joh1,1');
	let dialog = await manageWorkspace(page, 'Johannes-Studium');
	await dialog.getByLabel('Name', { exact: true }).fill('Meine Wortstudie');
	await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await page.goto('/Joh1?layout=single&tab=1.1:SEEDPLAIN:A:Joh1&active=1.1&focus=1');
	dialog = await manageWorkspace(page, 'Meine Wortstudie');
	await dialog.getByRole('checkbox').check();
	await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await page.goto('/notes');
	menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Meine Wortstudie', exact: true }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await expect(page.locator('.flow-column')).toHaveAttribute('data-resource-id', 'SEEDPLAIN');
	// Opening makes it the account default as well, while the named snapshot remains unchanged.
	await page.goto('/notes');
	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	dialog = await manageWorkspace(page, 'Meine Wortstudie');
	await dialog.getByRole('button', { name: 'Löschen …' }).click();
	await page
		.getByRole('dialog', { name: 'Arbeitsbereich löschen' })
		.getByRole('button', { name: 'Löschen', exact: true })
		.click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await page.reload();
	menu = await openMenu(page);
	await expect(menu.getByText('Noch keine Arbeitsbereiche gespeichert.')).toBeVisible();
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(menu).toBeInViewport();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('prefetch is read-only and foreign accounts cannot open or modify saved workspaces', async ({
	page,
	browser
}) => {
	await loginReader(page);
	await page.goto('/Joh1');
	const snapshot = { readerState: state, layoutSizes: {} };
	const created = await page.request.post('/api/reader/workspaces', {
		data: { name: 'Privat', snapshot }
	});
	expect(created.status()).toBe(201);
	const { workspace } = await created.json();
	const { id } = workspace;
	// Requesting the opening page without running its form must not change the current preference.
	expect((await page.request.get(`/workspaces/${id}`)).status()).toBe(200);
	await page.goto('/Joh1');
	await expect(page).toHaveURL((url) => url.searchParams.get('layout') !== 'grid-4');
	const duplicate = await page.request.post('/api/reader/workspaces', {
		data: { name: 'privat', snapshot }
	});
	expect(duplicate.status()).toBe(400);
	expect(
		(
			await page.request.patch(`/api/reader/workspaces/${id}`, {
				data: { name: 'Neu', revision: 2 }
			})
		).status()
	).toBe(409);
	expect(
		(
			await page.request.post('/api/reader/workspaces', {
				data: { name: 'Ungültig', snapshot: { readerState: 'layout=bad' } }
			})
		).status()
	).toBe(400);
	expect(
		(
			await page.request.post('/api/reader/workspaces', {
				headers: { origin: 'https://example.invalid' },
				data: { name: 'Cross-Origin', snapshot }
			})
		).status()
	).toBe(403);

	const context = await browser.newContext();
	try {
		const stranger = await context.newPage();
		await stranger.goto('/Joh1');
		await expect(
			stranger.getByRole('button', { name: 'Arbeitsbereiche', exact: true })
		).toHaveCount(0);
		expect((await context.request.get('/api/reader/workspaces')).status()).toBe(401);
		await loginReader(stranger);
		expect((await context.request.get('/api/reader/workspaces')).headers()['cache-control']).toBe(
			'private, no-store'
		);
		expect(await (await context.request.get('/api/reader/workspaces')).json()).toEqual({
			workspaces: []
		});
		expect((await context.request.get(`/workspaces/${id}`)).status()).toBe(404);
		expect(
			(
				await context.request.post(`/workspaces/${id}`, {
					form: {},
					headers: { origin: new URL(stranger.url()).origin }
				})
			).status()
		).toBe(404);
		expect(
			(
				await context.request.patch(`/api/reader/workspaces/${id}`, {
					data: { name: 'Fremd', revision: 1, snapshot }
				})
			).status()
		).toBe(404);
		expect(
			(
				await context.request.delete(`/api/reader/workspaces/${id}`, { data: { revision: 1 } })
			).status()
		).toBe(404);
	} finally {
		await context.close();
	}
});

test('opening a workspace waits for pending note changes before switching the account view', async ({
	page
}) => {
	await loginReader(page);
	const created = await page.request.post('/api/reader/workspaces', {
		data: { name: 'Zurück zum Studium', snapshot: { readerState: state, layoutSizes: {} } }
	});
	const { workspace } = await created.json();
	await page.goto('/notes');
	await page.getByRole('button', { name: 'Neue Notiz', exact: true }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+(?:\?|$)/);
	const documentId = new URL(page.url()).pathname.split('/').at(-1)!;
	let releaseSave!: () => void;
	const saving = new Promise<void>((resolve) => {
		releaseSave = resolve;
	});
	let saveRequested = false;
	let opened = false;
	await page.route(`**/api/documents/${documentId}`, async (route) => {
		if (route.request().method() === 'PATCH') {
			saveRequested = true;
			await saving;
		}
		await route.continue();
	});
	page.on('request', (request) => {
		if (
			request.method() === 'POST' &&
			new URL(request.url()).pathname === `/workspaces/${workspace.id}`
		)
			opened = true;
	});
	try {
		await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
		await page
			.getByRole('textbox', { name: 'Markdown', exact: true })
			.fill('Dieser Gedanke muss beim Arbeitsbereichswechsel erhalten bleiben.');
		const menu = await openMenu(page);
		await menu.getByRole('menuitem', { name: 'Zurück zum Studium', exact: true }).click();
		await expect.poll(() => saveRequested).toBe(true);
		expect(opened).toBe(false);
		await expect(page).toHaveURL(new RegExp(`/notes/${documentId}`));
		releaseSave();
		await expect(page).toHaveURL(
			(url) => url.pathname === '/Joh3,16' && url.searchParams.get('layout') === 'grid-4'
		);
		expect(opened).toBe(true);
		const { document } = await (await page.request.get(`/api/documents/${documentId}`)).json();
		expect(document.bodyMarkdown).toContain(
			'Dieser Gedanke muss beim Arbeitsbereichswechsel erhalten bleiben.'
		);
	} finally {
		releaseSave();
	}
});

test('saving captures the visible passage while its account persistence is still pending', async ({
	page
}) => {
	await loginReader(page);
	await page.setViewportSize({ width: 900, height: 400 });
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDPLAIN:B:Joh3,16&active=1.1&active=2.1&focus=1'
	);
	let releaseReference!: () => void;
	const persisting = new Promise<void>((resolve) => {
		releaseReference = resolve;
	});
	await page.route(
		(url) => url.searchParams.has('/setTabReference'),
		async (route) => {
			await persisting;
			await route.continue();
		}
	);
	try {
		const column = page.locator('.flow-column').first();
		const nextChapter = column.locator('[data-chapter-key="1:2"]');
		await expect(nextChapter).toBeAttached();
		await column.dispatchEvent('pointerdown');
		await column.evaluate(
			(element, top) => {
				element.scrollTop = top;
			},
			await nextChapter.evaluate((element) => (element as HTMLElement).offsetTop)
		);
		const field = page.locator('.reader-tile').first().getByRole('searchbox');
		await expect(field).toHaveValue('1Mo 2,1');
		await saveWorkspace(page, 'Aktuelle Lesestelle');
		releaseReference();
		const menu = await openMenu(page);
		await menu.getByRole('menuitem', { name: 'Aktuelle Lesestelle', exact: true }).click();
		await expect(page).toHaveURL(
			(url) => url.pathname === '/1Mo2,1' && url.searchParams.get('focus') === '1'
		);
		await expect(field).toHaveValue('1Mo 2,1');
		await expect(page.locator('.reader-tile').nth(1).getByRole('searchbox')).toHaveValue(
			'Joh 3,16'
		);
	} finally {
		releaseReference();
	}
});
