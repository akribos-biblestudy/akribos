import { expect, test, type Locator } from '@playwright/test';

async function expectInsideViewport(popup: Locator) {
	await expect
		.poll(() =>
			popup.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				const viewportWidth = document.documentElement.getBoundingClientRect().width;
				return (
					rect.left >= 7 &&
					rect.top >= 7 &&
					rect.right <= viewportWidth - 7 &&
					rect.bottom <= window.innerHeight - 7
				);
			})
		)
		.toBe(true);
}

async function expectAllCategoriesVisible(popup: Locator) {
	const categories = popup.locator('.categories');
	await expect(categories.getByRole('button')).toHaveCount(4);
	await expect
		.poll(() =>
			categories.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return (
					element.scrollWidth <= element.clientWidth &&
					[...element.querySelectorAll('button')].every((button) => {
						const item = button.getBoundingClientRect();
						return item.left >= rect.left && item.right <= rect.right && item.bottom <= rect.bottom;
					})
				);
			})
		)
		.toBe(true);
}

test('rounded Reader cards contain their header and content at every corner', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await page.goto('/Joh3');
	await expect(page.locator('.reader-tile')).toHaveCount(2);
	for (const colorScheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme });
		await expect
			.poll(() =>
				page.locator('.reader-tile').evaluateAll((tiles) =>
					tiles.every((tile) => {
						const rect = tile.getBoundingClientRect();
						return [
							[rect.left + 2, rect.top + 2],
							[rect.right - 2, rect.top + 2],
							[rect.left + 2, rect.bottom - 2],
							[rect.right - 2, rect.bottom - 2]
						].every(([x, y]) => !tile.contains(document.elementFromPoint(x!, y!)));
					})
				)
			)
			.toBe(true);
	}
});

test('an empty Reader card anchors its chooser to the visible open control', async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 1300 });
	await page.goto('/Joh3?layout=columns-2&tab=1.1:SEEDDE:A:Joh3&active=1.1&focus=1');
	const tile = page.locator('.reader-tile').nth(1);
	const trigger = tile.getByRole('button', { name: 'Ressource öffnen', exact: true });
	await trigger.focus();
	await page.keyboard.press('Enter');
	const popup = page.getByRole('dialog', { name: 'Werk wählen' });
	await expect(popup.getByRole('searchbox')).toBeFocused();
	await expectInsideViewport(popup);
	const button = (await trigger.boundingBox())!;
	const card = (await tile.boundingBox())!;
	const dialog = (await popup.boundingBox())!;
	expect(button.height).toBeLessThan(100);
	expect(button.y + button.height).toBeLessThan(card.y + card.height - 300);
	expect(Math.abs(dialog.y - (button.y + button.height + 6))).toBeLessThan(2);
	await page.keyboard.press('Escape');
	await expect(popup).not.toBeVisible();
	await expect(trigger).toBeFocused();
});

test('the resource chooser exposes every category on desktop and narrow screens', async ({
	page
}) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await page.goto('/Joh3');
	const trigger = page
		.locator('.reader-tile')
		.first()
		.getByRole('button', { name: /wechseln$/ });
	await trigger.click();
	const popup = page.getByRole('dialog', { name: 'Werk wählen' });
	await expect(popup.getByRole('searchbox')).toBeFocused();
	await expectAllCategoriesVisible(popup);
	expect((await popup.boundingBox())!.width).toBeGreaterThan(400);
	const categories = popup.locator('.categories button');
	const tops = await categories.evaluateAll((buttons) =>
		buttons.map((button) => button.getBoundingClientRect().top)
	);
	expect(new Set(tops).size).toBe(1);

	// Resize the open popup as on rotation or when an on-screen keyboard reduces the viewport.
	await page.setViewportSize({ width: 320, height: 380 });
	await expectInsideViewport(popup);
	await expectAllCategoriesVisible(popup);
	const narrowTops = await categories.evaluateAll((buttons) =>
		buttons.map((button) => button.getBoundingClientRect().top)
	);
	expect(new Set(narrowTops).size).toBeGreaterThan(1);
	await popup.getByRole('searchbox').focus();
	await page.keyboard.press('Tab'); // close control
	for (let index = 0; index < 4; index += 1) {
		await page.keyboard.press('Tab');
		await expect(categories.nth(index)).toBeFocused();
	}
	await page.keyboard.press('Space');
	await expect(categories.last()).toHaveAttribute('aria-pressed', 'true');
	await expect(popup.locator('input[name="resource"][value="STRONGS_GREEK"]')).toBeAttached();
	await page.keyboard.press('Escape');
	await expect(popup).not.toBeVisible();
});

for (const fallback of [false, true]) {
	test(`Reader panel menus escape card clipping with ${fallback ? 'legacy fixed positioning' : 'native popovers'}`, async ({
		page
	}) => {
		if (fallback) {
			await page.addInitScript(() => {
				delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
				delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
			});
		}
		await page.setViewportSize({ width: 900, height: 700 });
		await page.goto('/Joh3');
		const tile = page.locator('.reader-tile').first();
		for (const [buttonName, menuName] of [
			['Tab verschieben', 'Tab verschieben'],
			[/Tabgruppe für .* wechseln/, 'Tabgruppe wechseln'],
			[/Informationen zu/, 'Werk-Informationen']
		] as const) {
			const trigger = tile.getByRole('button', { name: buttonName });
			await trigger.focus();
			await page.keyboard.press('Enter');
			const popup = page.getByRole('menu', { name: menuName, exact: true });
			await expect(popup).toBeVisible();
			await expect
				.poll(() =>
					popup.evaluate((element) => {
						const rect = element.getBoundingClientRect();
						return element.contains(document.elementFromPoint(rect.right - 10, rect.top + 20));
					})
				)
				.toBe(true);
			await page.keyboard.press('Escape');
			await expect(popup).not.toBeVisible();
			await expect(trigger).toBeFocused();
		}
	});
}
