import { expect, test, type Page } from '@playwright/test';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Reader, tab-scoped search and embedded lexicon study.
 *
 * Runs against the fixture from `pnpm db:seed`: SEEDDE (with Strong's numbers), SEEDPLAIN,
 * SEEDCOMMENTARY and a tiny Greek morphology source, plus three dictionary entries.
 */

async function expectReaderPath(page: Page, pathname: string): Promise<void> {
	await expect(page).toHaveURL(
		(url) =>
			url.pathname === pathname &&
			Boolean(url.searchParams.get('layout')) &&
			url.searchParams.has('tab')
	);
}

/** The commentary fixture is not a default column, so tests exercising it must select it explicitly. */
async function useCommentaryColumn(page: Page): Promise<void> {
	await page.context().addCookies([
		{
			name: 'columns',
			value: 'SEEDDE,SEEDPLAIN,SEEDCOMMENTARY',
			url: 'http://localhost:4173'
		}
	]);
}

async function addResourceTab(
	page: Page,
	tileIndex: number,
	resourceId: string,
	category?: string
): Promise<void> {
	const tile = page.locator('.reader-tile').nth(tileIndex);
	const tabsBefore = await tile.locator('.resource-tab').count();
	await tile.getByRole('button', { name: /Ressource in Bereich .* öffnen/ }).click();
	if (category) {
		await page
			.getByRole('dialog', { name: 'Werk wählen' })
			.getByRole('button', { name: new RegExp(`^${category}`) })
			.click();
	}
	await page
		.locator('form')
		.filter({ has: page.locator(`input[name="resource"][value="${resourceId}"]`) })
		.getByRole('button')
		.click();
	await expect(tile.locator('.resource-tab')).toHaveCount(tabsBefore + 1);
	if (resourceId === 'STRONGS_GREEK') {
		await expect(tile.getByLabel(/Lexikoneintrag in/)).toBeVisible();
	} else {
		await expect(tile.locator(`.flow-column[data-resource-id="${resourceId}"]`)).toBeVisible();
	}
}

function tabReference(page: Page, tileIndex = 0) {
	return page
		.locator('.reader-tile')
		.nth(tileIndex)
		.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
}

function lexiconLookup(page: Page, tileIndex = 1) {
	return page
		.locator('.reader-tile')
		.nth(tileIndex)
		.getByRole('searchbox', { name: /Strong-Nummer oder Wort in/ });
}

async function selectLinkSet(page: Page, tileIndex: number, linkSet: string): Promise<void> {
	const tile = page.locator('.reader-tile').nth(tileIndex);
	await tile.getByRole('button', { name: /Tabgruppe für/ }).click();
	await page
		.getByRole('menu', { name: 'Tabgruppe wechseln' })
		.getByRole('menuitemradio', { name: linkSet, exact: true })
		.click();
}

async function loginAsAdmin(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden' }).click();
}

async function registerReader(page: Page): Promise<void> {
	const email = `reader-url-${Math.random().toString(36).slice(2, 10)}@example.com`;
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('URL Reader');
	await page.getByLabel('Passwort', { exact: true }).fill('ein-sicheres-passwort');
	await page.getByLabel('Passwort wiederholen').fill('ein-sicheres-passwort');
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await page.evaluate(() => fetch('/api/tour', { method: 'POST' }));
}

test('the root shows the reader to signed-out visitors', async ({ page }) => {
	const response = await page.goto('/');

	expect(response?.status()).toBe(200);
	await expectReaderPath(page, '/Joh1');
	await expect(tabReference(page)).toHaveValue('Joh 1');
});

test('a first visit starts with Bible, commentary and lexicon in three linked columns', async ({
	page
}) => {
	await page.context().clearCookies();
	await page.context().addCookies([
		{
			name: 'tour-guest-done',
			value: '1',
			url: 'http://localhost:4173'
		}
	]);
	await page.goto('/Joh3');

	const tiles = page.locator('.reader-tile');
	await expect(tiles).toHaveCount(3);
	await expect(tiles.nth(0).getByRole('tab', { name: /^Testübersetzung/ })).toBeVisible();
	await expect(tiles.nth(1).getByRole('tab', { name: /^Kommentar/ })).toBeVisible();
	await expect(tiles.nth(2).getByRole('tab', { name: /^Strong Griechisch/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Tabgruppe für.*aktuell A/ })).toHaveCount(3);
});

test('the root resumes the reader for a signed-in user', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/Joh3');
	await page.goto('/');

	await expectReaderPath(page, '/Joh3');
});

test('Impressum and Datenschutz are reachable only from the global menu', async ({ page }) => {
	await page.goto('/Joh3');

	// No longer direct top-bar links — only reachable through the consolidated user menu.
	await expect(page.getByRole('banner').getByRole('link', { name: 'Impressum' })).toHaveCount(0);
	await expect(page.getByRole('banner').getByRole('link', { name: 'Datenschutz' })).toHaveCount(0);

	// Both live in the consolidated user menu now, styled as menu items rather than plain links.
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await page.getByRole('menuitem', { name: 'Impressum' }).click();
	await expect(page).toHaveURL(/\/impressum$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Impressum');

	await page.goto('/Joh3');
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await page.getByRole('menuitem', { name: 'Datenschutz' }).click();
	await expect(page).toHaveURL(/\/datenschutz$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Datenschutzerklärung');
});

test('the help page is reachable from the site header', async ({ page }) => {
	await page.goto('/Joh3');

	// Hilfe lives in the consolidated user menu now, alongside the account links.
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await page.getByRole('menuitem', { name: 'Hilfe' }).click();

	await expect(page).toHaveURL(/\/help$/);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Wie können wir dir helfen?' })
	).toBeVisible();
});

test('global chapter navigation is absent and reader controls stay borderless', async ({
	page
}) => {
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.goto('/Gen2');

	await expect(page.getByRole('link', { name: 'Vorheriges Kapitel' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Nächstes Kapitel' })).toHaveCount(0);
	const controls = [
		page.getByTestId('layout-picker'),
		page.getByRole('button', { name: 'Dunkles Design' })
	];

	for (const control of controls) {
		await expect(control).toBeVisible();
		await expect(control).toHaveCSS('border-top-width', '0px');
		await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	}
});

test('the about page loads with a visible heading', async ({ page }) => {
	await page.goto('/Joh3');
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	const anonymousAbout = page.getByRole('menuitem', { name: 'Über' });
	await expect(anonymousAbout).toHaveAttribute('href', '/about');
	await anonymousAbout.click();

	await expect(page).toHaveURL(/\/about$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lies den Text');

	await loginAsAdmin(page);
	await page.goto('/Joh3');
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	const signedInAbout = page.getByRole('menuitem', { name: 'Über' });
	await expect(signedInAbout).toHaveAttribute('href', '/about');
	await signedInAbout.click();

	await expect(page).toHaveURL(/\/about$/);
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lies den Text');
});

test('the landing page shows a prominent reader link and real product screenshots', async ({
	page
}) => {
	await page.goto('/about');

	const readerLink = page.locator('.hero').getByRole('link', { name: /Jetzt lesen/ });
	await expect(readerLink).toBeVisible();
	await expect(readerLink).toHaveAttribute('href', '/Johannes3');
	await expect
		.poll(async () => (await readerLink.boundingBox())?.height ?? 0)
		.toBeGreaterThanOrEqual(70);

	await expect(
		page.getByRole('img', {
			name: 'Akribos-Reader mit zwei parallel geöffneten Bibelübersetzungen'
		})
	).toHaveAttribute('src', '/landing/reader.webp');
	await expect(
		page.getByRole('img', { name: 'Geöffnete Strong-Seitenleiste im Akribos-Reader' })
	).toHaveAttribute('src', '/landing/strong-study.webp');
	await expect(
		page.getByRole('img', {
			name: 'Geöffnetes Versmenü im Akribos-Reader mit Markierungen, Kommentaren und Stellensammlungen'
		})
	).toHaveAttribute('src', '/landing/verse-menu.webp');
});

test('the obsolete book and chapter chooser is absent from every tab', async ({ page }) => {
	await page.goto('/Joh3');
	await expect(page.getByRole('button', { name: 'Buch und Kapitel wählen' })).toHaveCount(0);
});

test('resource tabs use the dedicated tab title instead of the selection title', async ({
	page
}) => {
	await page.goto('/Joh3');
	const secondTile = page.locator('.reader-tile').nth(1);

	await expect(secondTile.locator('.resource-tab')).toHaveAttribute('aria-label', 'Schlicht Tab');
	await expect(secondTile.locator('.tab-title')).toHaveAttribute('title', 'Schlicht Tab');
	await expect(secondTile.locator('.tab-title')).not.toContainText('Testübersetzung schlicht');
});

test('tabs keep independent references and restore them when activated', async ({ page }) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 0, 'SEEDPLAIN');
	await selectLinkSet(page, 0, 'B');

	await tabReference(page).fill('1Mo 2');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/1Mo2');
	await expect(tabReference(page)).toHaveValue('1Mo 2');

	const firstTile = page.locator('.reader-tile').first();
	await firstTile.getByRole('tab', { name: /^Testübersetzung/ }).click();
	await expectReaderPath(page, '/Joh3');
	await expect(tabReference(page)).toHaveValue('Joh 3');
	await expect(
		page.getByText('Denn also hat Gott die Welt geliebt', { exact: false })
	).toBeVisible();

	await firstTile.getByRole('tab', { name: /^Schlicht/ }).click();
	await expectReaderPath(page, '/1Mo2');
	await expect(tabReference(page)).toHaveValue('1Mo 2');
});

test('linked inactive tabs receive the current reference before they are activated', async ({
	page
}) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 1, 'SEEDCOMMENTARY', 'Kommentare');
	await selectLinkSet(page, 1, 'B');

	const leftColumn = page.locator('.flow-column').first();
	await leftColumn.evaluate((element) => {
		const target = element.querySelector<HTMLElement>('[data-verse-key="43:3:17"]');
		if (!target) throw new Error('fixture verse 17 is missing');
		element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		element.scrollTop = target.offsetTop;
		element.dispatchEvent(new Event('scroll'));
	});

	// Activate the inactive A tab before the debounced persistence runs while the tile itself shows B.
	// The target takes the live A position from the other tile; its stale position must not move A.
	const secondTile = page.locator('.reader-tile').nth(1);
	await page.waitForTimeout(250);
	const chapterRequests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith('/api/reader/')) {
			chapterRequests.push(request.url());
		}
	});
	await secondTile.getByRole('tab', { name: /^Schlicht/ }).click();
	await expectReaderPath(page, '/Joh3,17');
	await expect(tabReference(page)).toHaveValue('Joh 3,17');
	await expect(tabReference(page, 1)).toHaveValue('Joh 3,17');
	await page.waitForTimeout(250);
	expect(chapterRequests).toEqual([]);
});

