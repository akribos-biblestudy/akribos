import { expect, test, type Page } from '@playwright/test';

/**
 * Reader, search and study sidebar.
 *
 * Runs against the fixture from `pnpm db:seed`: SEEDDE (with Strong's numbers), SEEDPLAIN and
 * SEEDCOMMENTARY, plus three dictionary entries.
 */

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
		.locator('form[action="?/addTab"]')
		.filter({ has: page.locator(`input[name="resource"][value="${resourceId}"]`) })
		.getByRole('button')
		.click();
	await expect(tile.locator('.resource-tab')).toHaveCount(tabsBefore + 1);
	await expect(tile.locator(`.flow-column[data-resource-id="${resourceId}"]`)).toBeVisible();
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
	await tile.getByRole('button', { name: /Link-Set für/ }).click();
	await page
		.getByRole('menu', { name: 'Link-Set wählen' })
		.getByRole('menuitemradio', { name: linkSet, exact: true })
		.click();
}

async function loginAsAdmin(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden' }).click();
}

test('the root shows the reader to signed-out visitors', async ({ page }) => {
	const response = await page.goto('/');

	expect(response?.status()).toBe(200);
	await expect(page).toHaveURL(/\/Joh1$/);
	await expect(tabReference(page)).toHaveValue('Joh 1');
});

test('the root resumes the reader for a signed-in user', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/Joh3');
	await page.goto('/');

	await expect(page).toHaveURL(/\/Joh3$/);
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
			name: 'Geöffnetes Versmenü im Akribos-Reader mit Markierungen, Kommentaren und Verslisten'
		})
	).toHaveAttribute('src', '/landing/verse-menu.webp');
});

test('each tab opens a keyboard-accessible book and chapter chooser', async ({ page }) => {
	await page.goto('/Joh3');
	await page
		.locator('.reader-tile')
		.first()
		.getByRole('button', { name: 'Buch und Kapitel wählen' })
		.click();

	const chooser = page.getByRole('dialog', { name: 'Buch und Kapitel wählen' });
	await expect(chooser).toBeVisible();
	const chooserBox = (await chooser.boundingBox())!;
	const viewport = await page.evaluate(() => ({
		width: document.documentElement.clientWidth,
		height: document.documentElement.clientHeight
	}));
	expect(chooserBox.x + chooserBox.width / 2).toBeCloseTo(viewport.width / 2, 0);
	expect(chooserBox.y + chooserBox.height / 2).toBeCloseTo(viewport.height / 2, 0);
	await chooser.getByRole('button', { name: '← Bücher' }).click();
	const genesis = chooser.getByRole('button', { name: /1\.Mose/ });
	await expect(genesis).toBeVisible();

	await genesis.focus();
	await expect(genesis).toBeFocused();
	await page.keyboard.press('Enter');

	// Choosing the book only opens the second step; it must not load a chapter yet.
	await expect(page).toHaveURL(/\/Joh3$/);
	await expect(chooser.getByText('1.Mose', { exact: true })).toBeVisible();
	const chapterTwo = chooser.getByRole('button', { name: '2', exact: true });
	await expect(chapterTwo).toBeVisible();

	await chapterTwo.focus();
	await expect(chapterTwo).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/1Mo2$/);
	await expect(chooser).toBeHidden();
	await expect(page.getByText('Und so wurden Himmel und Erde vollendet')).toBeVisible();
});

test('choosing a chapter resets a previously scrolled reader to its first verse', async ({
	page
}) => {
	await page.goto('/Joh3');
	const column = page.locator('.flow-column').first();
	await expect(column.locator('[data-chapter-key="43:4"]')).toBeAttached();

	await column.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect.poll(() => column.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

	await page
		.locator('.reader-tile')
		.first()
		.getByRole('button', { name: 'Buch und Kapitel wählen' })
		.click();
	const chooser = page.getByRole('dialog', { name: 'Buch und Kapitel wählen' });
	await chooser.getByRole('button', { name: '← Bücher' }).click();
	await chooser.getByRole('button', { name: /1\.Mose/ }).click();
	await chooser.getByRole('button', { name: '2', exact: true }).click();

	await expect(page).toHaveURL(/\/1Mo2$/);
	await expect
		.poll(() =>
			column.evaluate((element) => {
				const top = element.getBoundingClientRect().top + 24;
				return [...element.querySelectorAll<HTMLElement>('[data-verse-key]')].find(
					(verse) => verse.getBoundingClientRect().bottom > top
				)?.dataset.verseKey;
			})
		)
		.toBe('1:2:1');
});

test('tabs keep independent references and restore them when activated', async ({ page }) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 0, 'SEEDPLAIN');
	await selectLinkSet(page, 0, 'B');

	await tabReference(page).fill('1Mo 2');
	await tabReference(page).press('Enter');
	await expect(page).toHaveURL(/\/1Mo2$/);
	await expect(tabReference(page)).toHaveValue('1Mo 2');

	const firstTile = page.locator('.reader-tile').first();
	await firstTile.getByRole('tab', { name: /^Testübersetzung/ }).click();
	await expect(page).toHaveURL(/\/Joh3$/);
	await expect(tabReference(page)).toHaveValue('Joh 3');
	await expect(
		page.getByText('Denn also hat Gott die Welt geliebt', { exact: false })
	).toBeVisible();

	await firstTile.getByRole('tab', { name: /^Schlicht/ }).click();
	await expect(page).toHaveURL(/\/1Mo2$/);
	await expect(tabReference(page)).toHaveValue('1Mo 2');
});

