import { expect, test, type Page } from '@playwright/test';

const tile = (page: Page, index = 0) => page.locator('.reader-tile').nth(index);
const referenceField = (page: Page, index = 0) =>
	tile(page, index).getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
async function expectView(page: Page, path: string, tabs: string[]) {
	await expect(page).toHaveURL(
		(url) =>
			url.pathname === path && tabs.every((tab) => url.searchParams.getAll('tab').includes(tab))
	);
}
async function addCommentary(page: Page, index: number) {
	await tile(page, index)
		.getByRole('button', { name: /Ressource in Bereich .* öffnen/ })
		.click();
	await page
		.getByRole('dialog', { name: 'Werk wählen' })
		.getByRole('button', { name: /^Kommentare/ })
		.click();
	await page
		.locator('form')
		.filter({ has: page.locator('input[name="resource"][value="SEEDCOMMENTARY"]') })
		.getByRole('button')
		.click();
	await expect(
		tile(page, index).locator('.flow-column[data-resource-id="SEEDCOMMENTARY"]')
	).toBeVisible();
}

test('Strong clicks in an unfocused group preserve both independent reading positions', async ({
	page
}) => {
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDDE:B:Joh3&active=1.1&active=2.1&focus=1'
	);
	await expect(referenceField(page, 1)).toHaveValue('Joh 3');
	await tile(page, 1)
		.locator('[data-verse-key="43:3:16"] button.strong[data-strong="G2316"]')
		.first()
		.click();
	await expect(tile(page, 1).getByRole('tab', { name: /^Strong Griechisch/ })).toBeVisible();
	await expectView(page, '/Joh3', [
		'1.1:SEEDDE:A:1Mo1',
		'2.1:SEEDDE:B:Joh3',
		'2.2:STRONGS_GREEK:B:Joh3'
	]);
	expect(new URL(page.url()).searchParams.getAll('sourceRef')).toContain('2.2:Joh3,16');
});

test('adding a resource uses its source group position and preserves an independent link setting', async ({
	page
}) => {
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDPLAIN:-:Joh3&active=1.1&active=2.1&focus=1'
	);
	await expect(referenceField(page, 1)).toHaveValue('Joh 3');
	await addCommentary(page, 1);
	await expectView(page, '/Joh3', [
		'1.1:SEEDDE:A:1Mo1',
		'2.1:SEEDPLAIN:-:Joh3',
		'2.2:SEEDCOMMENTARY:-:Joh3'
	]);
});

test('reducing the layout uses the remaining active tab reference', async ({ page }) => {
	await page.goto(
		'/Joh3?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDPLAIN:B:Joh3&active=1.1&active=2.1&focus=2'
	);
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /Eine Kachel/ }).click();
	await expectView(page, '/1Mo1', ['1.1:SEEDDE:A:1Mo1', '1.2:SEEDPLAIN:B:Joh3']);
	await expect(tile(page).getByRole('tab', { name: /^Testübersetzung/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
});

test('expanding the layout keeps the active last tab and focus in the original tile', async ({
	page
}) => {
	await page.goto(
		'/Joh3?layout=single&tab=1.1:SEEDDE:A:1Mo1&tab=1.2:SEEDPLAIN:B:Joh3&active=1.2&focus=1'
	);
	await page.getByTestId('layout-picker').click();
	await page.getByRole('menuitemradio', { name: /Zwei Spalten/ }).click();
	await expectView(page, '/Joh3', ['1.1:SEEDPLAIN:B:Joh3', '2.1:SEEDDE:A:1Mo1']);
	await expect(tile(page).getByRole('tab', { name: /^Schlicht/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
});

test('commentary search links preserve the workspace for clicking and copying', async ({
	page
}) => {
	await page.goto('/Joh3?layout=single&tab=1.1:SEEDTSK:B:Joh3&active=1.1&focus=1');
	await referenceField(page).fill('loved');
	await referenceField(page).press('Enter');
	const link = tile(page)
		.locator('.commentary-result')
		.getByRole('link', { name: '1. Mose 1,1', exact: true });
	await expect(link).toHaveAttribute('href', /layout=single/);
	const href = await link.getAttribute('href');
	const copied = new URL(href!, page.url());
	expect(copied.searchParams.getAll('tab')).toContain('1.1:SEEDTSK:B:1Mo1,1');
	await link.click();
	await expectView(page, '/1Mo1,1', ['1.1:SEEDTSK:B:1Mo1,1']);
});

test('search results survive switching away, reload while inactive, and switching back', async ({
	page
}) => {
	await page.goto(
		'/Joh3?layout=single&tab=1.1:SEEDDE:A:Joh3&tab=1.2:SEEDPLAIN:A:Joh3&active=1.1&focus=1'
	);
	await referenceField(page).fill('Liebe');
	await referenceField(page).press('Enter');
	await expect(page).toHaveURL((url) => url.searchParams.get('search') === '1.1:Liebe');
	await tile(page)
		.getByRole('tab', { name: /^Schlicht/ })
		.click();
	await expect(tile(page).getByRole('tab', { name: /^Schlicht/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page).toHaveURL((url) => url.searchParams.get('search') === '1.1:Liebe');
	await page.reload();
	await tile(page)
		.getByRole('tab', { name: /^Testübersetzung/ })
		.click();
	await expect(referenceField(page)).toHaveValue('Liebe');
	await expect(tile(page).getByRole('button', { name: /Suchergebnisse schließen/ })).toBeVisible();
});

test.describe('native Reader forms', () => {
	test.use({ javaScriptEnabled: false });
	test('render the reference and redirect tab and reference changes to their new snapshot', async ({
		page
	}) => {
		await page.goto(
			'/Joh3?layout=single&tab=1.1:SEEDDE:A:Joh3&tab=1.2:SEEDPLAIN:B:1Mo1&active=1.1&focus=1'
		);
		await expect(referenceField(page)).toHaveValue('Joh 3');
		await tile(page)
			.getByRole('tab', { name: /^Schlicht/ })
			.click();
		await expectView(page, '/1Mo1', ['1.1:SEEDDE:A:Joh3', '1.2:SEEDPLAIN:B:1Mo1']);
		await expect(referenceField(page)).toHaveValue('1Mo 1');
		await referenceField(page).fill('Joh 3,16');
		await referenceField(page).press('Enter');
		await expectView(page, '/Joh3,16', ['1.1:SEEDDE:A:Joh3', '1.2:SEEDPLAIN:B:Joh3,16']);
		await expect(referenceField(page)).toHaveValue('Joh 3,16');
	});
});

test('copied Strong links use the unfocused dictionary tab position', async ({ page }) => {
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:STRONGS_GREEK:B:Joh3&lookup=2.1:G25&active=1.1&active=2.1&focus=1'
	);
	const link = tile(page, 1)
		.getByLabel('Lexikoneintrag in Strong')
		.getByRole('link', { name: 'G2316', exact: true });
	await expect(link).toHaveAttribute('href', /\/Joh3\?layout=/);
	const copied = new URL((await link.getAttribute('href'))!, page.url());
	expect(copied.searchParams.getAll('tab')).toContain('1.1:SEEDDE:A:1Mo1');
	await page.goto(copied.href);
	await expectView(page, '/Joh3', ['1.1:SEEDDE:A:1Mo1', '2.1:STRONGS_GREEK:B:Joh3']);
	await expect(tile(page, 1).getByLabel('Lexikoneintrag in Strong')).toContainText('θεός');
});