test('the book icon replaces the work in the current tab without changing its reference', async ({
	page
}) => {
	await page.goto('/Joh3');
	const firstTile = page.locator('.reader-tile').first();
	await firstTile.getByRole('button', { name: /wechseln$/ }).click();
	const chooser = page.getByRole('dialog', { name: 'Werk wählen' });
	await expect(chooser).toBeVisible();
	expect((await chooser.boundingBox())?.width).toBeLessThanOrEqual(368);

	const replacement = page
		.locator('form')
		.filter({ has: page.locator('input[name="resource"][value="SEEDPLAIN"]') });
	await replacement.getByRole('button').hover();
	await expect(chooser.locator('.resource-preview')).toContainText('Testübersetzung schlicht');
	await replacement.getByRole('button').click();

	await expect(firstTile.locator('.resource-tab')).toHaveCount(1);
	await expect(firstTile.getByRole('tab', { name: /^Schlicht/ })).toBeVisible();
	await expect(tabReference(page)).toHaveValue('Joh 3');
});

test('resource tabs hide native scrollbars and copyright lives behind the info button', async ({
	page
}) => {
	await page.goto('/Joh3');
	const firstTile = page.locator('.reader-tile').first();
	await expect(firstTile.locator('.tab-strip')).toHaveCSS('scrollbar-width', 'none');
	await expect(firstTile.getByTestId('resource-tabs')).toHaveCSS('overflow', 'hidden');
	await expect(page.locator('.tile-license')).toHaveCount(0);

	await firstTile.getByRole('button', { name: /Informationen zu/ }).click();
	const info = page.getByRole('menu', { name: 'Werk-Informationen' });
	await expect(info).toBeVisible();
	await expect(info).toContainText('Public Domain');
});

test('a reference shows the chapter in parallel columns', async ({ page }) => {
	await page.goto('/Joh3,16');

	await expect(tabReference(page)).toHaveValue('Joh 3,16');

	// Both translations of verse 16 are present.
	await expect(
		page.getByText('Denn also hat Gott die Welt geliebt', { exact: false })
	).toBeVisible();
	await expect(
		page.getByText('Denn so sehr hat Gott die Welt geliebt', { exact: false })
	).toBeVisible();

	// The requested verse is highlighted.
	await expect(page.locator('.flow-verse.highlighted').first()).toBeVisible();
});

test('the full Strong occurrence page is usable on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/G25');

	await expect(page.getByRole('heading', { level: 1 })).toContainText('ἀγαπάω');
	await expect(page.getByText('Bedeutung und Herkunft')).toBeVisible();
	await expect(page.getByText('Nach Übersetzungsvariante filtern')).toBeVisible();
	await expect(page.getByText('Nach Bibelbuch filtern')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();

	const viewportDoesNotOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth <= window.innerWidth
	);
	expect(viewportDoesNotOverflow).toBe(true);
});

test('commentary text is formatted the same as scripture text', async ({ page }) => {
	await useCommentaryColumn(page);

	await page.goto('/Joh3,16');
	const flowCommentary = page.locator('.flow-reference .commentary-body').first();
	await expect(flowCommentary).toContainText('bekannteste Vers');
	expect(
		await page
			.locator('.flow-reference')
			.first()
			.evaluate((el) => getComputedStyle(el).fontSize)
	).toBe(
		await page
			.locator('.flow-verse')
			.first()
			.evaluate((el) => getComputedStyle(el).fontSize)
	);
	expect(
		await page
			.locator('.flow-reference')
			.first()
			.evaluate((el) => getComputedStyle(el).fontFamily)
	).toBe(
		await page
			.locator('.flow-verse')
			.first()
			.evaluate((el) => getComputedStyle(el).fontFamily)
	);
});

test('a column boundary can be dragged to resize the columns, and the split persists', async ({
	page
}) => {
	await page.goto('/Joh3');

	// The splitter sits halfway down the desktop reading area, where the resized columns themselves
	// make its purpose visible. The phone layout switches columns with tabs and renders no splitter.
	const reader = page.getByTestId('flow-reader');
	const handle = reader.getByRole('separator');
	await expect(handle).toHaveCount(1);

	const readerBox = (await reader.boundingBox())!;
	const handleBox = (await handle.boundingBox())!;
	const startX = handleBox.x + handleBox.width / 2;
	const y = handleBox.y + handleBox.height / 2;
	const targetX = startX + readerBox.width * 0.2;

	// Dispatches synthetic pointer events directly rather than driving `page.mouse`: the handler
	// computes the new width from this event's own `clientX` against the position recorded at
	// pointerdown, not incrementally, so one pointermove carrying the final coordinate is enough —
	// and this sidesteps a CDP/headless-Chromium quirk where a real synthetic mouse-up can go
	// undelivered if the element under the cursor was itself moved (by our own live-resize feedback)
	// since the preceding mouse-move.
	await handle.dispatchEvent('pointerdown', { clientX: startX, clientY: y, pointerId: 1 });
	await page.evaluate(
		([x, pointerY]) => {
			window.dispatchEvent(
				new PointerEvent('pointermove', { clientX: x, clientY: pointerY, bubbles: true })
			);
		},
		[targetX, y]
	);
	await page.evaluate(() => {
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	});

	// The boundary moved right, so the first column grew and the second shrank.
	const tiles = reader.locator('.reader-tile');
	const [firstWidth, secondWidth] = await tiles.evaluateAll((nodes) =>
		nodes.map((node) => node.getBoundingClientRect().width)
	);
	expect(firstWidth).toBeGreaterThan(secondWidth * 1.3);

	// The split is part of the persisted workspace and survives a reload.
	await page.reload();
	const [firstAfterReload, secondAfterReload] = await tiles.evaluateAll((nodes) =>
		nodes.map((node) => node.getBoundingClientRect().width)
	);
	expect(firstAfterReload).toBeGreaterThan(secondAfterReload * 1.3);
});

