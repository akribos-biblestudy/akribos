import { expect, test } from '@playwright/test';
import { helpArticles } from '../src/lib/help/catalog';
import { registerWithPassword } from './lib/auth';

const guidePath = '/help/reader/arbeitsbereich-einrichten';

test('help search stays readable in the sidebar and at mobile and zoom widths', async ({
	page
}) => {
	for (const path of ['/help', '/help/probleme']) {
		for (const width of [1440, 1024, 720, 390, 320]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(path);
			const form = page.locator('.help-search:visible');
			await expect(form).toHaveCount(1);
			const input = form.getByRole('searchbox', { name: 'Hilfe durchsuchen' });
			await expect(form).toHaveAttribute('autocomplete', 'off');
			await expect(input).toHaveAttribute('autocomplete', 'off');
			await expect(form.getByRole('button', { name: 'Suchen', exact: true })).toHaveAttribute(
				'title',
				'Suchen'
			);
			await input.focus();
			const fit = await form.evaluate((element) => {
				const input = element.querySelector('input')!;
				const button = element.querySelector('button')!;
				const field = element.querySelector<HTMLElement>('.search-field')!;
				const style = getComputedStyle(input);
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d')!;
				context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
				const bounds = input.getBoundingClientRect();
				return {
					placeholderFits:
						context.measureText(input.placeholder).width <=
						bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
					overlap: bounds.right > button.getBoundingClientRect().left,
					fieldHeight: field.getBoundingClientRect().height,
					fieldOverflow: field.scrollWidth > field.clientWidth,
					pageOverflow: document.documentElement.scrollWidth > window.innerWidth
				};
			});
			expect(fit.placeholderFits, `${path} at ${width}px`).toBe(true);
			expect(fit.overlap).toBe(false);
			expect(fit.fieldOverflow).toBe(false);
			expect(fit.pageOverflow).toBe(false);
			if (path === '/help/probleme' && width > 800)
				expect(fit.fieldHeight).toBeLessThanOrEqual(44.5);
		}
	}
});

test('help search links directly to the matching step and survives reload', async ({ page }) => {
	await page.goto('/help');
	await page.getByRole('searchbox', { name: 'Hilfe durchsuchen' }).fill('Stiftsymbol');
	await page.getByRole('button', { name: 'Suchen', exact: true }).click();
	await expect(page).toHaveURL(/\/help\?q=Stiftsymbol$/);
	const result = page
		.locator('.search-result')
		.filter({ hasText: 'Einen Arbeitsbereich für dein Bibelstudium einrichten' });
	await expect(result).toHaveAttribute('href', `${guidePath}#wechseln`);
	await result.click();
	await expect(page).toHaveURL(`${guidePath}#wechseln`);
	await page.reload();
	await expect(page).toHaveURL(new RegExp(`${guidePath}#wechseln$`));
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Einen Arbeitsbereich für dein Bibelstudium einrichten'
	);
	await expect(
		page.getByRole('heading', { name: 'Arbeitsbereiche wechseln und verwalten', exact: true })
	).toBeVisible();
});

test('all former help fragments lead to readable topic pages', async ({ page }) => {
	await page.goto('/help#reader');
	const topic = page.locator('a#reader');
	await expect(topic).toBeVisible();
	await expect(topic).toHaveAttribute('href', '/help/reader');
	await topic.click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lesen & vergleichen');
	await expect(
		page
			.getByRole('navigation', { name: 'Anleitungen zu diesem Thema', exact: true })
			.getByRole('link', { name: 'Einen Arbeitsbereich für dein Bibelstudium einrichten' })
	).toBeVisible();
});

