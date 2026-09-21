import { expect, test, type Page } from '@playwright/test';
import { createDb } from '../src/lib/server/db/client.ts';
import { users, passwordResets } from '../src/lib/server/db/schema.ts';
import { createHash } from 'node:crypto';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

async function loginExistingReader(page: Page, email: string, password: string) {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
}

async function createReaderAccount(withPasswordReset = false) {
	const email = `saved-workspace-${crypto.randomUUID()}@example.com`;
	const password = 'ein-sicheres-passwort';
	const userId = crypto.randomUUID();
	const resetToken = withPasswordReset ? crypto.randomUUID() : null;
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
			id: userId,
			email,
			passwordHash: await hashPassword(password),
			displayName: 'Arbeitsbereich Reader',
			emailVerifiedAt: new Date(),
			tourCompletedAt: new Date()
		});
		if (resetToken)
			await db.insert(passwordResets).values({
				id: createHash('sha256').update(resetToken).digest('hex'),
				userId,
				expiresAt: new Date(Date.now() + 15 * 60_000)
			});
	} finally {
		await client.end();
	}
	return { email, password, resetToken };
}

async function loginReader(page: Page) {
	const account = await createReaderAccount();
	await loginExistingReader(page, account.email, account.password);
	return account;
}

async function openMenu(page: Page) {
	await page.getByRole('button', { name: 'Arbeitsbereiche', exact: true }).click();
	return page.getByRole('menu', { name: 'Arbeitsbereiche', exact: true });
}

async function saveWorkspace(page: Page, name: string) {
	const menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Neuer Arbeitsbereich …' }).click();
	const dialog = page.getByRole('dialog', { name: 'Neuer Arbeitsbereich', exact: true });
	await dialog.getByLabel('Name', { exact: true }).fill(name);
	await dialog.getByRole('button', { name: 'Anlegen', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect
		.poll(
			async () =>
				(await (await page.request.get('/api/reader/workspaces')).json()).workspaces.find(
					(entry: { name: string }) => entry.name === name
				)?.isActive
		)
		.toBe(true);
	await expect(page.locator('.reader-tile').first()).toBeVisible();
}

async function manageWorkspace(page: Page, name: string) {
	const menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: `Arbeitsbereich „${name}“ bearbeiten` }).click();
	return page.getByRole('dialog', { name: 'Arbeitsbereich bearbeiten' });
}

const state =
	'layout=grid-4&tab=1.1:SEEDDE:A:Joh3,16&tab=1.2:SEEDPLAIN:A:Joh3,16&tab=2.1:STRONGS_GREEK:A:Joh3,16&tab=3.1:SEEDDE:B:Joh1,1&active=1.1&active=2.1&active=3.1&focus=1&lookup=2.1:G25&source=2.1:SEEDDE&sourceRef=2.1:Joh3,16&word=2.1:geliebt&search=3.1:Wort';

for (const entry of ['login', 'password reset'] as const) {
	test(`a new account without JavaScript can initialize and update its workspace after ${entry}`, async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({
			baseURL,
			javaScriptEnabled: false,
			storageState: { cookies: [], origins: [] }
		});
		try {
			const page = await context.newPage();
			const account = await createReaderAccount(entry === 'password reset');
			if (account.resetToken) {
				await page.goto(`/password-reset/${account.resetToken}`);
				await page.getByLabel('Passwort', { exact: true }).fill(account.password);
				await page.getByLabel('Passwort wiederholen', { exact: true }).fill(account.password);
				await page.getByRole('button', { name: 'Speichern', exact: true }).click();
				await expect(page).toHaveURL(/\/account$/);
			} else await loginExistingReader(page, account.email, account.password);
			await page.goto('/Joh3,16');
			// Login adopts default columns; password reset preserves the untouched provisional view.
			await expect(page.locator('.reader-tile')).toHaveCount(entry === 'login' ? 2 : 1);
			const field = page.getByRole('searchbox').first();
			await field.fill('1Mo1,3');
			await field.press('Enter');
			await expect(page).toHaveURL((url) => url.pathname === '/1Mo1,3');
			await expect(field).toHaveValue('1Mo 1,3');
			const first = await workspaceSelection(page);
			expect(first.activeSavedWorkspaceId).toBeTruthy();
			expect(first.activeSavedWorkspaceVersion).toBe(1);
			await field.fill('Joh3,16');
			await field.press('Enter');
			await expect(page).toHaveURL((url) => url.pathname === '/Joh3,16');
			const second = await workspaceSelection(page);
			expect(second.activeSavedWorkspaceId).toBe(first.activeSavedWorkspaceId);
			expect(second.activeSavedWorkspaceContentVersion).toBeGreaterThan(
				first.activeSavedWorkspaceContentVersion!
			);
		} finally {
			await context.close();
		}
	});
}