test('all Logos-style arrangements are available and an asymmetric layout persists', async ({
	page
}) => {
	await page.goto('/Joh3');
	await page.getByTestId('layout-picker').click();
	await expect(page.locator('.layout-option')).toHaveCount(8);
	await page.getByRole('menuitemradio', { name: /Links groß/ }).click();

	const reader = page.getByTestId('flow-reader');
	await expect(reader).toHaveAttribute('data-layout', 'left-full');
	await expect(reader.locator('.reader-tile')).toHaveCount(3);
	const boxes = await reader.locator('.reader-tile').evaluateAll((nodes) =>
		nodes.map((node) => {
			const box = node.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height };
		})
	);
	expect(boxes[0]!.height).toBeGreaterThan(boxes[1]!.height * 1.8);
	expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x);
	expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y);

	await page.reload();
	await expect(reader).toHaveAttribute('data-layout', 'left-full');
});

test('the compact arrangement menu closes when clicking outside', async ({ page }) => {
	await page.goto('/Joh3');
	await page.getByTestId('layout-picker').click();
	const menu = page.getByRole('menu', { name: 'Kachelanordnung' });
	await expect(menu).toBeVisible();

	await page
		.locator('.tab-toolbar')
		.first()
		.click({ position: { x: 100, y: 8 } });
	await expect(menu).toHaveCount(0);
});

test('the compact arrangement trigger toggles its menu', async ({ page }) => {
	await page.goto('/Joh3');
	const trigger = page.getByTestId('layout-picker');
	const menu = page.getByRole('menu', { name: 'Kachelanordnung' });

	await trigger.click();
	await expect(menu).toBeVisible();
	await trigger.click();
	await expect(menu).toHaveCount(0);
});

test('a duplicated reader URL restores layout, tabs, positions, tab groups and search', async ({
	page
}) => {
	await page.goto('/Joh3');
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /Drei Spalten/ }).click();
	await addResourceTab(page, 0, 'SEEDCOMMENTARY', 'Kommentare');
	await selectLinkSet(page, 1, 'B');
	await tabReference(page, 1).fill('1Mo 2');
	await tabReference(page, 1).press('Enter');
	await expectReaderPath(page, '/1Mo2');
	await expect(tabReference(page, 1)).toHaveValue('1Mo 2');
	await tabReference(page, 0).fill('bekannteste');
	await tabReference(page, 0).press('Enter');
	await expect(page.getByLabel('Suchergebnisse in Testkommentar')).toBeVisible();

	const copiedUrl = page.url();
	const copiedState = new URL(copiedUrl).search;
	expect(copiedState).toBeTruthy();
	const duplicate = await page.context().newPage();
	await duplicate.goto(copiedUrl);

	await expect(duplicate.locator('.reader-tile')).toHaveCount(3);
	await expect(duplicate.locator('.reader-tile').first().locator('.resource-tab')).toHaveCount(2);
	await expect(
		duplicate
			.locator('.reader-tile')
			.first()
			.getByRole('tab', { name: /^Kommentar/ })
	).toHaveAttribute('aria-selected', 'true');
	await expect(tabReference(duplicate, 1)).toHaveValue('1Mo 2');
	await expect(
		duplicate
			.locator('.reader-tile')
			.nth(1)
			.getByRole('button', { name: /aktuell B/ })
	).toBeVisible();
	await expect(tabReference(duplicate, 0)).toHaveValue('bekannteste');
	await expect(duplicate.getByLabel('Suchergebnisse in Testkommentar')).toBeVisible();

	// Once duplicated, each address is an independent branch even though both tabs share cookies.
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /Eine Kachel/ }).click();
	await duplicate.reload();
	await expect(duplicate.locator('.reader-tile')).toHaveCount(3);
	await expect(duplicate).toHaveURL((url) => url.search === copiedState);
	await duplicate.close();
});

test('opening and editing somebody else’s reader URL does not replace the account workspace', async ({
	page,
	browser
}) => {
	await registerReader(page);
	await page.goto('/Joh3');
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /Eine Kachel/ }).click();
	await expect(page.locator('.reader-tile')).toHaveCount(1);

	const foreignContext = await browser.newContext();
	const foreignPage = await foreignContext.newPage();
	await foreignPage.goto('/Joh3');
	await foreignPage.getByTestId('layout-picker').click();
	await foreignPage.getByRole('menuitemradio', { name: /Drei Spalten/ }).click();
	await expect(foreignPage.locator('.reader-tile')).toHaveCount(3);
	const foreignUrl = foreignPage.url();
	await foreignContext.close();

	await page.goto(foreignUrl);
	await expect(page.locator('.reader-tile')).toHaveCount(3);
	await selectLinkSet(page, 0, 'D');
	await page.reload();
	await expect(page.locator('.reader-tile')).toHaveCount(3);

	await page.goto('/');
	await expect(page.locator('.reader-tile')).toHaveCount(1);
});

test('a tab keeps its A-E link set when it moves between tiles', async ({ page }) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 0, 'SEEDPLAIN');
	const firstTile = page.locator('.reader-tile').first();
	await selectLinkSet(page, 0, 'C');
	await expect(firstTile.locator('.resource-tab.active .tab-link-set')).toHaveText('C');
	await expect(firstTile.getByRole('button', { name: /Tabgruppe für.*C/ })).toContainText(
		'Tabgruppe wechseln'
	);

	await firstTile.getByRole('button', { name: 'Tab verschieben' }).click();
	await page.getByRole('menuitem', { name: 'Bereich 2' }).click();
	const secondTile = page.locator('.reader-tile').nth(1);
	await expect(secondTile.locator('.resource-tab')).toHaveCount(2);
	await expect(secondTile.locator('.resource-tab.active .tab-link-set')).toHaveText('C');
	await expect(secondTile.getByRole('button', { name: /Tabgruppe für.*C/ })).toBeVisible();

	await page.reload();
	await expect(
		page
			.locator('.reader-tile')
			.nth(1)
			.getByRole('button', { name: /Tabgruppe für.*C/ })
	).toBeVisible();
});

test('different link letters keep visible tabs independently scrollable', async ({ page }) => {
	await page.route('**/api/reader/**', (route) => route.abort());
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/Joh3');
	const secondTile = page.locator('.reader-tile').nth(1);
	await selectLinkSet(page, 1, 'B');
	await expect(secondTile.locator('.resource-tab.active .tab-link-set')).toHaveText('B');

	const columns = page.locator('.flow-column');
	await page.waitForTimeout(200);
	const secondBefore = await columns.nth(1).evaluate((element) => element.scrollTop);
	await columns.first().evaluate((element) => {
		const verse = element.querySelector<HTMLElement>('[data-verse-key="43:3:17"]');
		element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		element.scrollTop = verse?.offsetTop ?? element.scrollHeight;
		element.dispatchEvent(new Event('scroll'));
	});
	await page.waitForTimeout(250);
	const secondAfter = await columns.nth(1).evaluate((element) => element.scrollTop);
	expect(Math.abs(secondAfter - secondBefore)).toBeLessThan(2);
});

test('flowing text keeps columns scroll-synchronized', async ({ page }) => {
	await page.route('**/api/reader/**', (route) => route.abort());
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/Joh3');
	expect(await page.evaluate(() => window.scrollY)).toBe(0);

	await expect(page.getByRole('button', { name: 'Bibeltext verkleinern' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Bibeltext vergrößern' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dunkles Design' })).toBeVisible();

	const reader = page.getByTestId('flow-reader');
	await expect(reader).toBeVisible();
	await expect(page.locator('.flow-verse').first()).toHaveCSS('display', 'inline');
	await expect(page.locator('.flow-chapter-title')).toHaveCount(0);
	await expect(page.locator('.flow-chapter-number').first()).toHaveText('3');
	await expect(page.locator('.verse-lead').first()).toHaveCSS('white-space', 'nowrap');
	await expect(page.locator('.keep-punctuation').first()).toHaveCSS('white-space', 'nowrap');

	const columns = page.locator('.flow-column');
	await expect(columns).toHaveCount(2);
	await expect(columns.first()).toHaveCSS('scrollbar-width', 'none');
	await page.waitForTimeout(120);
	const secondBefore = await columns.nth(1).evaluate((element) => {
		element.scrollTop = element.scrollHeight;
		return element.scrollTop;
	});
	await columns.first().evaluate((element) => {
		element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		element.scrollTop = element.scrollHeight;
		element.dispatchEvent(new Event('scroll'));
	});

	await expect
		.poll(() => columns.nth(1).evaluate((element) => element.scrollTop))
		.not.toBe(secondBefore);

	// Whichever text column the reader manipulates becomes the source for all the others.
	const firstPosition = await columns.first().evaluate((element) => element.scrollTop);
	await page.waitForTimeout(120);
	await columns.nth(1).evaluate((element) => {
		element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
		element.scrollTop = 0;
		element.dispatchEvent(new Event('scroll'));
	});
	await expect
		.poll(() => columns.first().evaluate((element) => element.scrollTop))
		.not.toBe(firstPosition);

	// The reader stays in flowing text across a regular navigation, too.
	await page.goto('/Joh3');
	await expect(reader).toBeVisible();
});