test('help topic guides are discoverable on mobile and show their own breadcrumb and navigation', async ({
	page
}) => {
	await page.goto('/help/suchen');
	const guides = page.getByRole('navigation', { name: 'Anleitungen zu diesem Thema', exact: true });
	await guides.getByRole('link', { name: 'Wörter, Wortfolgen und Strong-Nummern suchen' }).click();
	const title = 'Wörter, Wortfolgen und Strong-Nummern suchen';
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
	await expect(
		page.getByRole('navigation', { name: 'Brotkrumennavigation' }).locator('[aria-current="page"]')
	).toHaveText(title);
	await expect(
		page
			.getByRole('navigation', { name: 'Hilfethemen', exact: true })
			.locator('[aria-current="page"]')
	).toHaveText(title);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/help/reader');
	await expect(page.getByRole('searchbox', { name: 'Hilfe durchsuchen' })).toBeVisible();
	await expect(
		page
			.getByRole('navigation', { name: 'Anleitungen zu diesem Thema', exact: true })
			.getByRole('link', { name: 'Werke, Tabs und Kacheln passend anordnen' })
	).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
	for (const path of ['/help/reader/werke-tabs-und-layouts', '/help/konto/leseansicht-anpassen']) {
		await page.goto(path);
		for (const width of [390, 320]) {
			await page.setViewportSize({ width, height: 844 });
			await expect
				.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
				.toBe(true);
		}
	}
});

test('public help articles are reachable and their screenshots match the recorded dimensions', async ({
	page
}) => {
	test.setTimeout(90_000);
	const publicArticles = helpArticles.filter(({ audience }) => audience !== 'admin');
	for (const article of publicArticles) {
		const response = await page.request.get(article.path);
		expect(response.status(), article.path).toBe(200);
	}
	const screenshots = [
		...new Map(
			publicArticles.flatMap((article) =>
				article.sections.flatMap(({ screenshot }) =>
					screenshot ? [[screenshot.src, screenshot] as const] : []
				)
			)
		).values()
	];
	await page.goto('/help');
	const images = await page.evaluate(
		async (assets) =>
			Promise.all(
				assets.map(
					(asset) =>
						new Promise<{ src: string; width: number; height: number }>((resolve) => {
							const image = new Image();
							image.onload = () =>
								resolve({ src: asset.src, width: image.naturalWidth, height: image.naturalHeight });
							image.onerror = () => resolve({ src: asset.src, width: 0, height: 0 });
							image.src = asset.src;
						})
				)
			),
		screenshots
	);
	for (const [index, image] of images.entries()) {
		expect(image, image.src).toEqual({
			src: screenshots[index]!.src,
			width: screenshots[index]!.width,
			height: screenshots[index]!.height
		});
	}
});

