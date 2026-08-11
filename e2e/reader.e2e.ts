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

async function loginAsAdmin(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden' }).click();
}

test('the root shows the landing page to signed-out visitors', async ({ page }) => {
	const response = await page.goto('/');

	expect(response?.status()).toBe(200);
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lies den Text');
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

test('chapter navigation and theme controls stay borderless at medium widths', async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.goto('/Gen2');

	const controls = [
		page.getByRole('link', { name: 'Vorheriges Kapitel' }),
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
	await page.goto('/');

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

test('the search field opens a keyboard-accessible Bible book chooser', async ({ page }) => {
	await page.goto('/Joh1');
	await page.locator('#site-search').click();

	const chooser = page.getByRole('dialog', { name: 'Bibelstelle wählen' });
	await expect(chooser).toBeVisible();
	await expect(chooser.getByRole('link', { name: /Matthäus/ })).toBeVisible();

	await chooser.getByRole('link', { name: /Matthäus/ }).focus();
	await expect(chooser.getByRole('link', { name: /Matthäus/ })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/Mt1$/);
});

test('a reference shows the chapter in parallel columns', async ({ page }) => {
	await page.goto('/Joh3,16');

	await expect(page.getByRole('heading', { level: 1 })).toContainText('Johannes');

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
	const bar = page.getByTestId('column-picker-bar').first();
	const reader = page.getByTestId('flow-reader');
	const handle = reader.getByRole('separator');
	await expect(handle).toHaveCount(1);

	// The header's surrounding surface has equal padding on both sides, but its inner grid must still
	// align exactly with the reading cards below it.
	const headerBoxes = await bar.locator('[role="group"]').evaluateAll((nodes) =>
		nodes.map((node) => {
			const box = node.getBoundingClientRect();
			return { x: box.x, width: box.width };
		})
	);
	const columnBoxes = await reader.locator('.flow-column').evaluateAll((nodes) =>
		nodes.map((node) => {
			const box = node.getBoundingClientRect();
			return { x: box.x, width: box.width };
		})
	);
	for (const [index, headerBox] of headerBoxes.entries()) {
		expect(Math.abs(headerBox.x - columnBoxes[index]!.x)).toBeLessThan(1);
		expect(Math.abs(headerBox.width - columnBoxes[index]!.width)).toBeLessThan(1);
	}

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
	const columnHeaders = bar.locator('[role="group"]');
	const [firstWidth, secondWidth] = await columnHeaders.evaluateAll((nodes) =>
		nodes.map((node) => node.getBoundingClientRect().width)
	);
	expect(firstWidth).toBeGreaterThan(secondWidth * 1.3);

	// The resize commits to a cookie once the drag ends.
	await expect.poll(() => page.evaluate(() => document.cookie)).toContain('column-widths=');

	// The split survives a reload.
	await page.reload();
	const [firstAfterReload, secondAfterReload] = await columnHeaders.evaluateAll((nodes) =>
		nodes.map((node) => node.getBoundingClientRect().width)
	);
	expect(firstAfterReload).toBeGreaterThan(secondAfterReload * 1.3);
});

test('flowing text keeps columns scroll-synchronized', async ({ page }) => {
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
	await columns.first().evaluate((element) => {
		const verse = element.querySelector<HTMLElement>('[data-verse-key="43:3:17"]');
		element.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
		element.scrollTop = verse?.offsetTop ?? element.scrollHeight;
		element.dispatchEvent(new Event('scroll'));
	});

	await expect
		.poll(() => columns.nth(1).evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);

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
		const fade = document.querySelector<HTMLElement>('.flow-fade-grid .flow-edge-fade.top')!;
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
	await expect(page.getByPlaceholder('Bibelstelle, Wort oder Strong-Nummer')).toHaveValue(
		'Joh 3,17'
	);
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

test('chapter navigation moves forwards and backwards', async ({ page }) => {
	await page.goto('/1Mo1');

	await page.getByRole('link', { name: /Nächstes Kapitel/ }).click();
	await expect(page).toHaveURL(/\/1Mo2$/);

	await page.getByRole('link', { name: /Vorheriges Kapitel/ }).click();
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

test('browser back restores a previously opened study sidebar', async ({ page }) => {
	await page.goto('/Joh3');
	await page.locator('button.strong[data-strong="G25"]').first().click();
	await expect(page.getByRole('complementary')).toContainText('G25');

	await page.getByRole('searchbox').fill('1Mo 1');
	await page.getByRole('searchbox').press('Enter');
	await expect(page).toHaveURL(/\/1Mo1$/);

	await page.goBack();
	await expect(page).toHaveURL(/\/Joh3#G25\/geliebt\/16$/);
	await expect(page.getByRole('complementary')).toBeVisible();
	await expect(page.getByRole('complementary')).toContainText('G25');
});

test('browser history tracks every Strong click and explicit sidebar close', async ({ page }) => {
	await page.goto('/');
	await page.locator('a.nav-cta').click();
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
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lies den Text');
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

	await page.getByRole('searchbox').fill('1Mo 1');
	await page.getByRole('searchbox').press('Enter');
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

test('a word typed into the search box that is not a reference goes to search', async ({
	page
}) => {
	await page.goto('/Joh1');
	await page.getByRole('searchbox').fill('Licht');
	await page.getByRole('searchbox').press('Enter');

	await expect(page).toHaveURL(/\/search\?q=Licht$/);
});

test('a reference typed into the search box goes to the chapter', async ({ page }) => {
	await page.goto('/Joh1');
	await page.getByRole('searchbox').fill('1Mo 1,3');
	await page.getByRole('searchbox').press('Enter');

	await expect(page).toHaveURL(/\/1Mo1,3$/);
	await expect(page.getByText('Es werde Licht', { exact: false }).first()).toBeVisible();
});

test('the column selection persists across navigations', async ({ page }) => {
	await page.goto('/Joh3');

	// Put the second translation in the first column. The fixture now spans more than one resource
	// kind (bibles and a commentary), so the dialog groups them under a "Bibeln" category.
	await page.locator('#column-0').click();
	await page.getByRole('button', { name: 'Bibeln' }).click();
	await page
		.locator('form[action="?/setColumn"]')
		.filter({ has: page.locator('input[name="resource"][value="SEEDPLAIN"]') })
		.getByRole('button')
		.click();
	await expect(page.locator('#column-0')).toContainText('Schlicht');

	await page.goto('/1Mo1');
	await expect(page.locator('#column-0')).toContainText('Schlicht');
});

test('switching a translation keeps the currently visible chapter', async ({ page }) => {
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

	await page.locator('#column-0').click();
	await page.getByRole('button', { name: 'Bibeln' }).click();
	await page
		.locator('form[action="?/setColumn"]')
		.filter({ has: page.locator('input[name="resource"][value="SEEDPLAIN"]') })
		.getByRole('button')
		.click();

	await expect(page.locator('#column-0')).toContainText('Schlicht');
	await expect(page).toHaveURL(/\/1Mo2,1$/);
	await expect(column.locator('[data-chapter-key="1:2"]')).toBeAttached();
});

test('a closed column can be opened again', async ({ page }) => {
	await page.goto('/Joh3');
	await expect(page.locator('button[id^="column-"]')).toHaveCount(2);

	// Close the second column; the fixture has exactly two translations, so the add button appears.
	await page
		.getByRole('button', { name: /Spalte entfernen/ })
		.last()
		.click();
	await expect(page.locator('button[id^="column-"]')).toHaveCount(1);

	await page.getByRole('button', { name: 'Spalte hinzufügen' }).first().click();
	await page.getByRole('button', { name: 'Bibeln' }).click();
	await page.locator('form[action="?/addColumn"]').getByRole('button').first().click();

	await expect(page.locator('button[id^="column-"]')).toHaveCount(2);

	// And the choice is remembered, like every other column change.
	await page.goto('/1Mo1');
	await expect(page.locator('button[id^="column-"]')).toHaveCount(2);
});

test('the study panel and the column headers stay in view while scrolling', async ({ page }) => {
	await page.goto('/Joh3,16');
	await page.locator('button.strong[data-strong="G25"]').first().click();

	const sidebar = page.getByRole('complementary');
	const header = page.locator('#column-0');
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

	await page.getByRole('heading', { level: 1 }).click();
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

test('the mobile column switcher exposes real tab semantics without hiding desktop columns', async ({
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

	const tabs = page.getByRole('tablist', { name: 'Spaltenauswahl' }).getByRole('tab');
	await expect(tabs).toHaveCount(2);
	await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
	await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
	await expect(tabs.first()).toHaveAttribute('tabindex', '0');
	await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');

	const mobileColumns = page.locator('.flow-column');
	await expect(mobileColumns.first()).toHaveAttribute('role', 'tabpanel');
	await expect(mobileColumns.nth(1)).toHaveAttribute('aria-hidden', 'true');

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
	await expect(mobileColumns.first()).toHaveAttribute('aria-hidden', 'true');
	await expect(mobileColumns.nth(1)).not.toHaveAttribute('aria-hidden', 'true');
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
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Könige');
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