test('the visible reference advances when a verse enters the top fade', async ({ page }) => {
	await page.route('**/api/reader/**', (route) => route.abort());
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/Joh3');

	const column = page.locator('.flow-column').first();
	await page.waitForTimeout(120);
	const position = await column.evaluate((element) => {
		const verse = element.querySelector<HTMLElement>('[data-verse-key="43:3:16"]')!;
		const fade = document.querySelector<HTMLElement>('.tile-content .flow-edge-fade.top')!;
		const columnTop = element.getBoundingClientRect().top;
		const fadeHeight = fade.getBoundingClientRect().height;
		const distance = verse.getBoundingClientRect().bottom - (columnTop + fadeHeight - 2);
		// Use the reader's wheel path to mark this column as the genuine source, then dispatch the
		// resulting scroll synchronously so the regression does not depend on browser event timing.
		element.dispatchEvent(
			new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: distance / 0.55 })
		);
		element.dispatchEvent(new Event('scroll'));
		return {
			fadeHeight: fade.getBoundingClientRect().height,
			verseBottom: verse.getBoundingClientRect().bottom - columnTop
		};
	});

	// Verse 16 is still below the old 12px anchor, but already inside the 24px fade veil.
	expect(position.fadeHeight).toBe(24);
	expect(position.verseBottom).toBeGreaterThan(12);
	expect(position.verseBottom).toBeLessThan(position.fadeHeight);
	await expect(tabReference(page)).toHaveValue('Joh 3,17');
});

test('a delayed follower scroll event cannot steal a rapidly reused source column', async ({
	page
}) => {
	// Keep endless-scroll requests out of this timing regression: it isolates the delayed scroll event
	// emitted by cross-column alignment while the reader immediately wheels the source again.
	await page.route('**/api/reader/**', (route) => route.abort());
	await page.setViewportSize({ width: 900, height: 260 });
	await page.goto('/Joh3');

	const columns = page.locator('.flow-column');
	await expect(columns).toHaveCount(2);
	await page.waitForTimeout(250);

	const finalSourcePosition = await columns.evaluateAll(async ([first, second]) => {
		const source = first as HTMLElement;
		const follower = second as HTMLElement;
		const verse17 = source.querySelector<HTMLElement>('[data-verse-key="43:3:17"]');
		if (!verse17) throw new Error('fixture verse 17 is missing');

		// First let the normal debounce align the follower to verse 17. Its native scroll event is now
		// programmatic and suppressed for a short window.
		source.scrollTop = verse17.offsetTop;
		source.dispatchEvent(new Event('scroll'));
		await new Promise((resolve) => setTimeout(resolve, 155));

		// The reader immediately uses the real source again. A queued follower event delivered in the
		// same frame must remain suppressed instead of replacing this new source choice.
		source.dispatchEvent(
			new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
		);
		source.scrollTop = 0;
		source.dispatchEvent(new Event('scroll'));
		follower.dispatchEvent(new Event('scroll'));
		await new Promise((resolve) => setTimeout(resolve, 200));
		return source.scrollTop;
	});

	expect(finalSourcePosition).toBe(0);
});

test('mouse-wheel scrolling uses smaller steps for close reading', async ({ page }) => {
	await page.goto('/Joh3');
	const column = page.locator('.flow-column').first();

	const scrolledBy = await column.evaluate((element) => {
		element.scrollTop = 0;
		const before = element.scrollTop;
		element.dispatchEvent(
			new WheelEvent('wheel', {
				deltaY: 100,
				deltaMode: WheelEvent.DOM_DELTA_PIXEL,
				bubbles: true,
				cancelable: true
			})
		);
		return element.scrollTop - before;
	});

	expect(scrolledBy).toBe(55);
});

test('the first scroll after reload stays anchored while the previous chapter is prepended', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/1Mo2');
	await page.reload();

	const column = page.locator('.flow-column').first();
	await column.dispatchEvent('wheel', {
		deltaY: 1,
		deltaMode: 0,
		bubbles: true,
		cancelable: true
	});
	await expect(column.locator('[data-chapter-key="1:1"]')).toBeAttached();

	const firstVisibleVerse = await column.evaluate((element) => {
		const top = element.getBoundingClientRect().top + 12;
		return [...element.querySelectorAll<HTMLElement>('[data-verse-key]')].find(
			(verse) => verse.getBoundingClientRect().bottom > top
		)?.dataset.verseKey;
	});
	expect(firstVisibleVerse).toBe('1:2:1');
});

test('the chapter number opens the menu for the hidden first verse number', async ({ page }) => {
	await page.goto('/1Mo1');

	// Verse 1 keeps its number visually hidden: the displayed chapter number is its menu control.
	await expect(page.locator('.verse-number').filter({ hasText: /^1$/ })).toHaveCount(0);
	const chapterNumber = page.getByRole('link', { name: 'Vers 1.Mose 1,1' }).first();
	await expect(chapterNumber).toHaveText('1');
	await chapterNumber.click();

	await expect(page.getByRole('menu', { name: 'Vers 1.Mose 1,1' })).toBeVisible();
});

test('the verse menu opens where the browser has no popover API', async ({ page }) => {
	// The browsers built into e-ink readers predate `popover`, so the menu falls back to a plain
	// element there. Both halves of the API are taken away here, matching what such a browser offers:
	// no `showPopover()`, and no `:popover-open` for a selector query to survive.
	await page.addInitScript(() => {
		delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
		delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
		const supported = CSS.supports.bind(CSS);
		CSS.supports = ((...query: [string] | [string, string]) =>
			query.some((part) => part.includes(':popover-open'))
				? false
				: supported(...(query as [string]))) as typeof CSS.supports;
	});
	await page.goto('/1Mo1');

	const anchor = page.getByRole('link', { name: 'Vers 1.Mose 1,2' }).first();
	const menu = page.getByRole('menu', { name: 'Vers 1.Mose 1,2' });

	await anchor.click();
	await expect(menu).toBeVisible();

	// Dismissal is the popover's own business elsewhere and this component's here: Escape, a click
	// outside, and the anchor itself as a toggle.
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);

	await anchor.click();
	await page.locator('main').click({ position: { x: 2, y: 2 } });
	await expect(menu).toHaveCount(0);

	await anchor.click();
	await expect(menu).toBeVisible();
	await anchor.click();
	await expect(menu).toHaveCount(0);
});

test('flowing text preloads the next chapter for endless scrolling', async ({ page }) => {
	await page.goto('/Joh3');
	await expect(page.locator('[data-chapter-key="43:4"]').first()).toBeAttached();
});