test('administration help and images are restricted to administrators throughout navigation and search', async ({
	page,
	browser
}) => {
	test.setTimeout(90_000);
	const adminArticles = helpArticles.filter(({ audience }) => audience === 'admin');
	const adminImages = adminArticles.flatMap((article) =>
		article.sections.flatMap(({ screenshot }) => (screenshot ? [screenshot] : []))
	);
	const assertRestricted = async () => {
		for (const path of ['/help', '/help?q=Umami', '/help/api']) {
			const response = await page.request.get(path);
			expect(response.status()).toBe(200);
			expect(response.headers()['cache-control']).toContain('private, no-store');
			expect(await response.text()).not.toContain('/help/administration');
		}
		for (const article of adminArticles) {
			const response = await page.request.get(article.path);
			expect(response.status(), article.path).toBe(404);
			expect(await response.text()).not.toContain(article.sections[0]!.html);
		}
		for (const image of adminImages) {
			expect((await page.request.get(image.src)).status(), image.src).toBe(404);
			expect((await page.request.get(image.src.replace('/media/', '/live/'))).status()).toBe(404);
		}
		await page.goto('/help');
		await expect(page.locator('a[href^="/help/administration"]')).toHaveCount(0);
		await page.goto('/help/reader');
		await expect(page.locator('a[href^="/help/administration"]')).toHaveCount(0);
	};
	await assertRestricted();
	await registerWithPassword(
		page,
		`help-access-${Date.now()}@example.com`,
		'help-access-test-password',
		'Hilfe Test'
	);
	await assertRestricted();
	const context = await browser.newContext();
	try {
		const admin = await context.newPage();
		await admin.goto('http://localhost:4173/login');
		await admin.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await admin.getByRole('button', { name: 'Weiter', exact: true }).click();
		await admin.getByLabel('Passwort', { exact: true }).fill('seed-admin-password');
		await admin.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(admin).not.toHaveURL(/\/login/);
		for (const article of adminArticles) {
			const response = await context.request.get(`http://localhost:4173${article.path}`);
			expect(response.status(), article.path).toBe(200);
			expect(response.headers()['cache-control']).toContain('private, no-store');
			expect(response.headers()['x-robots-tag']).toContain('noindex');
		}
		for (const image of adminImages) {
			const response = await context.request.get(`http://localhost:4173${image.src}`);
			expect(response.status(), image.src).toBe(200);
			expect(response.headers()['content-type']).toContain('image/webp');
			expect(response.headers()['cache-control']).toContain('private, no-store');
		}
		await admin.goto('http://localhost:4173/help?q=Umami');
		await expect(admin.locator('.search-result[href^="/help/administration"]')).not.toHaveCount(0);
		await admin.locator('.search-result[href^="/help/administration"]').first().click();
		await expect(admin.locator('.article-content img').first()).toBeVisible();
		const loaded = await admin
			.locator('.article-content img')
			.first()
			.evaluate(
				(image) =>
					(image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
			);
		expect(loaded).toBe(true);
	} finally {
		await context.close();
	}
	const sitemap = await page.request.get('/sitemap.xml');
	expect(await sitemap.text()).not.toContain('/help/administration');
	await page.goto('/help/api');
	await expect(
		page.getByRole('link', { name: 'technischen API-Referenz', exact: true })
	).toHaveAttribute('href', '/api/docs');
});

test('screenshots open by keyboard, zoom on mobile, and return focus on Escape', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(guidePath);
	const helpSearch = page.getByRole('searchbox', { name: 'Hilfe durchsuchen' });
	await expect(helpSearch).toHaveCount(1);
	await expect(helpSearch).toBeVisible();
	const screenshotLink = page.locator('.help-screenshot').first().getByRole('link');
	await screenshotLink.scrollIntoViewIfNeeded();
	await screenshotLink.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Screenshot vergrößert' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'In Originalgröße anzeigen' }).click();
	await expect(dialog.getByRole('button', { name: 'An Fenster anpassen' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect
		.poll(() =>
			dialog
				.locator('.image-scroll')
				.evaluate((element) => element.scrollWidth > element.clientWidth)
		)
		.toBe(true);
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(screenshotLink).toBeFocused();
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
});

test('help search and screenshot originals are available without JavaScript', async ({
	browser
}) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		baseURL: 'http://localhost:4173'
	});
	try {
		const page = await context.newPage();
		await page.goto('/help');
		await page.getByRole('searchbox', { name: 'Hilfe durchsuchen' }).fill('Stiftsymbol');
		await page.getByRole('button', { name: 'Suchen', exact: true }).click();
		await expect(
			page
				.locator('.search-result')
				.filter({ hasText: 'Einen Arbeitsbereich für dein Bibelstudium einrichten' })
		).toBeVisible();
		await page.goto(guidePath);
		const link = page.locator('.help-screenshot').first().getByRole('link');
		await expect(link).toHaveAttribute('href', '/help/live/workspace-overview.webp');
		const image = await page.request.get('/help/live/workspace-overview.webp');
		expect(image.status()).toBe(200);
		expect(image.headers()['content-type']).toContain('image/webp');
		await page.goto('/help/konto');
		const topicGuides = page.getByRole('navigation', {
			name: 'Anleitungen zu diesem Thema',
			exact: true
		});
		await topicGuides
			.getByRole('link', { name: 'Anmelden, das Profil pflegen und den Zugang verwalten' })
			.click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Anmelden, das Profil pflegen und den Zugang verwalten'
		);
	} finally {
		await context.close();
	}
});

test('missing guides return 404 and unsuccessful searches keep a useful topic overview', async ({
	page
}) => {
	const response = await page.request.get('/help/reader/unbekannte-anleitung');
	expect(response.status()).toBe(404);
	await page.goto('/help?q=zzzzunbekannt');
	await expect(
		page.getByRole('heading', { name: 'Für diese Suche gibt es noch keinen Treffer.' })
	).toBeVisible();
	await expect(page.locator('a#reader')).toBeVisible();
});
