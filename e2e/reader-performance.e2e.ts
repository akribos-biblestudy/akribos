import { expect, test, type Page } from '@playwright/test';

async function mockChapters(page: Page, last = 30) {
	const base = await (await page.request.get('/api/reader/1/1?resource=SEEDDE')).json();
	await page.route('**/api/reader/1/*', async (route) => {
		const url = new URL(route.request().url());
		const chapter = Number(url.pathname.split('/').at(-1));
		const payload = structuredClone(base);
		payload.reference = { book: 1, chapter };
		payload.fullTitle = `1. Mose ${chapter}`;
		payload.chapter.chapter = chapter;
		payload.resourceId = url.searchParams.get('resource');
		payload.chapter.rows = Array.from({ length: 31 }, (_, i) => ({
			verse: i + 1,
			cells: [
				{
					verse: i + 1,
					verseEnd: null,
					span: 1,
					heading: null,
					segments: [
						{ kind: 'w', text: 'Wort', strong: 'H1', strongs: ['H1', 'H2'] },
						' sprach zu den Menschen und erklärte ihnen den langen Text. '.repeat(5)
					]
				}
			]
		}));
		payload.navigation = {
			previous: chapter > 1 ? { book: 1, chapter: chapter - 1 } : null,
			next: chapter < last ? { book: 1, chapter: chapter + 1 } : null
		};
		await route.fulfill({ json: payload });
	});
}

test('long independent chapter streams stay bounded and restore previous chapters without moving the visible anchor', async ({
	page
}) => {
	// This exercises almost sixty chapter requests under the full suite's parallel browser load.
	test.setTimeout(90_000);
	await mockChapters(page);
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:-:1Mo1&tab=2.1:SEEDDE:-:1Mo1&active=1.1&active=2.1&focus=1'
	);
	const columns = page.locator('.flow-column');
	await expect(columns).toHaveCount(2);
	for (let wanted = 2; wanted <= 30; wanted++) {
		if (wanted > 2)
			await columns.first().evaluate((column) => {
				column.dispatchEvent(
					new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })
				);
				column.scrollTop = column.scrollHeight;
				column.dispatchEvent(new Event('scroll'));
			});
		await expect(columns.first().locator(`[data-chapter-key="1:${wanted}"]`)).toBeAttached();
		await expect
			.poll(() => columns.first().locator('[data-chapter-key]').count())
			.toBeLessThanOrEqual(5);
	}
	// The independent neighbour remains in its original window.
	await expect(columns.nth(1).locator('[data-chapter-key="1:1"]')).toBeAttached();
	await expect(columns.nth(1).locator('[data-chapter-key]')).toHaveCount(2);
	const firstKey = await columns
		.first()
		.locator('[data-chapter-key]')
		.first()
		.getAttribute('data-chapter-key');
	const firstChapter = Number(firstKey!.split(':')[1]);
	const before = await columns.first().evaluate((column, key) => {
		column.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
		column.scrollTop = 100;
		const top = column
			.querySelector(`[data-chapter-key="${key}"] [data-verse-key]`)!
			.getBoundingClientRect().top;
		column.dispatchEvent(new Event('scroll'));
		return top;
	}, firstKey);
	// The text is the anchor: a chapter gains 0.45rem top padding when it stops being first.
	const anchor = columns
		.first()
		.locator(`[data-chapter-key="${firstKey}"] [data-verse-key]`)
		.first();
	await expect(
		columns.first().locator(`[data-chapter-key="1:${firstChapter - 1}"]`)
	).toBeAttached();
	await expect.poll(async () => Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(2);
	// Read all the way backwards through chapters that have been discarded and re-fetched.
	for (let wanted = firstChapter - 2; wanted >= 1; wanted--) {
		await columns.first().evaluate((column) => {
			column.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })
			);
			column.scrollTop = 100;
			column.dispatchEvent(new Event('scroll'));
		});
		await expect(columns.first().locator(`[data-chapter-key="1:${wanted}"]`)).toBeAttached();
		await expect
			.poll(() => columns.first().locator('[data-chapter-key]').count())
			.toBeLessThanOrEqual(5);
	}
});

