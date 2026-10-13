import { expect, test } from '@playwright/test';

for (const target of ['first tile', 'second tile', 'inactive tab'] as const) {
	test(`changing a tab group adopts the existing position from its ${target}`, async ({ page }) => {
		const sameTile = target === 'inactive tab';
		const joiningFirst = target === 'second tile';
		const tabs = joiningFirst
			? ['1.1:SEEDDE:A:Joh3', '2.1:SEEDDE:B:1Mo1']
			: ['1.1:SEEDDE:B:1Mo1', `${sameTile ? '1.2' : '2.1'}:SEEDDE:A:Joh3`];
		const state = new URLSearchParams({ layout: sameTile ? 'single' : 'columns-2' });
		for (const tab of tabs) state.append('tab', tab);
		if (sameTile) state.append('active', '1.2');
		else {
			state.append('active', '1.1');
			state.append('active', '2.1');
		}
		state.set('focus', sameTile || joiningFirst ? '1' : '2');
		await page.goto(`/Joh3?${state}`);
		const joining = page.locator('.reader-tile').nth(sameTile || joiningFirst ? 0 : 1);
		await expect(joining.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ })).toHaveValue(
			'Joh 3'
		);
		await joining.getByRole('button', { name: /Tabgruppe für/ }).click();
		await page.getByRole('menuitemradio', { name: 'B', exact: true }).click();
		const expectedTabs = tabs.map((tab) => tab.replace(':A:Joh3', ':B:1Mo1'));
		await expect(page).toHaveURL(
			(url) =>
				url.pathname === '/1Mo1' &&
				expectedTabs.every((tab) => url.searchParams.getAll('tab').includes(tab))
		);
		for (const reloaded of [false, true]) {
			if (reloaded) await page.reload();
			for (const tile of await page.locator('.reader-tile').all()) {
				await expect(
					tile.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ })
				).toHaveValue('1Mo 1');
				await expect(tile.locator('[data-verse-key="1:1:1"]')).toBeVisible();
			}
		}
	});
}

test('joining a group follows its live scrolled verse and keeps it when leaving the group', async ({
	page
}) => {
	await page.setViewportSize({ width: 1000, height: 320 });
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDPLAIN:B:Joh3,16&active=1.1&active=2.1&focus=1'
	);
	const joining = page.locator('.reader-tile').first();
	const existing = page.locator('.reader-tile').nth(1);
	const field = (tile: typeof joining) =>
		tile.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
	await expect(field(existing)).toHaveValue('Joh 3,16');
	// Opening the menu also waits for hydration before the synthetic user scroll.
	await joining.getByRole('button', { name: /Tabgruppe für/ }).click();
	await expect(page.getByRole('menu', { name: 'Tabgruppe wechseln' })).toBeVisible();
	await page.keyboard.press('Escape');
	await existing.locator('.flow-column').evaluate((column) => {
		const verse = column.querySelector<HTMLElement>('[data-verse-key="43:3:17"]')!;
		column.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
		column.scrollTop += verse.getBoundingClientRect().top - column.getBoundingClientRect().top - 24;
		column.dispatchEvent(new Event('scroll'));
	});
	await expect(field(existing)).toHaveValue('Joh 3,17');
	for (const group of ['B', 'C', 'Keine']) {
		await joining.getByRole('button', { name: /Tabgruppe für/ }).click();
		await page.getByRole('menuitemradio', { name: group, exact: true }).click();
		await expect(joining.getByRole('button', { name: /Tabgruppe für/ })).toHaveAccessibleName(
			new RegExp(`aktuell ${group}$`)
		);
		await expect(field(joining)).toHaveValue('Joh 3,17');
		await expect(field(existing)).toHaveValue('Joh 3,17');
	}
	await page.reload();
	await expect(field(joining)).toHaveValue('Joh 3,17');
	await expect(field(existing)).toHaveValue('Joh 3,17');
});

test('same-panel linked tabs keep the live verse even when a client submits an old target', async ({
	page
}) => {
	await page.setViewportSize({ width: 900, height: 320 });
	await page.goto(
		'/Joh3,16?layout=single&tab=1.1:SEEDDE:A:Joh3,16&tab=1.2:SEEDPLAIN:A:Joh3,16&active=1.1&focus=1'
	);
	const tile = page.locator('.reader-tile');
	const field = tile.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
	await expect(field).toHaveValue('Joh 3,16');
	await tile.getByRole('button', { name: /Tabgruppe für/ }).click();
	await expect(page.getByRole('menu', { name: 'Tabgruppe wechseln' })).toBeVisible();
	await page.keyboard.press('Escape');
	await tile.locator('.flow-column').evaluate((column) => {
		const verse = column.querySelector('[data-verse-key="43:3:17"]')!;
		column.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
		column.scrollTop = (verse as HTMLElement).offsetTop;
		column.dispatchEvent(new Event('scroll'));
	});
	await expect(field).toHaveValue('Joh 3,17');
	const target = tile.getByRole('tab', { name: /^Schlicht/ });
	// The client should offer the live source position before any server navigation.
	await expect(target.locator('..').locator('input[name="targetReference"]')).toHaveValue(
		'Joh 3,17'
	);
	// An older client may still submit its cached position; the server must preserve the live source.
	await target
		.locator('..')
		.locator('input[name="targetReference"]')
		.evaluate((input) => {
			(input as HTMLInputElement).value = 'Joh 3,16';
		});
	await target.click();
	await expect(tile.locator('.flow-column')).toHaveAttribute('data-resource-id', 'SEEDPLAIN');
	await expect(field).toHaveValue('Joh 3,17');
	await tile.getByRole('tab', { name: /^Testübersetzung/ }).click();
	await expect(tile.locator('.flow-column')).toHaveAttribute('data-resource-id', 'SEEDDE');
	await expect(field).toHaveValue('Joh 3,17');
});

test('Strong study records the clicked verse without moving the reading position', async ({
	page
}) => {
	await page.goto(
		'/Joh3,16?layout=columns-2&tab=1.1:SEEDDE:A:Joh3,16&tab=2.1:SEEDPLAIN:A:Joh3,16&active=1.1&active=2.1&focus=1'
	);
	const source = page.locator('.reader-tile').first();
	const field = source.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
	await expect(field).toHaveValue('Joh 3,16');
	const anchor = source.locator('[data-verse-key="43:3:16"]');
	const before = (await anchor.boundingBox())!.y;
	for (const [verse, strong] of [
		[17, 'G2316'],
		[16, 'G25']
	] as const) {
		await source
			.locator(`[data-verse-key="43:3:${verse}"] button[data-strong="${strong}"]`)
			.click();
		await expect(page.locator('.lexicon-tab .headword strong')).toHaveText(strong);
		await expect(field).toHaveValue('Joh 3,16');
		await expect
			.poll(async () => Math.abs((await anchor.boundingBox())!.y - before))
			.toBeLessThan(2);
		await expect(page).toHaveURL((url) =>
			url.searchParams.getAll('sourceRef').some((value) => value.endsWith(`Joh3,${verse}`))
		);
	}
	await expect(page.getByRole('tab', { name: /^Strong Griechisch/ })).toHaveCount(1);
});
