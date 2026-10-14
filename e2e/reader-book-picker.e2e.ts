import { expect, test, type Page } from '@playwright/test';
import { BOOKS } from '../src/lib/bible/books.ts';

const dialog = (page: Page) =>
	page.getByRole('dialog', { name: 'Buch und Kapitel wählen', exact: true });
const picker = (page: Page) => page.getByRole('button', { name: /^Buch und Kapitel in/ });
const fixturePath = '/Joh3?layout=single&tab=1.1:SEEDDE:A:Joh3&active=1.1&focus=1';

// The ordinary seed intentionally contains just a few chapters. Supply a full catalogue for the
// grid/keyboard cases; the separate navigation test and resource-grants suite use the real API.
async function fullCatalogue(page: Page) {
	await page.route('**/api/reader/resources/SEEDDE/navigation', (route) =>
		route.fulfill({
			json: {
				books: BOOKS.map((book) => ({
					book: book.id,
					chapters: Array.from({ length: book.chapters }, (_, index) => index + 1)
				}))
			}
		})
	);
}

for (const width of [1280, 390, 320]) {
	test(`D6 book grid stays square and within the viewport at ${width}px`, async ({
		page
	}, testInfo) => {
		await page.setViewportSize({ width, height: 844 });
		await fullCatalogue(page);
		await page.goto(fixturePath);
		await picker(page).click();
		await expect(dialog(page).getByRole('button', { name: 'Johannes', exact: true })).toBeVisible();
		await dialog(page).getByRole('tab', { name: 'Altes Testament' }).click();
		const books = dialog(page).locator('[data-book]');
		await expect(books).toHaveCount(39);
		await page.screenshot({ path: testInfo.outputPath('book-grid.png') });
		expect(
			await books.evaluateAll((cells) =>
				cells.map((cell) => {
					const r = cell.getBoundingClientRect();
					return { width: r.width, height: r.height };
				})
			)
		).toEqual(Array.from({ length: 39 }, () => ({ width: 44, height: 44 })));
		const bounds = await dialog(page).boundingBox();
		expect(bounds!.width).toBe(306);
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		await expect(
			dialog(page).getByRole('button', { name: 'Klagelieder', exact: true })
		).toHaveAttribute('data-book-group', 'poetry');
		await dialog(page).getByRole('tab', { name: 'Neues Testament' }).click();
		await expect(books).toHaveCount(27);
		await expect(
			dialog(page).getByRole('button', { name: 'Hebräer', exact: true })
		).toHaveAttribute('data-book-group', 'general');
		await expect(
			dialog(page).getByRole('button', { name: 'Offenbarung', exact: true })
		).toHaveAttribute('data-book-group', 'revelation');
		const resourceIcon = await page.locator('.resource-button svg').first().innerHTML();
		expect(await page.locator('.book-picker-trigger svg').innerHTML()).not.toBe(resourceIcon);
		await page.keyboard.press('Escape');
		await expect(dialog(page)).not.toBeVisible();
		await expect(picker(page)).toBeFocused();
	});
}

test('chapter selection preserves independent groups and uses actual chapter coverage and tab history', async ({
	page
}) => {
	await page.goto(
		'/1Mo1?layout=columns-3&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDPLAIN:A:1Mo1&tab=3.1:SEEDDE:B:1Mo1&active=1.1&active=2.1&active=3.1&focus=3'
	);
	const tiles = page.locator('.reader-tile');
	await picker(page).first().click();
	await dialog(page).getByRole('tab', { name: 'Neues Testament' }).click();
	await dialog(page).getByRole('button', { name: 'Johannes', exact: true }).click();
	await expect(dialog(page).locator('[data-chapter]')).toHaveCount(1);
	await expect(dialog(page).getByRole('button', { name: 'Johannes 2', exact: true })).toHaveCount(
		0
	);
	await expect(page).toHaveURL(/\/1Mo1\?/);
	await dialog(page).getByRole('button', { name: 'Johannes 3', exact: true }).click();
	await expect(tiles.nth(0).getByRole('searchbox')).toHaveValue('Joh 3');
	await expect(tiles.nth(1).getByRole('searchbox')).toHaveValue('Joh 3');
	await expect(tiles.nth(2).getByRole('searchbox')).toHaveValue('1Mo 1');
	await expect(page).toHaveURL(
		(url) =>
			url.pathname === '/Joh3' && url.searchParams.getAll('tab').includes('3.1:SEEDDE:B:1Mo1')
	);
	await tiles.nth(0).getByRole('button', { name: 'Im Tab zurück', exact: true }).click();
	await expect(tiles.nth(0).getByRole('searchbox')).toHaveValue('1Mo 1');
	await tiles.nth(0).getByRole('button', { name: 'Im Tab vor', exact: true }).click();
	await expect(tiles.nth(0).getByRole('searchbox')).toHaveValue('Joh 3');
	await page.reload();
	await expect(tiles.nth(2).getByRole('searchbox')).toHaveValue('1Mo 1');
});