test('a verse reference scrolls directly to the requested verse', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 260 });
	await page.goto('/1Mo1,3');

	await expect(page.locator('.flow-verse.highlighted').first()).toBeAttached();
	const column = page.locator('.flow-column').first();
	await expect.poll(() => column.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('a tab-specific reference field moves forwards and backwards', async ({ page }) => {
	await page.goto('/1Mo1');

	await tabReference(page).fill('1Mo 2');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/1Mo2');

	await tabReference(page).fill('1Mo 1');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/1Mo1');
});

test('a Strong click opens and then reuses the lexicon tab in its link group', async ({ page }) => {
	await page.goto('/Joh3');
	const secondTile = page.locator('.reader-tile').nth(1);

	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(secondTile.getByRole('tab', { name: /^Strong Griechisch/ })).toBeVisible();
	const study = secondTile.getByLabel('Lexikoneintrag in Strong');
	await expect(study).toContainText('ἀγαπάω');
	await expect(study).toContainText('Joh 3,16');
	await expect(study).toContainText('Grammatik');
	await expect(study).toContainText('ἠγάπησεν');
	await expect(study).toContainText('Übersetzt als');
	await expect(study).toContainText('Vorkommen');
	await expect(study).toContainText('geliebt');
	const readerFontSize = await page
		.locator('.flow-verse')
		.first()
		.evaluate((element) => getComputedStyle(element).fontSize);
	const definition = study.locator('.lexicon-body').first();
	const definitionSize = await definition.evaluate((element) =>
		parseFloat(getComputedStyle(element).fontSize)
	);
	expect(definitionSize).toBeLessThan(parseFloat(readerFontSize));
	const labelSize = await study
		.locator('h3')
		.first()
		.evaluate((element) => getComputedStyle(element).fontSize);
	await expect(study.locator('.occurrence p').first()).toHaveCSS('font-size', readerFontSize);
	await page.getByRole('button', { name: 'Bibeltext vergrößern' }).click();
	await expect
		.poll(() => definition.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)))
		.toBeGreaterThan(definitionSize);
	await expect(study.locator('h3').first()).toHaveCSS('font-size', labelSize);
	await expect(
		lexiconLookup(page)
			.locator('..')
			.getByTitle(/Vorkommen aus/)
	).toContainText('Testübersetzung');
	await expect(lexiconLookup(page)).toHaveValue('G25');

	await page.locator('button.strong[data-strong="G2316"]').first().click();
	await expect(secondTile.getByRole('tab', { name: /^Strong Griechisch/ })).toHaveCount(1);
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('θεός');
	await expect(lexiconLookup(page)).toHaveValue('G2316');

	await lexiconLookup(page).fill('kósmos');
	await lexiconLookup(page).press('Enter');
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('G2889');
});

test('Strong clicks reuse only a lexicon of the matching language', async ({ page }) => {
	await page.goto('/Joh3');
	const firstTile = page.locator('.reader-tile').first();
	const secondTile = page.locator('.reader-tile').nth(1);

	await firstTile.locator('button.strong[data-strong="G25"]').first().click();
	await expect(secondTile.locator('.resource-tab.active')).toContainText('Strong Griechisch');
	await expect(lexiconLookup(page)).toHaveValue('G25');

	await page.goto('/1Mo1');
	await firstTile.locator('button.strong[data-strong="H430"]').first().click();
	await expect(secondTile.getByRole('tab', { name: /^Strong Griechisch/ })).toHaveCount(1);
	await expect(secondTile.getByRole('tab', { name: /^Strong Hebräisch/ })).toHaveCount(1);
	await expect(secondTile.locator('.resource-tab.active')).toContainText('Strong Hebräisch');
	await expect(lexiconLookup(page)).toHaveValue('H430');
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('אֱלֹהִים');
	const hebrewDefinition = secondTile.locator('.lexicon-definition');
	await expect(hebrewDefinition.locator('[lang="de"]')).toHaveText(/Gott, Götter/);
	await expect(hebrewDefinition.locator('[lang="en"]')).not.toBeVisible();
	await hebrewDefinition.getByText('Englisches Original', { exact: true }).click();
	await expect(hebrewDefinition.locator('[lang="en"]')).toHaveText(/God, gods/);
	await expect(hebrewDefinition.locator('[lang="de"]')).toBeVisible();
	await page.reload();
	await expect(secondTile.locator('.lexicon-definition [lang="de"]')).toHaveText(/Gott, Götter/);
	await expect(secondTile.locator('.lexicon-definition [lang="en"]')).not.toBeVisible();

	await page.goto('/Joh3');
	await firstTile.locator('button.strong[data-strong="G25"]').first().click();
	await expect(secondTile.locator('.resource-tab.active')).toContainText('Strong Griechisch');
	await expect(lexiconLookup(page)).toHaveValue('G25');
	await expect(secondTile.getByRole('tab', { name: /^Strong Hebräisch/ })).toHaveCount(1);
});

test('links inside a lexicon keep and expose their reader context', async ({ page }) => {
	await page.goto('/Joh3');
	await page.locator('button.strong[data-strong="G25"]').first().click();
	const secondTile = page.locator('.reader-tile').nth(1);
	const study = secondTile.getByLabel('Lexikoneintrag in Strong');
	const strongReference = study.getByRole('link', { name: 'G2316' });
	const bibleReference = study.getByRole('link', { name: 'Joh 3:16' });

	await expect(strongReference).toHaveAttribute('href', /\/Joh3\?layout=/);
	await expect(bibleReference).toHaveAttribute('href', /\/Joh3,16\?layout=/);
	await strongReference.click();
	await expect(lexiconLookup(page)).toHaveValue('G2316');
	await expect(secondTile.getByRole('tab', { name: /^Strong Griechisch/ })).toHaveCount(1);

	await lexiconLookup(page).fill('G25');
	await lexiconLookup(page).press('Enter');
	await study.getByRole('link', { name: 'Joh 3:16' }).click();
	await expectReaderPath(page, '/Joh3,16');
	await expect(lexiconLookup(page)).toHaveValue('G25');
	await expect(page.locator('.reader-tile')).toHaveCount(2);
});

test('the same dictionary can stay open in multiple independent tabs', async ({ page }) => {
	await page.goto('/Joh3');
	const firstTile = page.locator('.reader-tile').first();

	await addResourceTab(page, 0, 'STRONGS_GREEK', 'Wörterbuch');
	await lexiconLookup(page, 0).fill('G25');
	await lexiconLookup(page, 0).press('Enter');
	await expect(firstTile.locator('.lexicon-tab .headword strong')).toHaveText('G25');

	await addResourceTab(page, 0, 'STRONGS_GREEK', 'Wörterbuch');
	await lexiconLookup(page, 0).fill('G2316');
	await lexiconLookup(page, 0).press('Enter');
	await expect(firstTile.locator('.lexicon-tab .headword strong')).toHaveText('G2316');

	const dictionaryTabs = firstTile.getByRole('tab', { name: /^Strong Griechisch/ });
	await expect(dictionaryTabs).toHaveCount(2);
	await dictionaryTabs.first().click();
	await expect(lexiconLookup(page, 0)).toHaveValue('G25');
	await dictionaryTabs.nth(1).click();
	await expect(lexiconLookup(page, 0)).toHaveValue('G2316');
});

test('Strong clicks remain inside their own A-E link group', async ({ page }) => {
	await page.goto('/Joh3');
	const firstTile = page.locator('.reader-tile').first();
	const secondTile = page.locator('.reader-tile').nth(1);

	await secondTile.getByRole('button', { name: /wechseln$/ }).click();
	await page
		.locator('form')
		.filter({ has: page.locator('input[name="resource"][value="SEEDDE"]') })
		.getByRole('button')
		.click();
	await selectLinkSet(page, 1, 'B');

	await firstTile.locator('button.strong[data-strong="G25"]').first().click();
	await expect(firstTile.getByLabel('Lexikoneintrag in Strong')).toContainText('G25');

	await secondTile.locator('button.strong[data-strong="G2316"]').first().click();
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('G2316');
	await expect(firstTile.getByLabel('Lexikoneintrag in Strong')).toContainText('G25');
	await expect(firstTile.getByRole('searchbox', { name: /Strong-Nummer oder Wort/ })).toHaveValue(
		'G25'
	);
});

test('hovering a tagged word highlights every occurrence without opening a tab', async ({
	page
}) => {
	// "Gott" (G2316) occurs in both verse 16 and verse 17.
	await page.goto('/Joh3');

	const verse16Word = page.locator('#Joh3_16 button.strong[data-strong="G2316"]').first();
	const verse17Word = page.locator('#Joh3_17 button.strong[data-strong="G2316"]').first();

	await expect(verse16Word).not.toHaveClass(/active/);
	await expect(verse17Word).not.toHaveClass(/active/);

	await verse16Word.hover();
	await expect(verse16Word).toHaveClass(/active/);
	await expect(verse17Word).toHaveClass(/active/);

	// A hover is a pure visual highlight: no lexicon tab and no URL/history change.
	await expect(page.getByRole('tab', { name: /^Strong Griechisch/ })).toHaveCount(0);
	await expectReaderPath(page, '/Joh3');

	// Moving away removes the highlight again.
	await page.getByTestId('layout-picker').hover();
	await expect(verse16Word).not.toHaveClass(/active/);
	await expect(verse17Word).not.toHaveClass(/active/);
});