test('pen hover highlights occurrences, clears during contact, and resumes after lifting', async ({
	page
}) => {
	await page.goto('/Joh3');
	const word = page.locator('#Joh3_16 button.strong[data-strong="G2316"]').first();
	const other = page.locator('#Joh3_17 button.strong[data-strong="G2316"]').first();
	await word.dispatchEvent('pointerover', { pointerType: 'pen', buttons: 0 });
	await expect(word).toHaveClass(/strong-hover/);
	await expect(other).toHaveClass(/strong-hover/);
	await word.dispatchEvent('pointerdown', { pointerType: 'pen', buttons: 1 });
	await expect(other).not.toHaveClass(/strong-hover/);
	await word.dispatchEvent('pointermove', { pointerType: 'pen', buttons: 0 });
	await expect(other).toHaveClass(/strong-hover/);
	await word.dispatchEvent('pointerout', { pointerType: 'pen', buttons: 0 });
	await expect(other).not.toHaveClass(/strong-hover/);
	await word.dispatchEvent('pointerover', { pointerType: 'touch', buttons: 0 });
	await expect(other).not.toHaveClass(/strong-hover/);
});

test('recent inactive tab streams are reused and older streams are evicted without losing the tab reference', async ({
	page
}) => {
	const tabs = Array.from({ length: 10 }, (_, index) => `tab=1.${index + 1}:SEEDDE:-:Joh3,16`).join(
		'&'
	);
	let nextRequests = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.startsWith('/api/reader/')) nextRequests++;
	});
	await page.goto(`/Joh3,16?layout=single&${tabs}&active=1.1&focus=1`);
	const resourceTabs = page.locator('.reader-tile .resource-tab [role=tab]');
	await expect(resourceTabs).toHaveCount(10);
	await expect.poll(() => nextRequests).toBeGreaterThan(0);
	for (let index = 1; index < 10; index++) {
		const previous = nextRequests;
		await resourceTabs.nth(index).click();
		await expect(resourceTabs.nth(index)).toHaveAttribute('aria-selected', 'true');
		await expect.poll(() => nextRequests).toBeGreaterThan(previous);
	}
	const beforeReuse = nextRequests;
	await resourceTabs.nth(8).click();
	await expect(resourceTabs.nth(8)).toHaveAttribute('aria-selected', 'true');
	await page.waitForTimeout(250);
	expect(nextRequests).toBe(beforeReuse);
	await resourceTabs.first().click();
	await expect(resourceTabs.first()).toHaveAttribute('aria-selected', 'true');
	await expect.poll(() => nextRequests).toBeGreaterThan(beforeReuse);
	await expect(page.locator('.reader-tile').getByRole('searchbox').first()).toHaveValue(
		/Joh.*3.*16/
	);
});

test('linked columns stay aligned while old chapters are pruned', async ({ page }) => {
	await mockChapters(page, 12);
	await page.goto(
		'/1Mo1?layout=columns-2&tab=1.1:SEEDDE:A:1Mo1&tab=2.1:SEEDDE:A:1Mo1&active=1.1&active=2.1&focus=1'
	);
	const columns = page.locator('.flow-column');
	for (let chapter = 2; chapter <= 12; chapter++) {
		await expect(columns.first().locator(`[data-chapter-key="1:${chapter}"]`)).toBeAttached();
		await columns.first().evaluate((column, currentChapter) => {
			const target = column.querySelector(`[data-verse-key="1:${currentChapter}:10"]`)!;
			column.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })
			);
			column.scrollTop +=
				target.getBoundingClientRect().top - column.getBoundingClientRect().top - 24;
			column.dispatchEvent(new Event('scroll'));
		}, chapter);
		await expect(columns.nth(1).locator(`[data-verse-key="1:${chapter}:10"]`)).toBeAttached();
		await expect
			.poll(async () => {
				const a = await columns.first().locator(`[data-verse-key="1:${chapter}:10"]`).boundingBox();
				const b = await columns.nth(1).locator(`[data-verse-key="1:${chapter}:10"]`).boundingBox();
				return Math.abs(a!.y - b!.y);
			})
			.toBeLessThan(3);
		if (chapter < 12)
			await columns.first().evaluate((column) => {
				column.dispatchEvent(
					new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })
				);
				column.scrollTop = column.scrollHeight;
				column.dispatchEvent(new Event('scroll'));
			});
	}
	await expect
		.poll(() => columns.first().locator('[data-chapter-key]').count())
		.toBeLessThanOrEqual(5);
	await expect
		.poll(() => columns.nth(1).locator('[data-chapter-key]').count())
		.toBeLessThanOrEqual(5);
});
