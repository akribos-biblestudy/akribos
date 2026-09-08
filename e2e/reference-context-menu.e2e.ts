import { expect, test, type Page } from '@playwright/test';

const menu = (page: Page) => page.getByRole('menu', { name: 'Bibelstelle öffnen oder kopieren' });
const input = (page: Page, tile: number) =>
	page
		.locator('.reader-tile')
		.nth(tile)
		.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
const tabs = (page: Page) => new URL(page.url()).searchParams.getAll('tab');

test('reference context opens a search result in an existing group and retains the source search', async ({
	page
}) => {
	await page.goto(
		'/1Mo1,1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1,1&tab=2.1:SEEDPLAIN:B:1Mo2,1&active=1.1&active=2.1&focus=1'
	);
	await input(page, 0).fill('G25');
	await input(page, 0).press('Enter');
	await page.locator('.result-card[data-reference="Joh 3,16"]').click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe B öffnen' }).click();
	await expect(input(page, 1)).toHaveValue('Joh 3,16');
	await expect(input(page, 0)).toHaveValue('G25');
	await expect(page.locator('.result-card[data-reference="Joh 3,16"]')).toBeVisible();
	expect(tabs(page)).toEqual(['1.1:SEEDDE:A:1Mo1,1', '2.1:SEEDPLAIN:B:Joh3,16']);
	await page
		.locator('.reader-tile')
		.nth(1)
		.getByRole('button', { name: 'Im Tab zurück', exact: true })
		.click();
	await expect(input(page, 1)).toHaveValue('1Mo 2,1');
});

test('reference context copies the verse text of the clicked translation', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(
		'/Joh3?layout=columns-2&tab=1.1:SEEDDE:A:Joh3&tab=2.1:SEEDPLAIN:B:Joh3&active=1.1&active=2.1&focus=1'
	);
	await page
		.locator('.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"]')
		.click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'Vers kopieren', exact: true }).click();
	await expect(menu(page).getByRole('menuitem', { name: 'Kopiert', exact: true })).toBeVisible();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toMatch(/^Johannes 3,16\nDenn so sehr hat Gott/);
	expect(copied).not.toContain('Denn also');
	await page.keyboard.press('Escape');
	await expect(menu(page)).not.toBeVisible();
});

test('reference context adds a missing group without replacing tabs and reuses it', async ({
	page
}) => {
	await page.goto(
		'/Joh3,16?layout=columns-2&tab=1.1:SEEDDE:A:Joh3,16&tab=2.1:SEEDCOMMENTARY:B:1Mo1,3&active=1.1&active=2.1&focus=1'
	);
	await page.locator('[data-verse-key="43:3:17"]').click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe E öffnen' }).click();
	await expect(input(page, 0)).toHaveValue('Joh 3,17');
	await expect(page.locator('.reader-tile .resource-tab')).toHaveCount(3);
	expect(tabs(page)).toContain('1.1:SEEDDE:A:Joh3,16');
	expect(tabs(page)).toContain('1.2:SEEDDE:E:Joh3,17');
	expect(tabs(page)).toContain('2.1:SEEDCOMMENTARY:B:1Mo1,3');
	await page.locator('[data-verse-key="43:3:16"]').click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe E öffnen' }).click();
	await expect(input(page, 0)).toHaveValue('Joh 3,16');
	await expect(page.locator('.reader-tile .resource-tab')).toHaveCount(3);
});

test('reference context activates an existing inactive Bible in the requested group', async ({
	page
}) => {
	await page.goto(
		'/Joh3,16?layout=columns-2&tab=1.1:SEEDDE:A:Joh3,16&tab=2.1:SEEDPLAIN:C:1Mo1,1&tab=2.2:SEEDCOMMENTARY:B:1Mo1,3&active=1.1&active=2.2&focus=1'
	);
	await page.locator('[data-verse-key="43:3:17"]').click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe C öffnen' }).click();
	await expect(input(page, 1)).toHaveValue('Joh 3,17');
	await expect(
		page
			.locator('.reader-tile')
			.nth(1)
			.getByRole('tab', { name: /^Schlicht Tab/ })
	).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.reader-tile .resource-tab')).toHaveCount(3);
	expect(tabs(page)).toContain('1.1:SEEDDE:A:Joh3,16');
	expect(tabs(page)).toContain('2.2:SEEDCOMMENTARY:B:1Mo1,3');
});

test('reference context returns from global search to the workspace', async ({ page }) => {
	await page.goto('/Joh1');
	await expect(input(page, 0)).toBeVisible();
	await page.goto('/search?q=geliebt');
	await page
		.locator('li[data-reference="Joh 3,16"] [data-bible-id="SEEDDE"]')
		.click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe D öffnen' }).click();
	await expect(page.locator('.flow-column [data-verse-key="43:3:16"]').first()).toBeVisible();
	await expect.poll(() => tabs(page).some((tab) => tab.includes(':D:Joh3,16'))).toBe(true);
	expect(tabs(page)).toContain('1.1:SEEDDE:A:Joh1');
});

test('reference context handles lexicon references and works without the popover API', async ({
	page
}) => {
	await page.addInitScript(() => {
		delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
		delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
	});
	await page.goto('/Joh3');
	await page.locator('button.strong[data-strong="G25"]').first().click();
	const study = page.getByLabel('Lexikoneintrag in Strong');
	const reference = study.getByRole('link', { name: 'Joh 3:16' });
	await reference.click({ button: 'right' });
	await expect(menu(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(menu(page)).not.toBeVisible();
	await reference.click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe A öffnen' }).click();
	await expect(input(page, 0)).toHaveValue('Joh 3,16');
	await expect(study).toBeVisible();
	await expect(page.locator('.reader-tile .resource-tab')).toHaveCount(3);
});

test('reference context restores the previous workspace after client navigation', async ({
	page
}) => {
	await page.goto(
		'/1Mo1,1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1,1&tab=2.1:SEEDPLAIN:B:1Mo2,1&active=1.1&active=2.1&focus=1'
	);
	await expect(input(page, 1)).toHaveValue('1Mo 2,1');
	// Exercise SvelteKit's delegated link navigation; page.goto would recreate the root context.
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/search?q=geliebt';
		link.textContent = 'Zur Suchseite im Test';
		document.body.appendChild(link);
	});
	await page.getByRole('link', { name: 'Zur Suchseite im Test' }).click();
	await page
		.locator('li[data-reference="Joh 3,16"] [data-bible-id="SEEDDE"]')
		.click({ button: 'right' });
	await menu(page).getByRole('menuitem', { name: 'In Tabgruppe D öffnen' }).click();
	await expect(input(page, 0)).toHaveValue('Joh 3,16');
	await expect(input(page, 1)).toHaveValue('1Mo 2,1');
	expect(tabs(page)).toContain('1.1:SEEDDE:A:1Mo1,1');
	expect(tabs(page)).toContain('1.2:SEEDDE:D:Joh3,16');
});