test('linked inactive tabs receive the current reference before they are activated', async ({
	page
}) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 1, 'SEEDCOMMENTARY', 'Kommentare');

	const leftColumn = page.locator('.flow-column').first();
	await leftColumn.evaluate((element) => {
		const target = element.querySelector<HTMLElement>('[data-verse-key="43:3:17"]');
		if (!target) throw new Error('fixture verse 17 is missing');
		element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		element.scrollTop = target.offsetTop;
		element.dispatchEvent(new Event('scroll'));
	});

	// Activate before the debounced persistence runs. The activation form carries the live reference,
	// so even this fast switch cannot restore the inactive tab's old position into the link set.
	const secondTile = page.locator('.reader-tile').nth(1);
	await secondTile.getByRole('tab', { name: /^Schlicht/ }).click();
	await expect(page).toHaveURL(/\/Joh3,17$/);
	await expect(tabReference(page)).toHaveValue('Joh 3,17');
	await expect(tabReference(page, 1)).toHaveValue('Joh 3,17');
});

test('the book icon replaces the work in the current tab without changing its reference', async ({
	page
}) => {
	await page.goto('/Joh3');
	const firstTile = page.locator('.reader-tile').first();
	await firstTile.getByRole('button', { name: /wechseln$/ }).click();

	const replacement = page
		.locator('form[action="?/replaceTabResource"]')
		.filter({ has: page.locator('input[name="resource"][value="SEEDPLAIN"]') });
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

test('a tab keeps its A-E link set when it moves between tiles', async ({ page }) => {
	await page.goto('/Joh3');
	await addResourceTab(page, 0, 'SEEDPLAIN');
	const firstTile = page.locator('.reader-tile').first();
	await selectLinkSet(page, 0, 'C');
	await expect(firstTile.locator('.resource-tab.active .tab-link-set')).toHaveText('C');
	await expect(firstTile.getByRole('button', { name: /Link-Set für.*C/ })).toHaveCSS(
		'background-color',
		'rgb(22, 163, 74)'
	);

	await firstTile.getByRole('button', { name: 'Tab verschieben' }).click();
	await page.getByRole('menuitem', { name: 'Bereich 2' }).click();
	const secondTile = page.locator('.reader-tile').nth(1);
	await expect(secondTile.locator('.resource-tab')).toHaveCount(2);
	await expect(secondTile.locator('.resource-tab.active .tab-link-set')).toHaveText('C');
	await expect(secondTile.getByRole('button', { name: /Link-Set für.*C/ })).toBeVisible();

	await page.reload();
	await expect(
		page
			.locator('.reader-tile')
			.nth(1)
			.getByRole('button', { name: /Link-Set für.*C/ })
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
	await expect(page).toHaveURL(/\/1Mo2$/);

	await tabReference(page).fill('1Mo 1');
	await tabReference(page).press('Enter');
	await expect(page).toHaveURL(/\/1Mo1$/);
});

test('clicking a tagged word opens the study sidebar', async ({ page }) => {
	// Open the whole chapter: the clicked verse, rather than only the route, must determine which
	// original-language form and morphology the sidebar loads.
	await page.goto('/Joh3');

	// "geliebt" carries G25.
	await page.locator('button.strong[data-strong="G25"]').first().click();

	const sidebar = page.getByRole('complementary');
	await expect(sidebar).toContainText('G25');
	// The dictionary entry, lemma and exact clicked reference are loaded.
	await expect(sidebar).toContainText('ἀγαπάω');
	await expect(sidebar).toContainText('to love');
	await expect(sidebar).toContainText('Joh 3,16');
	// The rendering statistics: this translation uses "geliebt" for G25.
	await expect(sidebar).toContainText('geliebt');

	// The sidebar is deep-linkable.
	await expect(page).toHaveURL(/#G25\/geliebt\/16$/);
});

test('a Strong click opens and then reuses the lexicon tab in its link group', async ({ page }) => {
	await page.goto('/Joh3');
	const secondTile = page.locator('.reader-tile').nth(1);

	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(secondTile.getByRole('tab', { name: /^Strong Griechisch/ })).toBeVisible();
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('ἀγαπάω');
	await expect(lexiconLookup(page)).toHaveValue('G25');

	await page.locator('button.strong[data-strong="G2316"]').first().click();
	await expect(secondTile.getByRole('tab', { name: /^Strong Griechisch/ })).toHaveCount(1);
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('θεός');
	await expect(lexiconLookup(page)).toHaveValue('G2316');

	await lexiconLookup(page).fill('kósmos');
	await lexiconLookup(page).press('Enter');
	await expect(secondTile.getByLabel('Lexikoneintrag in Strong')).toContainText('G2889');
});

test('hovering a tagged word highlights every occurrence without opening the sidebar', async ({
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

	// A hover is a pure visual highlight: no sidebar, no URL/history change.
	await expect(page.getByRole('complementary')).not.toBeVisible();
	await expect(page).toHaveURL(/\/Joh3$/);

	// Moving away removes the highlight again.
	await page.getByTestId('layout-picker').hover();
	await expect(verse16Word).not.toHaveClass(/active/);
	await expect(verse17Word).not.toHaveClass(/active/);
});

test('a hover highlight and a click highlight on the same word coexist without cancelling', async ({
	page
}) => {
	await page.goto('/Joh3');

	const verse16Word = page.locator('#Joh3_16 button.strong[data-strong="G2316"]').first();
	const verse17Word = page.locator('#Joh3_17 button.strong[data-strong="G2316"]').first();

	await verse16Word.click();
	await expect(page.getByRole('complementary')).toContainText('G2316');
	await expect(verse17Word).toHaveClass(/active/);

	// Hovering the already-clicked word, and leaving it again, must not clear the click highlight.
	await verse16Word.hover();
	await expect(verse17Word).toHaveClass(/active/);

	await page.getByTestId('layout-picker').hover();
	await expect(verse16Word).toHaveClass(/active/);
	await expect(verse17Word).toHaveClass(/active/);
	await expect(page.getByRole('complementary')).toContainText('G2316');
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
	await expect(page.getByRole('complementary')).toContainText('G2316');
	await expect(verse17Word).toHaveClass(/active/);

	await page.getByRole('complementary').getByRole('button', { name: 'Schließen' }).click();
	await expect(page.getByRole('complementary')).not.toBeVisible();
	// A stray hover highlight from the tap would keep this active even after the click highlight
	// is gone.
	await expect(verse16Word).not.toHaveClass(/active/);
	await expect(verse17Word).not.toHaveClass(/active/);

	await context.close();
});

test('browser back restores a previously opened study sidebar', async ({ page }) => {
	await page.goto('/Joh3');
	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(page.getByRole('complementary')).toContainText('G25');

	await tabReference(page).fill('1Mo 1');
	await tabReference(page).press('Enter');
	await expect(page).toHaveURL(/\/1Mo1$/);

	await page.goBack();
	await expect(page).toHaveURL(/\/Joh3#G25\/geliebt\/16$/);
	await expect(page.getByRole('complementary')).toBeVisible();
	await expect(page.getByRole('complementary')).toContainText('G25');
});

test('browser history tracks every Strong click and explicit sidebar close', async ({ page }) => {
	await page.goto('/Joh1');
	await tabReference(page).fill('Joh3');
	await tabReference(page).press('Enter');
	await expect(page).toHaveURL(/\/Joh3$/);

	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(page).toHaveURL(/#G25\/geliebt\/16$/);
	await expect(page.getByRole('complementary')).toContainText('G25');

	await page.locator('button.strong[data-strong="G2316"]').first().click();
	await expect(page).toHaveURL(/#G2316\/Gott\/16$/);
	await expect(page.getByRole('complementary')).toContainText('G2316');

	await page.getByRole('complementary').getByRole('button', { name: 'Schließen' }).click();
	await expect(page).toHaveURL(/\/Joh3$/);
	await expect(page.getByRole('complementary')).not.toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/#G2316\/Gott\/16$/);
	await expect(page.getByRole('complementary')).toContainText('G2316');

	await page.goBack();
	await expect(page).toHaveURL(/#G25\/geliebt\/16$/);
	await expect(page.getByRole('complementary')).toContainText('G25');

	await page.goBack();
	await expect(page).toHaveURL(/\/Joh3$/);
	await expect(page.getByRole('complementary')).not.toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/Joh1$/);
	await expect(tabReference(page)).toHaveValue('Joh 1');
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
	await expect(page).toHaveURL(/\/1Mo1$/);
	await page.waitForTimeout(400);
	// The new reader may add its visible first verse, but stale work from John must never take over.
	await expect(page).toHaveURL(/\/1Mo1(?:,1)?$/);
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
	await page.goto('/Joh1');
	await tabReference(page).fill('Gott');
	await tabReference(page).press('Enter');

	await expect(page).toHaveURL(/\/Joh1$/);
	const results = page
		.locator('.reader-tile')
		.first()
		.getByLabel('Suchergebnisse in Testübersetzung');
	await expect(results).toContainText('„Gott“ in Testübersetzung');
	await expect(results.locator('.book-distribution')).toBeVisible();
	const resultFontSize = await results
		.locator('.result-text')
		.first()
		.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
	expect(resultFontSize).toBeCloseTo(17.28, 1);

	await results.locator('.book-distribution button.book').filter({ hasText: '1Mo' }).click();
	await expect(results.getByRole('button', { name: /Johannes/ })).toHaveCount(0);
	await results.getByRole('button', { name: /1\.Mose 1,1/ }).click();
	await expect(page).toHaveURL(/\/1Mo1,1$/);
	await expect(results).not.toBeVisible();
});

test('a Strong number typed into a tab is restricted to that Bible resource', async ({ page }) => {
	await page.goto('/Joh3');
	await tabReference(page).fill('G25');
	await tabReference(page).press('Enter');

	await expect(page).toHaveURL(/\/Joh3$/);
	const results = page
		.locator('.reader-tile')
		.first()
		.getByLabel('Suchergebnisse in Testübersetzung');
	await expect(results.getByRole('button', { name: 'Johannes 3,16', exact: true })).toBeVisible();
	await expect(results.locator('.strong.active[data-strong="G25"]')).toBeVisible();
	await expect(results.locator('.book-distribution')).toBeVisible();
	await expect(results.getByLabel('Übersetzt als')).toBeVisible();
});

test('a commentary tab searches inside its own commentary text', async ({ page }) => {
	await useCommentaryColumn(page);
	await page.goto('/Joh3');
	await tabReference(page, 2).fill('bekannteste');
	await tabReference(page, 2).press('Enter');

	await expect(page).toHaveURL(/\/Joh3$/);
	const results = page.locator('.reader-tile').nth(2).getByLabel('Suchergebnisse in Testkommentar');
	await expect(results.getByRole('button', { name: 'Johannes 3,16', exact: true })).toBeVisible();
	await expect(results.getByText(/bekannteste Vers/)).toBeVisible();
});

test('a reference typed into one tab goes to the chapter', async ({ page }) => {
	await page.goto('/Joh1');
	await tabReference(page).fill('1Mo 1,3');
	await tabReference(page).press('Enter');

	await expect(page).toHaveURL(/\/1Mo1,3$/);
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
	await expect(page).toHaveURL(/\/1Mo2,1$/);

	await addResourceTab(page, 0, 'SEEDPLAIN');

	await expect(page.locator('.reader-tile').first().locator('.resource-tab.active')).toContainText(
		'Schlicht'
	);
	await expect(page).toHaveURL(/\/1Mo2,1$/);
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

test('the study panel and resource tabs stay in view while scrolling', async ({ page }) => {
	await page.goto('/Joh3,16');
	await page.locator('button.strong[data-strong="G25"]').first().click();

	const sidebar = page.getByRole('complementary');
	const header = page.locator('.reader-tile').first().getByTestId('resource-tabs');
	await expect(sidebar).toBeVisible();

	await page.mouse.wheel(0, 4000);
	// Both are fixed/pinned to the viewport; before the fix both scrolled away, because the
	// reader's <main> was a scroll container and nothing could stick to the viewport inside it.
	await expect(sidebar).toBeInViewport();
	await expect(header).toBeInViewport();
});

test('opening the study sidebar does not resize the reading columns', async ({ page }) => {
	await page.goto('/Joh3');

	const column = page.locator('.flow-column[data-flow-column-index="0"]');
	const before = (await column.boundingBox())!;

	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(page.getByRole('complementary')).toBeVisible();

	const after = (await column.boundingBox())!;
	expect(after.width).toBeCloseTo(before.width, 0);
});

test('escape closes the study sidebar', async ({ page }) => {
	await page.goto('/Joh3');

	await page.locator('button.strong[data-strong="G25"]').first().click();
	const sidebar = page.getByRole('complementary');
	await expect(sidebar).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(sidebar).not.toBeVisible();
});

test('clicking outside the study sidebar closes it', async ({ page }) => {
	await page.goto('/Joh3');

	await page.locator('button.strong[data-strong="G25"]').first().click();
	const sidebar = page.getByRole('complementary');
	await expect(sidebar).toBeVisible();

	await page.locator('main').click({ position: { x: 2, y: 2 } });
	await expect(sidebar).not.toBeVisible();
});

test('clicking another word switches the sidebar instead of closing it', async ({ page }) => {
	await page.goto('/Joh3');

	await page.locator('button.strong[data-strong="G25"]').first().click();
	const sidebar = page.getByRole('complementary');
	await expect(sidebar).toContainText('G25');

	// "Gott" nearby carries G2316.
	await page.locator('button.strong[data-strong="G2316"]').first().click();
	await expect(sidebar).toBeVisible();
	await expect(sidebar).toContainText('G2316');
});

test('on a phone the study panel is a sheet that leaves the verse visible', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 780 });
	await page.goto('/Joh3,16');

	const verse = page.locator('#Joh3_16');
	await page.locator('button.strong[data-strong="G25"]').first().click();

	const sheet = page.getByRole('complementary');
	await expect(sheet).toBeVisible();

	// A sheet over the lower part of the screen, not a full-width sibling that squeezes the text to
	// nothing — which is what a `w-full` flex item did before.
	const sheetBox = (await sheet.boundingBox())!;
	const verseBox = (await verse.boundingBox())!;
	expect(sheetBox.height).toBeLessThan(780 * 0.75);
	expect(verseBox.width).toBeGreaterThan(200);
	expect(verseBox.y).toBeLessThan(sheetBox.y);
});

test('the mobile tile switcher exposes real tab semantics without hiding desktop tiles', async ({
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

	// Now at phone width, where the switcher actually appears and the same mechanism legitimately
	// hides the non-selected column from assistive tech.
	await page.setViewportSize({ width: 390, height: 780 });
	await page.reload();

	const tabs = page.getByRole('tablist', { name: 'Reader-Bereiche' }).getByRole('tab');
	await expect(tabs).toHaveCount(2);
	await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
	await expect(tabs.first()).toHaveAttribute('tabindex', '0');
	await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');

	const mobileTiles = page.locator('.reader-tile');
	await expect(mobileTiles.first()).toHaveAttribute('role', 'tabpanel');
	await expect(mobileTiles.nth(1)).toHaveAttribute('aria-hidden', 'true');

	// ArrowRight moves focus to the next tab and switches to it in the same step (automatic
	// activation), matching the existing click-to-switch behaviour. Read the focused id back from
	// the same round trip that dispatches the key, rather than polling for it afterwards: this
	// sandbox's headless browser can drop DOM focus asynchronously some time after a programmatic
	// `.focus()` call for reasons unrelated to the app (the handler itself sets it synchronously,
	// every time), and a later, separate assertion would be at the mercy of that.
	await tabs.first().focus();
	const focusedIdAfterArrowRight = await page.evaluate(() => {
		document.activeElement?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
		);
		return document.activeElement?.id;
	});
	expect(focusedIdAfterArrowRight).toBe('mobile-tab-1');
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
	await expect(mobileTiles.first()).toHaveAttribute('aria-hidden', 'true');
	await expect(mobileTiles.nth(1)).not.toHaveAttribute('aria-hidden', 'true');

	// Reducing the layout while its last tile is selected must clamp the mobile selection instead of
	// leaving the only remaining tile hidden behind an out-of-range index.
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /^Eine Kachel/ }).click();
	await expect(tabs).toHaveCount(1);
	await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
	await expect(mobileTiles).toHaveCount(1);
	await expect(mobileTiles.first()).not.toHaveAttribute('aria-hidden', 'true');
});

test('legacy URLs from the previous site still resolve', async ({ page }) => {
	await page.goto('/async/Joh3');
	await expect(page).toHaveURL(/\/Joh3$/);

	await page.goto('/Joh3/trans/0_2');
	await expect(page).toHaveURL(/\/Joh3$/);
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
	await expect(page).toHaveURL(/\/Joh3$/);
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await page.getByRole('menuitem', { name: 'Mein Konto' }).click();
	await expect(page).toHaveURL(/\/account$/);

	await page.getByRole('link', { name: 'Akribos – Startseite' }).click();

	await expect(page).toHaveURL(/\/Joh3$/);
});