test('tapping a tagged word on a touch device does not leave a stray hover highlight behind', async ({
	browser
}) => {
	// Touch taps synthesize a pointerenter before the click; if that were mistaken for a real mouse
	// hover, the highlight would never clear because a tap has no matching "leave" event.
	const context = await browser.newContext({ hasTouch: true });
	const page = await context.newPage();
	await page.goto('/Joh3');

	const verse16Word = page.locator('#Joh3_16 button.strong[data-strong="G2316"]').first();
	const verse17Word = page.locator('#Joh3_17 button.strong[data-strong="G2316"]').first();

	await verse16Word.tap();
	await expect(page.getByLabel('Lexikoneintrag in Strong')).toContainText('G2316');
	// A synthetic touch hover must not remain after the lexicon tab has opened.
	await expect(verse16Word).not.toHaveClass(/active/);
	await expect(verse17Word).not.toHaveClass(/active/);

	await context.close();
});

test('a pending reader position update cannot overwrite a search navigation', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/Joh3');

	const column = page.locator('.flow-column').first();
	await column.evaluate((element) => {
		const target = element.querySelector<HTMLElement>('[data-verse-key="43:3:17"]');
		if (!target) throw new Error('fixture verse 17 is missing');
		element.scrollTop = target.offsetTop;
		element.dispatchEvent(new Event('scroll'));
	});
	// Cross-column alignment runs after 150 ms and then leaves a debounced address-bar update queued.
	await page.waitForTimeout(175);

	await tabReference(page).fill('1Mo 1');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/1Mo1');
	await page.waitForTimeout(400);
	// The new reader may add its visible first verse, but stale work from John must never take over.
	await expect(page).toHaveURL(
		(url) => ['/1Mo1', '/1Mo1,1'].includes(url.pathname) && Boolean(url.searchParams.get('layout'))
	);
});

test('clicking a footnote marker opens its note without relying on the Popover API', async ({
	page
}) => {
	await page.goto('/Joh3');

	// Force the same code path devices without Popover API support hit, so a regression here is
	// caught even when the browser under test does support it.
	await page.addInitScript(() => {
		// @ts-expect-error simulating an older WebView for the test
		delete HTMLElement.prototype.showPopover;
	});
	await page.reload();

	const marker = page.locator('button.footnote-marker').first();
	await marker.click();

	const note = page.getByRole('note');
	await expect(note).toBeVisible();
	await expect(note).toContainText('so sehr');

	await marker.click();
	await expect(note).not.toBeVisible();
});

test('the Strong page lists every occurrence', async ({ page }) => {
	await page.goto('/G2316');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('θεός');
	// θεός occurs in both John verses of the fixture.
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Johannes 3,17' })).toBeVisible();
});

test('a padded Strong number redirects to its canonical form', async ({ page }) => {
	await page.goto('/g0025');
	await expect(page).toHaveURL(/\/G25$/);
});

test('an unknown Strong number suggests the other dictionary', async ({ page }) => {
	await page.goto('/H25');
	await expect(page.getByRole('link', { name: /G25/ })).toBeVisible();
});

test('search finds words by their beginning', async ({ page }) => {
	await page.goto('/search?q=Wel');

	await expect(page.getByRole('heading', { level: 1 })).toContainText('Ergebnisse');
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();
	// The matched word is marked.
	await expect(page.locator('mark').first()).toBeVisible();
});

test('search matches inflected forms through the German stemmer', async ({ page }) => {
	// "glaubt" and "glaubst" share a stem, so either finds the other.
	await page.goto('/search?q=glauben');
	await expect(page.getByRole('link', { name: 'Johannes 3,18' })).toBeVisible();
});

test('a participle with a ge- prefix is a known limitation of the stemmer', async ({ page }) => {
	// The snowball stemmer does not strip the participle prefix, so "lieb" does not reach "geliebt".
	// Documented here so the behaviour is a decision rather than a surprise; the help page promises
	// only that word beginnings match.
	await page.goto('/search?q=lieb');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Keine Ergebnisse');

	// The word itself is of course findable.
	await page.goto('/search?q=geliebt');
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();
});

test('a quoted phrase matches the exact sequence', async ({ page }) => {
	// "am Anfang" appears in SEEDPLAIN's Genesis 1:1 but not in SEEDDE, which says "Im Anfang".
	await page.goto('/search?q=%22am+Anfang%22');
	await expect(page.getByRole('link', { name: '1.Mose 1,1' })).toBeVisible();

	// A phrase that exists in neither must not match merely because both words occur.
	await page.goto('/search?q=%22Anfang+Gott%22');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Keine Ergebnisse');
});

test('a word typed into a tab field searches only the current resource', async ({ page }) => {
	await page.goto('/Joh3');
	await tabReference(page).fill('Gott');
	await tabReference(page).press('Enter');

	await expectReaderPath(page, '/Joh3');
	const results = page
		.locator('.reader-tile')
		.first()
		.getByLabel('Suchergebnisse in Testübersetzung');
	await expect(results).toContainText('„Gott“ in Testübersetzung');
	const distribution = results.locator('.book-distribution');
	await expect(distribution).toBeVisible();
	await expect(distribution.locator('.testament-summary')).toContainText([
		'Altes Testament',
		'Neues Testament'
	]);
	const distributionMetrics = await distribution.evaluate((element) => ({
		fits: element.scrollWidth <= element.clientWidth + 1,
		writingMode: getComputedStyle(element.querySelector('.books.compact .name')!).writingMode,
		visibleCounts: element.querySelectorAll('.books.compact .count').length
	}));
	expect(distributionMetrics).toEqual({
		fits: true,
		writingMode: 'vertical-rl',
		visibleCounts: 0
	});
	const resultFontSize = await results
		.locator('.result-text')
		.first()
		.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
	const readerFontSize = await page
		.locator('.flow-verse')
		.first()
		.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
	expect(resultFontSize).toBeCloseTo(readerFontSize, 2);

	await results.locator('.book-distribution button.book').filter({ hasText: '1Mo' }).click();
	await expect(results.getByRole('link', { name: /Johannes/ })).toHaveCount(0);
	await results.getByRole('link', { name: /1\.Mose 1,1/ }).click();
	await expectReaderPath(page, '/1Mo1,1');
	await expect(results).not.toBeVisible();
});

test('tab history returns through the explicit hit, filtered search and final scroll position', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/Joh1');
	const tile = page.locator('.reader-tile').first();
	const back = tile.getByRole('button', { name: 'Im Tab zurück' });
	const forward = tile.getByRole('button', { name: 'Im Tab vor' });
	await expect(back).toBeDisabled();
	await tabReference(page).fill('Gott');
	await tabReference(page).press('Enter');
	const results = tile.getByLabel('Suchergebnisse in Testübersetzung');
	await results.getByRole('button', { name: /^1Mo:/ }).click();
	await results.getByRole('link', { name: /1\.Mose 1,1/ }).click();
	await expectReaderPath(page, '/1Mo1,1');
	const column = tile.locator('.flow-column');
	// Move past the first full text line to the next visible verse anchor.
	await column.evaluate((element) => {
		const target = element.querySelector<HTMLElement>('[data-verse-key="1:1:1"]')!;
		element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		element.scrollTop +=
			target.getBoundingClientRect().bottom - element.getBoundingClientRect().top - 23;
		element.dispatchEvent(new Event('scroll'));
	});
	await expect(tabReference(page)).toHaveValue('1Mo 1,3');
	await back.click();
	await expect(tabReference(page)).toHaveValue('1Mo 1,1');
	await expect(column.locator('[data-verse-key="1:1:1"]')).toHaveClass(/highlighted/);
	await back.click();
	await expect(results).toBeVisible();
	await expect(results.getByRole('button', { name: 'Buchfilter aufheben' })).toBeVisible();
	await expect(results.getByRole('link', { name: /Johannes/ })).toHaveCount(0);
	await forward.click();
	await expect(tabReference(page)).toHaveValue('1Mo 1,1');
	await forward.click();
	await expect(tabReference(page)).toHaveValue('1Mo 1,3');
	await expect(forward).toBeDisabled();
	await back.click();
	await expect(tabReference(page)).toHaveValue('1Mo 1,1');
	await expect(forward).toBeEnabled();
	await tabReference(page).fill('Joh 3,16');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/Joh3,16');
	await expect(forward).toBeDisabled();
});

