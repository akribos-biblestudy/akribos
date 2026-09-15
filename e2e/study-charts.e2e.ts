import { expect, test, type Page } from '@playwright/test';

async function openStudy(
	page: Page,
	glosses: { display: string; occurrences: number }[],
	total: number
) {
	await page
		.context()
		.addCookies([{ name: 'tour-guest-done', value: '1', url: 'http://localhost:4173' }]);
	await page.route('**/api/strong/G25?*', async (route) => {
		const response = await route.fetch();
		const payload = await response.json();
		payload.glosses = glosses;
		payload.statistics = { occurrences: total, verseCount: total };
		payload.bookCounts = Array.from({ length: 27 }, (_, index) => ({
			book: 40 + index,
			count: index === 3 ? total : 0
		}));
		await route.fulfill({ json: payload });
	});
	await page.goto(
		'/Joh3?layout=columns-2&tab=1.1:SEEDDE:A:Joh3&tab=2.1:STRONGS_GREEK:A:Joh3&active=1.1&active=2.1&focus=1&lookup=2.1:G25&source=2.1:SEEDDE&sourceRef=2.1:Joh3,16'
	);
	await expect(page.locator('.donut-chart canvas')).toBeVisible();
}

test('word-study charts show rendering counts and horizontal staggered book labels across sizes and themes', async ({
	page
}) => {
	await openStudy(
		page,
		[
			{ display: 'glückselig', occurrences: 46 },
			{ display: 'selig', occurrences: 2 },
			{ display: 'glücklich', occurrences: 1 }
		],
		49
	);
	const chart = page.locator('.donut-chart');
	await expect(chart.locator('.chart-summary strong')).toHaveText('3');
	await expect(chart.locator('.chart-summary')).toContainText('49 Vorkommen');
	await expect(chart.locator('tbody tr')).toHaveCount(3);
	const distribution = page.locator('.lexicon-tab .book-distribution').first();
	for (const width of [1200, 740]) {
		await page.setViewportSize({ width, height: 900 });
		const names = distribution.locator('.name');
		await expect(names.first()).toHaveCSS('writing-mode', 'horizontal-tb');
		await expect(names.first()).toHaveCSS('transform', 'none');
		await expect
			.poll(async () =>
				Math.abs((await names.nth(1).boundingBox())!.y - (await names.first().boundingBox())!.y)
			)
			.toBeGreaterThan(8);
		await expect(distribution.locator('.book.empty')).toHaveCount(26);
		const overflow = await distribution.evaluate((node) => node.scrollWidth - node.clientWidth);
		expect(overflow).toBeLessThan(4);
		if (width === 740)
			await expect(chart.locator('.compact-gloss-labels')).toContainText('glückselig');
	}
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await expect(chart.locator('.chart-summary strong')).toHaveText('3');
	const john = distribution.getByRole('button', { name: /^Joh:/ });
	await john.focus();
	await john.press('Enter');
	await expect(john).toHaveAttribute('aria-pressed', 'true');
	const empty = distribution.getByRole('button', { name: /^Mt:/ });
	await empty.click();
	await expect(empty).toHaveAttribute('aria-pressed', 'true');
});

test('grouped and unlisted renderings preserve the full accessible counts', async ({ page }) => {
	const counts = [279, 132, 41, 26, 15, 10, 4, 3, 2, 2, 1, 1, 1, 1];
	const labels = [
		'was',
		'wer',
		'welcher; welche; welches',
		'warum',
		'wem',
		'wen',
		'wessen',
		'wie',
		'Form 9',
		'Form 10',
		'Form 11',
		'Form 12',
		'Form 13',
		'Form 14'
	];
	await openStudy(
		page,
		counts.map((occurrences, index) => ({ display: labels[index]!, occurrences })),
		528
	);
	const chart = page.locator('.donut-chart');
	await expect(chart.locator('.chart-summary strong')).toHaveText('14+');
	await expect(chart.locator('.chart-summary')).toContainText('528 Vorkommen');
	await expect(chart.locator('tbody tr')).toHaveCount(15);
	await expect(chart.locator('tbody tr').last()).toContainText('weitere Wiedergaben');
	await expect(chart.locator('tbody tr').last()).toContainText('10');
});