test('starts with an active default, copies the current view and autosaves changes independently', async ({
	page
}) => {
	await loginReader(page);
	let menu = await openMenu(page);
	await expect(menu.getByRole('menuitem', { name: 'Standard', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await page.keyboard.press('Escape');
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
	expect(workspaces).toHaveLength(2);
	expect(Object.keys(workspaces[0]).sort()).toEqual(['id', 'isActive', 'name', 'revision']);
	menu = await openMenu(page);
	await expect(
		menu.getByRole('menuitem', { name: 'Johannes-Studium', exact: true })
	).toHaveAttribute('aria-current', 'true');
	await page.keyboard.press('Escape');
	await expect(page.locator('.reader-tile')).toHaveCount(4);
	await expect(splitter).toHaveAttribute('aria-valuenow', savedWidth!);
	await expect(page.locator('.reader-tile').nth(1).getByRole('searchbox')).toHaveValue('G25');
	await page.reload();
	await expect(page).toHaveURL(
		(url) =>
			url.searchParams.get('focus') === '1' && url.searchParams.get('source') === '2.1:SEEDDE'
	);
	expect(new URL(page.url()).searchParams.getAll('tab')).toContain('3.1:SEEDDE:B:Joh1,1');
	let dialog = await manageWorkspace(page, 'Johannes-Studium');
	await expect(dialog.getByRole('checkbox')).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: 'Löschen …' })).toBeDisabled();
	await dialog.getByLabel('Name', { exact: true }).fill('Meine Wortstudie');
	await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	const search = page.locator('.reader-tile').first().getByRole('searchbox');
	await search.fill('Liebe');
	await search.press('Enter');
	await expect(page).toHaveURL((url) => url.searchParams.getAll('search').includes('1.1:Liebe'));
	// Switching immediately flushes client-only searches before opening the other workspace.
	menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Standard', exact: true }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(2);
	await expect(page.locator('.reader-tile').first().getByRole('searchbox')).not.toHaveValue(
		'Liebe'
	);
	await page.goto('/notes');
	menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Meine Wortstudie', exact: true }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(4);
	await expect(search).toHaveValue('Liebe');
	await expect(page.locator('.reader-tile').nth(2).getByRole('searchbox')).toHaveValue('Wort');
	// Layout mutations also write the active named workspace, without any explicit save control.
	await page.getByRole('button', { name: 'Kachelanordnung wählen' }).click();
	await page.getByRole('menuitemradio', { name: /Eine Kachel/ }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await saveWorkspace(page, 'Zweite Studie');
	await expect(search).toHaveValue('Liebe');
	await page.getByRole('button', { name: 'Kachelanordnung wählen' }).click();
	await page.getByRole('menuitemradio', { name: /Zwei Spalten/ }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(2);
	menu = await openMenu(page);
	await menu.getByRole('menuitem', { name: 'Meine Wortstudie', exact: true }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await expect(search).toHaveValue('Liebe');
	await page.goto('/notes');
	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await expect(search).toHaveValue('Liebe');
	dialog = await manageWorkspace(page, 'Zweite Studie');
	await dialog.getByRole('button', { name: 'Löschen …' }).click();
	await page
		.getByRole('dialog', { name: 'Arbeitsbereich löschen' })
		.getByRole('button', { name: 'Löschen', exact: true })
		.click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	menu = await openMenu(page);
	await expect(menu.getByRole('menuitem', { name: 'Zweite Studie', exact: true })).toHaveCount(0);
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
		expect((await (await context.request.get('/api/reader/workspaces')).json()).workspaces).toEqual(
			[expect.objectContaining({ name: 'Standard', isActive: true })]
		);
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

test('creating a workspace flushes the visible passage before copying it', async ({ page }) => {
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
		const creating = saveWorkspace(page, 'Aktuelle Lesestelle');
		await expect(
			page
				.getByRole('dialog', { name: 'Neuer Arbeitsbereich', exact: true })
				.getByRole('button', { name: 'Wird gespeichert …' })
		).toBeVisible();
		releaseReference();
		await creating;
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

const singleBibleState = (reference: string) =>
	`layout=single&tab=1.1:SEEDDE:A:${reference}&active=1.1&focus=1`;

type WorkspaceSelection = {
	activeSavedWorkspaceId: string;
	activeSavedWorkspaceVersion: number;
	activeSavedWorkspaceContentVersion: number;
};

async function workspaceSelection(page: Page): Promise<WorkspaceSelection> {
	const response = await page.request.get('/api/reader/workspaces');
	expect(response.ok()).toBe(true);
	return response.json();
}

async function createNamedWorkspace(page: Page, name: string, reference: string) {
	const response = await page.request.post('/api/reader/workspaces', {
		data: { name, snapshot: { readerState: singleBibleState(reference), layoutSizes: {} } }
	});
	expect(response.status()).toBe(201);
	return (await response.json()).workspace as { id: string; revision: number };
}

async function expectActiveName(page: Page, name: string) {
	const menu = await openMenu(page);
	await expect(menu.getByRole('menuitem', { name, exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(menu.locator('[aria-current="true"]')).toHaveCount(1);
	await page.keyboard.press('Escape');
}

async function openNamedWorkspace(page: Page, name: string, path: string) {
	const menu = await openMenu(page);
	await menu.getByRole('menuitem', { name, exact: true }).click();
	await expect(page).toHaveURL((url) => url.pathname === path && url.searchParams.has('layout'));
	await expectActiveName(page, name);
}

test('two devices keep their own active workspace through edits, logo navigation and a new login', async ({
	page,
	browser,
	baseURL
}) => {
	test.setTimeout(60_000);
	await page.setViewportSize({ width: 390, height: 844 });
	const credentials = await loginReader(page);
	await createNamedWorkspace(page, 'Stille Zeit', '1Mo1');
	await createNamedWorkspace(page, 'Research', 'Joh3,16');
	await openNamedWorkspace(page, 'Stille Zeit', '/1Mo1');
	const desktopContext = await browser.newContext({
		baseURL,
		viewport: { width: 1440, height: 1000 }
	});
	try {
		const desktop = await desktopContext.newPage();
		await loginExistingReader(desktop, credentials.email, credentials.password);
		await openNamedWorkspace(desktop, 'Research', '/Joh3,16');
		const desktopSearch = desktop.locator('.reader-tile').first().getByRole('searchbox');
		await desktopSearch.fill('Liebe');
		await desktopSearch.press('Enter');
		await expect(desktop).toHaveURL((url) => url.searchParams.get('search') === '1.1:Liebe');
		await desktop.goto('/notes');
		await page.reload();
		await expectActiveName(page, 'Stille Zeit');
		await expect(page).toHaveURL((url) => url.pathname === '/1Mo1');
		const mobileSearch = page.locator('.reader-tile').first().getByRole('searchbox');
		await mobileSearch.fill('1Mo 2');
		await mobileSearch.press('Enter');
		await expect(page).toHaveURL((url) => url.pathname === '/1Mo2');
		await page.goto('/notes');
		await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
		await expect(page).toHaveURL((url) => url.pathname === '/1Mo2');
		await expectActiveName(page, 'Stille Zeit');
		await desktop.getByRole('link', { name: 'Akribos – Startseite' }).click();
		await expect(desktop).toHaveURL(
			(url) => url.pathname === '/Joh3,16' && url.searchParams.get('search') === '1.1:Liebe'
		);
		await expectActiveName(desktop, 'Research');
		await expect(desktopSearch).toHaveValue('Liebe');

		// The same named contents are shared; only the active selection belongs to this device.
		await openNamedWorkspace(page, 'Research', '/Joh3,16');
		await expect(mobileSearch).toHaveValue('Liebe');
		await openNamedWorkspace(page, 'Stille Zeit', '/1Mo2');
		await expectActiveName(desktop, 'Research');
		const logout = await page.request.post('/logout', {
			form: {},
			headers: { origin: baseURL! }
		});
		expect(logout.ok()).toBe(true);
		await loginExistingReader(page, credentials.email, credentials.password);
		await expectActiveName(page, 'Stille Zeit');
		await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
		await expect(page).toHaveURL((url) => url.pathname === '/1Mo2');
		await expectActiveName(desktop, 'Research');
	} finally {
		await desktopContext.close();
	}
});

test('a stale tab cannot save after the same device switches A to B and back to A', async ({
	page,
	context
}) => {
	test.setTimeout(60_000);
	await loginReader(page);
	const first = await createNamedWorkspace(page, 'Erster', 'Joh1');
	await createNamedWorkspace(page, 'Zweiter', '1Mo1');
	await openNamedWorkspace(page, 'Erster', '/Joh1');
	const stale = await workspaceSelection(page);
	const otherTab = await context.newPage();
	try {
		await otherTab.goto('/account');
		await openNamedWorkspace(otherTab, 'Zweiter', '/1Mo1');
		await openNamedWorkspace(otherTab, 'Erster', '/Joh1');
		const current = await workspaceSelection(otherTab);
		expect(current.activeSavedWorkspaceId).toBe(stale.activeSavedWorkspaceId);
		expect(current.activeSavedWorkspaceVersion).toBeGreaterThan(stale.activeSavedWorkspaceVersion);
		const rejected = await page.request.put(`/api/reader/workspaces/${first.id}/view`, {
			data: {
				snapshot: {
					readerState: `${singleBibleState('Joh1')}&search=1.1:veraltet`,
					layoutSizes: {}
				},
				workspaceVersion: stale.activeSavedWorkspaceVersion,
				workspaceContentVersion: stale.activeSavedWorkspaceContentVersion
			}
		});
		expect(rejected.status()).toBe(409);
		expect(await rejected.json()).toMatchObject({ saved: false, reason: 'conflict' });
		const failedSave = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/reader/workspaces/${first.id}/view`) &&
				response.status() === 409
		);
		const search = page.locator('.reader-tile').first().getByRole('searchbox');
		await search.fill('Anfang');
		await search.press('Enter');
		await failedSave;
		await expect(page.getByRole('alert')).toContainText(/Arbeitsbereich/);
		// Explicit opening resolves a rejected workspace save instead of retrying it forever.
		await openNamedWorkspace(page, 'Zweiter', '/1Mo1');
		await openNamedWorkspace(page, 'Erster', '/Joh1');
		await expect(search).toHaveValue('Joh 1');
		await expect(page).toHaveURL((url) => !url.searchParams.has('search'));
	} finally {
		await otherTab.close();
	}
});

test('concurrent searches in one shared workspace report a conflict and preserve the saved search', async ({
	page,
	browser,
	baseURL
}) => {
	test.setTimeout(60_000);
	const credentials = await loginReader(page);
	const shared = await createNamedWorkspace(page, 'Gemeinsam geöffnet', 'Joh3,16');
	await createNamedWorkspace(page, 'Andere Ansicht', '1Mo1');
	await openNamedWorkspace(page, 'Gemeinsam geöffnet', '/Joh3,16');
	const otherContext = await browser.newContext({ baseURL });
	try {
		const other = await otherContext.newPage();
		await loginExistingReader(other, credentials.email, credentials.password);
		await openNamedWorkspace(other, 'Gemeinsam geöffnet', '/Joh3,16');
		const saved = other.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/reader/workspaces/${shared.id}/view`) &&
				response.request().method() === 'PUT'
		);
		const otherSearch = other.locator('.reader-tile').first().getByRole('searchbox');
		await otherSearch.fill('Liebe');
		await otherSearch.press('Enter');
		expect((await saved).status()).toBe(200);
		const rejected = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/reader/workspaces/${shared.id}/view`) &&
				response.status() === 409
		);
		const search = page.locator('.reader-tile').first().getByRole('searchbox');
		await search.fill('Wort');
		await search.press('Enter');
		await rejected;
		await expect(page.getByRole('alert')).toContainText(/Arbeitsbereich/);
		await openNamedWorkspace(page, 'Andere Ansicht', '/1Mo1');
		await openNamedWorkspace(page, 'Gemeinsam geöffnet', '/Joh3,16');
		await expect(search).toHaveValue('Liebe');
		await expect(otherSearch).toHaveValue('Liebe');
		await expect(page).toHaveURL((url) => url.searchParams.get('search') === '1.1:Liebe');
	} finally {
		await otherContext.close();
	}
});

test('deleting a workspace active on another device gives that device a writable fallback', async ({
	page,
	browser,
	baseURL
}) => {
	test.setTimeout(60_000);
	const credentials = await loginReader(page);
	await createNamedWorkspace(page, 'Bleibt erhalten', '1Mo1');
	const removed = await createNamedWorkspace(page, 'Wird entfernt', 'Joh1');
	await openNamedWorkspace(page, 'Bleibt erhalten', '/1Mo1');
	const otherContext = await browser.newContext({ baseURL });
	try {
		const other = await otherContext.newPage();
		await loginExistingReader(other, credentials.email, credentials.password);
		await openNamedWorkspace(other, 'Wird entfernt', '/Joh1');
		const before = await workspaceSelection(other);
		const deleted = await page.request.delete(`/api/reader/workspaces/${removed.id}`, {
			data: { revision: removed.revision }
		});
		expect(deleted.ok()).toBe(true);
		await other.goto('/');
		const after = await workspaceSelection(other);
		expect(after.activeSavedWorkspaceId).not.toBe(removed.id);
		expect(after.activeSavedWorkspaceVersion).toBeGreaterThan(before.activeSavedWorkspaceVersion);
		const persisted = other.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/reader/workspaces/${after.activeSavedWorkspaceId}/view`) &&
				response.request().method() === 'PUT'
		);
		const search = other.locator('.reader-tile').first().getByRole('searchbox');
		await search.fill('Wort');
		await search.press('Enter');
		expect((await persisted).status()).toBe(200);
		await other.goto('/notes');
		await other.getByRole('link', { name: 'Akribos – Startseite' }).click();
		await expect(search).toHaveValue('Wort');
		await expectActiveName(page, 'Bleibt erhalten');
	} finally {
		await otherContext.close();
	}
});

test('a full page exit during scroll restores the bound source tab without changing its independent neighbour', async ({
	page
}) => {
	await loginReader(page);
	await page.setViewportSize({ width: 900, height: 300 });
	const response = await page.request.post('/api/reader/workspaces', {
		data: {
			name: 'Getrennte Stellen',
			snapshot: {
				readerState:
					'layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDPLAIN:B:Joh3&active=1.1&active=2.1&focus=1',
				layoutSizes: {}
			}
		}
	});
	expect(response.status()).toBe(201);
	await openNamedWorkspace(page, 'Getrennte Stellen', '/1Mo1');
	await page.route(
		(url) => url.searchParams.has('/setTabReference'),
		(route) => route.abort()
	);
	await page.locator('.flow-column[data-resource-id="SEEDPLAIN"]').evaluate((element) => {
		const verse = element.querySelector<HTMLElement>('[data-verse-key="43:3:16"]');
		if (!verse) throw new Error('missing fixture verse');
		const distance =
			verse.getBoundingClientRect().bottom - element.getBoundingClientRect().top - 22;
		element.dispatchEvent(
			new WheelEvent('wheel', {
				bubbles: true,
				cancelable: true,
				deltaY: distance / 0.55
			})
		);
		element.dispatchEvent(new Event('scroll'));
		// A real document navigation cannot await Svelte's SPA autosave hooks or the 200ms timer.
		window.location.assign('/notes');
	});
	await expect(page).toHaveURL('/notes');
	await page.unrouteAll();
	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
	await expect(page).toHaveURL(
		(url) => url.pathname === '/Joh3,17' && url.searchParams.get('focus') === '2'
	);
	await expect(page.locator('.reader-tile').first().getByRole('searchbox')).toHaveValue('1Mo 1');
	const source = page.locator('.reader-tile').nth(1).getByRole('searchbox');
	await expect(source).toHaveValue('Joh 3,17');
	// Resuming must retain an owned, writable workspace rather than turn it into a shared URL branch.
	const saved = page.waitForResponse(
		(result) => result.url().includes('/api/reader/workspaces/') && result.url().endsWith('/view')
	);
	await source.fill('Liebe');
	await source.press('Enter');
	expect((await saved).status()).toBe(200);
	await page.goto('/notes');
	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
	await expect(source).toHaveValue('Liebe');
});

test('a copied URL that changes only a search stays independent of the saved workspace', async ({
	page
}) => {
	await loginReader(page);
	await createNamedWorkspace(page, 'Gespeicherte Ansicht', 'Joh3,16');
	await openNamedWorkspace(page, 'Gespeicherte Ansicht', '/Joh3,16');
	await page.goto(`/Joh3,16?${singleBibleState('Joh3,16')}&search=1.1:Wort`);
	const search = page.locator('.reader-tile').first().getByRole('searchbox');
	await expect(search).toHaveValue('Wort');
	await search.fill('Liebe');
	await search.press('Enter');
	await expect(page).toHaveURL((url) => url.searchParams.get('search') === '1.1:Liebe');
	await page.getByRole('button', { name: 'Kachelanordnung wählen' }).click();
	await page.getByRole('menuitemradio', { name: /Zwei Spalten/ }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(2);
	await page.goto('/notes');
	await openNamedWorkspace(page, 'Gespeicherte Ansicht', '/Joh3,16');
	await expect(page.locator('.reader-tile')).toHaveCount(1);
	await expect(search).toHaveValue('Joh 3,16');
	await expect(page).toHaveURL((url) => !url.searchParams.has('search'));
});

for (const outcome of ['success', 'server error'] as const) {
	test(`a late workspace form ${outcome} does not replace the account after navigation`, async ({
		page
	}) => {
		await loginReader(page);
		await createNamedWorkspace(page, 'Antwort nach Navigation', 'Joh1');
		await openNamedWorkspace(page, 'Antwort nach Navigation', '/Joh1');
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let reachedServer = false;
		await page.route(
			(url) => url.searchParams.has('/setLayout'),
			async (route) => {
				const response = await route.fetch();
				reachedServer = true;
				await held;
				if (outcome === 'success') await route.fulfill({ response });
				else
					await route.fulfill({
						status: 503,
						contentType: 'application/json',
						body: JSON.stringify({
							type: 'error',
							status: 503,
							error: { message: 'Verspäteter Testfehler' }
						})
					});
			}
		);
		try {
			await page.getByRole('button', { name: 'Kachelanordnung wählen' }).click();
			await page.getByRole('menuitemradio', { name: /Zwei Spalten/ }).click();
			await expect.poll(() => reachedServer).toBe(true);
			await page.keyboard.press('Escape');
			await page.getByRole('button', { name: 'Konto-Menü' }).click();
			await page.locator('a[role="menuitem"][href="/account"]').click();
			await expect(page).toHaveURL('/account');
			const response = page.waitForResponse((result) =>
				new URL(result.url()).searchParams.has('/setLayout')
			);
			release();
			await response;
			await page.waitForLoadState('networkidle');
			await expect(page).toHaveURL('/account');
			await expect(page.getByLabel('Anzeigename')).toBeVisible();
		} finally {
			release();
		}
	});
}