test('tab history remains with its tab and leaves an independent tile at its own location', async ({
	page
}) => {
	await page.goto('/Joh3');
	await selectLinkSet(page, 1, 'B');
	await tabReference(page).fill('1Mo 1,3');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/1Mo1,3');
	await expect(tabReference(page, 1)).toHaveValue('Joh 3');
	await addResourceTab(page, 0, 'SEEDCOMMENTARY', 'Kommentare');
	const tile = page.locator('.reader-tile').first();
	await expect(tile.getByRole('button', { name: 'Im Tab zurück' })).toBeDisabled();
	await tile.getByRole('tab', { name: 'Testübersetzung A', exact: true }).click();
	await tile.getByRole('button', { name: 'Im Tab zurück' }).click();
	await expect(tabReference(page)).toHaveValue('Joh 3');
	await expect(tabReference(page, 1)).toHaveValue('Joh 3');
	await expect(
		page.locator('.reader-tile').nth(1).getByRole('button', { name: 'Im Tab zurück' })
	).toBeDisabled();
});

test('tab history restores previous dictionary lookups including the initial empty entry', async ({
	page
}) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 1, 'STRONGS_GREEK', 'Wörterbuch');
	const tile = page.locator('.reader-tile').nth(1);
	for (const lookup of ['G25', 'G2316']) {
		await lexiconLookup(page).fill(lookup);
		await lexiconLookup(page).press('Enter');
		await expect(tile.getByLabel(/Lexikoneintrag in/)).toContainText(lookup);
	}
	await tile.getByRole('button', { name: 'Im Tab zurück' }).click();
	await expect(lexiconLookup(page)).toHaveValue('G25');
	await tile.getByRole('button', { name: 'Im Tab zurück' }).click();
	await expect(lexiconLookup(page)).toHaveValue('');
	await tile.getByRole('button', { name: 'Im Tab vor' }).click();
	await expect(lexiconLookup(page)).toHaveValue('G25');
});

test('tab history follows a moved tab even beside another copy of the same resource', async ({
	page
}) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 0, 'SEEDPLAIN');
	await selectLinkSet(page, 0, 'C');
	await tabReference(page).fill('1Mo 1,3');
	await tabReference(page).press('Enter');
	await expectReaderPath(page, '/1Mo1,3');
	await page
		.locator('.reader-tile')
		.first()
		.getByRole('button', { name: 'Tab verschieben' })
		.click();
	await page.getByRole('menuitem', { name: 'Bereich 2' }).click();
	const target = page.locator('.reader-tile').nth(1);
	await expect(target.locator('.resource-tab')).toHaveCount(2);
	await target.getByRole('button', { name: 'Im Tab zurück' }).click();
	await expect(tabReference(page, 1)).toHaveValue('Joh 3');
	await target.getByRole('tab').first().click();
	await expect(target.getByRole('button', { name: 'Im Tab zurück' })).toBeDisabled();
});

test('a book name without a chapter number stays a tab-scoped text search', async ({ page }) => {
	await page.goto('/Joh1');
	await tabReference(page).fill('Judas');
	await tabReference(page).press('Enter');

	await expectReaderPath(page, '/Joh1');
	await expect(page.getByLabel('Suchergebnisse in Testübersetzung')).toContainText(
		'„Judas“ in Testübersetzung'
	);
});

test('a Strong number typed into a tab is restricted to that Bible resource', async ({ page }) => {
	await page.goto('/Joh3');
	await tabReference(page).fill('G25');
	await tabReference(page).press('Enter');

	await expectReaderPath(page, '/Joh3');
	const results = page
		.locator('.reader-tile')
		.first()
		.getByLabel('Suchergebnisse in Testübersetzung');
	await expect(results.getByRole('link', { name: /Johannes 3,16/ })).toBeVisible();
	await expect(results.locator('.strong.active[data-strong="G25"]')).toBeVisible();
	await expect(results.locator('.book-distribution')).toBeVisible();
	await expect(results.getByLabel('Übersetzt als')).toBeVisible();
	await results
		.locator('.strong-result')
		.first()
		.click({ position: { x: 8, y: 8 } });
	await expectReaderPath(page, '/Joh3,16');
});

test('a commentary tab searches inside its own commentary text', async ({ page }) => {
	await useCommentaryColumn(page);
	await page.goto('/Joh3');
	await tabReference(page, 2).fill('bekannteste');
	await tabReference(page, 2).press('Enter');

	await expectReaderPath(page, '/Joh3');
	const results = page.locator('.reader-tile').nth(2).getByLabel('Suchergebnisse in Testkommentar');
	await expect(results.getByRole('link', { name: /Johannes 3,16/ })).toBeVisible();
	await expect(results.getByText(/bekannteste Vers/)).toBeVisible();
});

test('a reference typed into one tab goes to the chapter', async ({ page }) => {
	await page.goto('/Joh1');
	await tabReference(page).fill('1Mo 1,3');
	await tabReference(page).press('Enter');

	await expectReaderPath(page, '/1Mo1,3');
	await expect(page.getByText('Es werde Licht', { exact: false }).first()).toBeVisible();
});

test('the active resource tab persists across navigations', async ({ page }) => {
	await page.goto('/Joh3');

	await addResourceTab(page, 0, 'SEEDPLAIN');
	await expect(page.locator('.reader-tile').first().locator('.resource-tab.active')).toContainText(
		'Schlicht'
	);

	await page.goto('/1Mo1');
	await expect(page.locator('.reader-tile').first().locator('.resource-tab.active')).toContainText(
		'Schlicht'
	);
});

test('opening another resource tab keeps the currently visible chapter', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 300 });
	await page.goto('/1Mo1');

	const column = page.locator('.flow-column').first();
	const nextChapter = column.locator('[data-chapter-key="1:2"]');
	await expect(nextChapter).toBeAttached();
	await column.dispatchEvent('pointerdown');
	await column.evaluate(
		(element, scrollTop) => {
			element.scrollTop = scrollTop;
		},
		await nextChapter.evaluate((element) => (element as HTMLElement).offsetTop)
	);
	await expectReaderPath(page, '/1Mo2,1');

	await addResourceTab(page, 0, 'SEEDPLAIN');

	await expect(page.locator('.reader-tile').first().locator('.resource-tab.active')).toContainText(
		'Schlicht'
	);
	await expectReaderPath(page, '/1Mo2,1');
	await expect(column.locator('[data-chapter-key="1:2"]')).toBeAttached();
});

test('a closed resource tab can be opened again', async ({ page }) => {
	await page.goto('/Joh3');
	const tile = page.locator('.reader-tile').first();
	await addResourceTab(page, 0, 'SEEDPLAIN');
	await expect(tile.locator('.resource-tab')).toHaveCount(2);
	await tile
		.locator('.resource-tab.active')
		.getByRole('button', { name: /schließen/ })
		.click();
	await expect(tile.locator('.resource-tab')).toHaveCount(1);
	await addResourceTab(page, 0, 'SEEDPLAIN');
	await expect(tile.locator('.resource-tab')).toHaveCount(2);

	// The complete tab strip, not merely the active resource, is remembered.
	await page.goto('/1Mo1');
	await expect(page.locator('.reader-tile').first().locator('.resource-tab')).toHaveCount(2);
});

test('on a phone a Strong click switches to the embedded lexicon tile', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto('/Joh3,16');

	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(page.getByLabel('Lexikoneintrag in Strong')).toBeVisible();
	await expect(
		page.getByTestId('mobile-tab-bar').getByRole('tab', { name: 'Strong Griechisch' })
	).toHaveAttribute('aria-selected', 'true');
});