test('Psalms pages reach 150, reopen at the current chapter and remain usable at short height', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 500 });
	await fullCatalogue(page);
	await page.goto(fixturePath);
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await picker(page).click();
	await dialog(page).getByRole('tab', { name: 'Altes Testament' }).click();
	await dialog(page).getByRole('button', { name: 'Psalmen', exact: true }).click();
	await expect(dialog(page).locator('[data-chapter]')).toHaveCount(42);
	await expect(dialog(page).getByRole('button', { name: 'Vorherige Kapitel' })).toBeDisabled();
	for (let i = 0; i < 3; i++)
		await dialog(page).getByRole('button', { name: 'Nächste Kapitel' }).click();
	await expect(dialog(page).getByRole('button', { name: 'Nächste Kapitel' })).toBeDisabled();
	await expect(dialog(page).locator('[data-chapter]')).toHaveCount(24);
	const bounds = await dialog(page).boundingBox();
	expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);
	await dialog(page).getByRole('button', { name: 'Psalmen 150', exact: true }).click();
	await expect(page).toHaveURL(/\/Ps150\?/);
	await expect(page.getByRole('searchbox', { name: /Bibelstelle oder Suche/ })).toHaveValue(
		'Ps 150'
	);
	await picker(page).click();
	await dialog(page).getByRole('button', { name: 'Psalmen', exact: true }).click();
	await expect(
		dialog(page).getByRole('button', { name: 'Psalmen 150', exact: true })
	).toBeFocused();
	await expect(
		dialog(page).getByRole('button', { name: 'Psalmen 150', exact: true })
	).toHaveAttribute('aria-current', 'true');
	await dialog(page).getByRole('button', { name: 'Zur Buchauswahl' }).click();
	await expect(dialog(page).getByRole('button', { name: 'Psalmen', exact: true })).toBeFocused();
	await page.mouse.click(2, 2);
	await expect(dialog(page)).not.toBeVisible();
});

test('keyboard navigation follows six-column rows and selects only after the chapter', async ({
	page
}) => {
	await fullCatalogue(page);
	await page.goto(fixturePath);
	await picker(page).focus();
	await page.keyboard.press('Enter');
	await expect(dialog(page).getByRole('button', { name: 'Johannes', exact: true })).toBeFocused();
	await dialog(page).getByRole('tab', { name: 'Neues Testament' }).focus();
	await page.keyboard.press('ArrowLeft');
	await expect(dialog(page).getByRole('tab', { name: 'Altes Testament' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await expect(dialog(page).getByRole('button', { name: '1.Mose', exact: true })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowDown');
	await expect(dialog(page).getByRole('button', { name: 'Rut', exact: true })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/Joh3\?/);
	await expect(dialog(page).getByRole('button', { name: 'Rut 1', exact: true })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/Ruth2\?/);
});

test('failed loads can retry and closing during a delayed load cannot reopen the picker', async ({
	page
}) => {
	await fullCatalogue(page);
	await page.goto(fixturePath);
	await page.route(
		'**/api/reader/resources/*/navigation',
		(route) => route.fulfill({ status: 503, body: 'Unavailable' }),
		{ times: 1 }
	);
	await picker(page).click();
	await expect(dialog(page).getByRole('alert')).toContainText('nicht geladen');
	await dialog(page).getByRole('button', { name: 'Erneut versuchen' }).click();
	await expect(dialog(page).getByRole('button', { name: 'Johannes', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	let started!: () => void;
	const requested = new Promise<void>((resolve) => {
		started = resolve;
	});
	await page.route(
		'**/api/reader/resources/*/navigation',
		async (route) => {
			started();
			await waiting;
			await route.fulfill({ json: { books: [{ book: 1, chapters: [1] }] } });
		},
		{ times: 1 }
	);
	await picker(page).click();
	await requested;
	await page.keyboard.press('Escape');
	release();
	await expect(dialog(page)).not.toBeVisible();
	await picker(page).click();
	await expect(dialog(page).getByRole('button', { name: 'Johannes', exact: true })).toBeVisible();
});
