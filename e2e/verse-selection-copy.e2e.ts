import { expect, test, type Page } from '@playwright/test';

const reader =
	'/Joh3?layout=columns-2&tab=1.1:SEEDDE:A:Joh3&tab=2.1:SEEDPLAIN:B:Joh3&active=1.1&active=2.1&focus=1';

async function selectText(page: Page, first: string, last: string) {
	await page.evaluate(
		({ first, last }) => {
			const firstElement = document.querySelector(first)!;
			const lastElement = document.querySelector(last)!;
			const firstWalker = document.createTreeWalker(firstElement, NodeFilter.SHOW_TEXT);
			const lastWalker = document.createTreeWalker(lastElement, NodeFilter.SHOW_TEXT);
			const start = firstWalker.nextNode()!;
			let end: Node = lastWalker.nextNode()!;
			for (let next = lastWalker.nextNode(); next; next = lastWalker.nextNode()) end = next;
			const range = document.createRange();
			range.setStart(start, 0);
			range.setEnd(end, end.textContent!.length);
			const selection = window.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
		},
		{ first, last }
	);
}

test('selection copies complete verses in the selected translation', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(reader);
	const first = '.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"] .verse-text';
	const second =
		'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:17"] .verse-text';
	await expect(page.locator(first).first()).toBeVisible();
	// Select only the first text node of verse 16. The full verse, without footnote or Strong UI,
	// is copied, just like the existing action on the verse number.
	await selectText(page, first, first);
	await page.keyboard.press('Control+c');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
		/^Johannes 3,16\nDenn so sehr hat Gott/
	);
	// Whole-paragraph selections use element boundary offsets rather than text-node endpoints.
	await page.evaluate(() => {
		const verse = document.querySelector(
			'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"]'
		)!;
		const range = document.createRange();
		range.selectNode(verse);
		window.getSelection()!.removeAllRanges();
		window.getSelection()!.addRange(range);
	});
	await page.keyboard.press('Control+c');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
		/^Johannes 3,16\nDenn so sehr hat Gott/
	);
	await selectText(page, first, second);
	await page.keyboard.press('Control+c');
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toContain('Johannes 3,16');
	expect(copied).toContain('Johannes 3,17');
	expect(copied).not.toContain('Johannes 3,18');
	// Ending exactly at the start of the next verse does not include that verse.
	await page.evaluate(() => {
		const first = document.querySelector(
			'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"]'
		)!;
		const second = document.querySelector(
			'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:17"]'
		)!;
		const start = document.createTreeWalker(first, NodeFilter.SHOW_TEXT).nextNode()!;
		const end = document.createTreeWalker(second, NodeFilter.SHOW_TEXT).nextNode()!;
		const range = document.createRange();
		range.setStart(start, 0);
		range.setEnd(end, 0);
		window.getSelection()!.removeAllRanges();
		window.getSelection()!.addRange(range);
	});
	await page.keyboard.press('Control+c');
	const boundary = await page.evaluate(() => navigator.clipboard.readText());
	expect(boundary).toContain('Johannes 3,16');
	expect(boundary).not.toContain('Johannes 3,17');
});

test('input and selection across different Bible columns retain normal copying', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(reader);
	await page.evaluate(() => {
		window.addEventListener('copy', (event) => {
			(window as unknown as { lastCopyPrevented: boolean }).lastCopyPrevented =
				event.defaultPrevented;
		});
	});
	const first = '.flow-column[data-resource-id="SEEDDE"] [data-verse-key="43:3:16"] .verse-text';
	const other = '.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"] .verse-text';
	await expect(page.locator(first).first()).toBeVisible();
	await selectText(page, first, other);
	await page.keyboard.press('Control+c');
	expect(
		await page.evaluate(
			() => (window as unknown as { lastCopyPrevented: boolean }).lastCopyPrevented
		)
	).toBe(false);
	const nativeCopy = await page.evaluate(() => navigator.clipboard.readText());
	expect(nativeCopy.length).toBeGreaterThan(0);
	expect(nativeCopy).not.toContain('Johannes 3,16\n');
	// A selection that also includes a heading must remain the browser's native copy.
	await page.evaluate(() => {
		const verse = document.querySelector(
			'.flow-column[data-resource-id="SEEDDE"] [data-verse-key="43:3:16"]'
		)!;
		const heading = document.createElement('h3');
		heading.textContent = 'Eine Kapitelüberschrift';
		verse.before(heading);
		const range = document.createRange();
		range.setStartBefore(heading);
		range.setEndAfter(verse);
		window.getSelection()!.removeAllRanges();
		window.getSelection()!.addRange(range);
	});
	await page.keyboard.press('Control+c');
	expect(
		await page.evaluate(
			() => (window as unknown as { lastCopyPrevented: boolean }).lastCopyPrevented
		)
	).toBe(false);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		'Eine Kapitelüberschrift'
	);
	const input = page.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ }).first();
	await input.fill('Johannes 3,16');
	await input.selectText();
	await page.keyboard.press('Control+c');
	expect(
		await page.evaluate(
			() => (window as unknown as { lastCopyPrevented: boolean }).lastCopyPrevented
		)
	).toBe(false);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Johannes 3,16');
});