test('mobile exposes one flat resource tab strip without hiding desktop tiles', async ({
	page
}) => {
	// Default (desktop) viewport first: the regression this specifically guards against is
	// `aria-hidden` leaking onto desktop, where every column is visible at once regardless of which
	// one `mobileColumn` happens to name.
	await page.goto('/Joh3');

	const columns = page.locator('.flow-column');
	await expect(columns).toHaveCount(2);
	await expect(columns.first()).not.toHaveAttribute('aria-hidden', 'true');
	await expect(columns.nth(1)).not.toHaveAttribute('aria-hidden', 'true');
	await expect(columns.nth(1)).not.toHaveAttribute('role', 'tabpanel');

	// A second resource in the first desktop tile must become a peer of the other resources on
	// mobile, not a nested tab below a separate tile selector. Restore the first tab as active so
	// the flattened strip has a deterministic initial selection.
	await addResourceTab(page, 0, 'SEEDPLAIN');
	await page
		.locator('.reader-tile')
		.first()
		.getByRole('tab', { name: /^Testübersetzung/ })
		.click();
	await expect(page.locator('.reader-tile').first().locator('.resource-tab.active')).toContainText(
		'Testübersetzung'
	);

	// Now at phone width, where all three resources share a single tablist even though the persisted
	// desktop workspace still consists of two tiles.
	await page.setViewportSize({ width: 390, height: 780 });
	await page.reload();

	const tabs = page.getByRole('tablist', { name: 'Reader-Ressourcen' }).getByRole('tab');
	await expect(tabs).toHaveCount(3);
	await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
	await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'false');
	await expect(tabs.first()).toHaveAttribute('tabindex', '0');
	await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');

	const mobileTiles = page.locator('.reader-tile');
	await expect(mobileTiles.first()).toHaveAttribute('role', 'tabpanel');
	await expect(mobileTiles.nth(1)).toHaveAttribute('aria-hidden', 'true');
	await expect(page.getByRole('banner').getByRole('img', { name: 'Akribos' })).toBeVisible();
	const [readerBounds, tabBarBounds, headerBounds, viewportBounds] = await Promise.all([
		mobileTiles.first().boundingBox(),
		page.getByTestId('mobile-tab-bar').boundingBox(),
		page.getByRole('banner').boundingBox(),
		page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }))
	]);
	expect(readerBounds).not.toBeNull();
	expect(tabBarBounds).not.toBeNull();
	expect(headerBounds).not.toBeNull();
	expect(Math.abs(tabBarBounds!.y - (headerBounds!.y + headerBounds!.height))).toBeLessThanOrEqual(
		1
	);
	expect(Math.abs(readerBounds!.x)).toBeLessThanOrEqual(1);
	expect(
		Math.abs(readerBounds!.x + readerBounds!.width - viewportBounds.width)
	).toBeLessThanOrEqual(1);
	expect(
		Math.abs(readerBounds!.y + readerBounds!.height - viewportBounds.height)
	).toBeLessThanOrEqual(1);

	// ArrowRight first activates the other resource in the same underlying tile; the panel therefore
	// stays put. Read the focused id back from the same round trip that dispatches the key, rather
	// than polling for it afterwards: this
	// sandbox's headless browser can drop DOM focus asynchronously some time after a programmatic
	// `.focus()` call for reasons unrelated to the app (the handler itself sets it synchronously,
	// every time), and a later, separate assertion would be at the mercy of that.
	await tabs.first().focus();
	const secondTabId = await tabs.nth(1).getAttribute('id');
	const focusedIdAfterArrowRight = await page.evaluate(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
		);
		return document.activeElement?.id;
	});
	expect(focusedIdAfterArrowRight).toBe(secondTabId);
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
	await expect(mobileTiles.first()).not.toHaveAttribute('aria-hidden', 'true');
	await expect(mobileTiles.nth(1)).toHaveAttribute('aria-hidden', 'true');

	// The next peer tab belongs to the other desktop tile and switches the only visible panel.
	await tabs.nth(1).focus();
	const thirdTabId = await tabs.nth(2).getAttribute('id');
	const focusedIdAfterSecondArrowRight = await page.evaluate(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
		);
		return document.activeElement?.id;
	});
	expect(focusedIdAfterSecondArrowRight).toBe(thirdTabId);
	await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
	await expect(mobileTiles.first()).toHaveAttribute('aria-hidden', 'true');
	await expect(mobileTiles.nth(1)).not.toHaveAttribute('aria-hidden', 'true');

	// Reducing the layout while its last tile is selected must clamp the mobile selection instead of
	// leaving the only remaining tile hidden behind an out-of-range index. All resource tabs survive
	// the merge and remain in the same flat strip.
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /^Eine Kachel/ }).click();
	await expect(tabs).toHaveCount(3);
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
	await expect(mobileTiles).toHaveCount(1);
	await expect(mobileTiles.first()).not.toHaveAttribute('aria-hidden', 'true');
});

test('legacy URLs from the previous site still resolve', async ({ page }) => {
	await page.goto('/async/Joh3');
	await expectReaderPath(page, '/Joh3');

	await page.goto('/Joh3/trans/0_2');
	await expectReaderPath(page, '/Joh3');
});

test('a reference percent-encoded as Latin-1 does not crash the page', async ({ page }) => {
	// "1K%F6n16" is "1Kön16" (1.Könige 16) with "ö" mis-encoded as Latin-1 (0xF6) instead of UTF-8
	// (%C3%B6) — something old browsers and stale bookmarks still produce.
	const response = await page.goto('/1K%F6n16');
	expect(response?.status()).toBeLessThan(400);
	await expect(tabReference(page)).toHaveValue(/Kön/);
});

test('the Akribos logo returns to the remembered reader location', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/Joh3');
	await expectReaderPath(page, '/Joh3');
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await page.getByRole('menuitem', { name: 'Mein Konto' }).click();
	await expect(page).toHaveURL(/\/account$/);

	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();

	await expectReaderPath(page, '/Joh3');
});

test('the logo restores an exact verse even when leaving during the scroll debounce', async ({
	page
}) => {
	await loginAsAdmin(page);
	await page.setViewportSize({ width: 900, height: 300 });
	// Freeze chapter streams without blocking the independent workspace persistence endpoint.
	await page.route(/\/api\/reader\/\d+\/\d+(?:\?|$)/, (route) => route.abort());
	await page.goto('/Joh3');
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	const notesLink = page.getByRole('menuitem', { name: 'Notizen & Ausarbeitungen', exact: true });
	await expect(notesLink).toBeVisible();
	// Scroll and leave in the same JavaScript task: no URL debounce can run between these events.
	await page
		.locator('.flow-column')
		.first()
		.evaluate((element) => {
			const verse = element.querySelector<HTMLElement>('[data-verse-key="43:3:16"]');
			if (!verse) throw new Error('missing fixture verse');
			const distance =
				verse.getBoundingClientRect().bottom - element.getBoundingClientRect().top - 22;
			element.dispatchEvent(
				new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: distance / 0.55 })
			);
			element.dispatchEvent(new Event('scroll'));
			const link = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
				(item) => item.textContent?.trim() === 'Notizen & Ausarbeitungen'
			);
			if (!link) throw new Error('missing notes navigation');
			link.click();
		});
	await expect(page).toHaveURL('/notes');
	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
	await expectReaderPath(page, '/Joh3,17');
	await expect(tabReference(page)).toHaveValue('Joh 3,17');
});

test('the logo preserves a verse from a direct reader link', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/Joh3,16');
	await page.goto('/notes');
	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();
	await expectReaderPath(page, '/Joh3,16');
});

test('the standalone Hebrew entry defaults to German and exposes its English original on desktop and mobile', async ({
	page
}) => {
	await page.goto('/H430');
	const desktop = page.locator('aside .lexicon-definition');
	await expect(desktop.locator('[lang="de"]')).toHaveText(/Gott, Götter/);
	await expect(desktop.locator('[lang="en"]')).not.toBeVisible();
	await desktop.getByText('Englisches Original', { exact: true }).click();
	await expect(desktop.locator('[lang="en"]')).toHaveText(/God, gods/);
	await page.setViewportSize({ width: 375, height: 812 });
	await page.getByText('Bedeutung und Herkunft', { exact: true }).click();
	const mobile = page.locator('details .lexicon-definition').first();
	await expect(mobile.locator('[lang="de"]')).toHaveText(/Gott, Götter/);
	await mobile.getByText('Englisches Original', { exact: true }).click();
	await expect(mobile.locator('[lang="en"]')).toHaveText(/God, gods/);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
