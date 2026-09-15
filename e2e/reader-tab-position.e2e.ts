import { expect, test } from '@playwright/test';

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
