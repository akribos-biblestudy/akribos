import { expect, test, type Page } from '@playwright/test';
import { createDb } from '../src/lib/server/db/client.ts';
import { documents, users } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

async function fixture(page: Page) {
	const email = `images-${crypto.randomUUID()}@example.test`;
	const password = 'ein-sicheres-passwort';
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	let ids: string[];
	try {
		const [user] = await db
			.insert(users)
			.values({
				email,
				passwordHash: await hashPassword(password),
				role: 'admin',
				displayName: 'Bilder Test',
				emailVerifiedAt: new Date(),
				tourCompletedAt: new Date()
			})
			.returning();
		ids = (
			await db
				.insert(documents)
				.values([
					{
						userId: user.id,
						kind: 'note',
						title: 'Notiz mit Bild',
						bodyMarkdown: '',
						bodyHtml: '',
						plainText: ''
					},
					{
						userId: user.id,
						kind: 'sermon',
						title: 'Ausarbeitung mit Bild',
						sermonStatus: 'idea',
						bodyMarkdown: '',
						bodyHtml: '',
						plainText: ''
					}
				])
				.returning({ id: documents.id })
		).map((row) => row.id);
	} finally {
		await client.end();
	}
	await page.goto('/login?redirectTo=%2Faccount');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL('/account');
	return ids;
}

test('note and sermon images persist privately and a shared snapshot keeps its own image', async ({
	page,
	request,
	browser
}, testInfo) => {
	const [noteId, sermonId] = await fixture(page);
	for (const id of [noteId, sermonId]) {
		const viewport = id === noteId ? 'mobile' : 'desktop';
		await page.setViewportSize(
			viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 }
		);
		await page.goto(`/notes/${id}`);
		const toolbar = page.getByRole('toolbar', { name: 'Text formatieren' });
		const inserts = toolbar.getByRole('button', { name: /^(Fußnote|Tabelle|Bild) einfügen$/ });
		await expect(inserts).toHaveCount(3);
		for (const [index, name] of ['Fußnote', 'Tabelle', 'Bild'].entries()) {
			await expect(inserts.nth(index)).toHaveAccessibleName(`${name} einfügen`);
			await expect(inserts.nth(index).locator('svg')).toBeVisible();
			await expect(inserts.nth(index)).toHaveText('');
		}
		await page
			.getByLabel('Bilddatei', { exact: true })
			.setInputFiles('e2e/fixtures/document-image.png');
		const image = page.locator('.tiptap img[src]');
		await expect(image).toBeVisible();
		await expect
			.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
			.toBe(1200);
		await image.click();
		const imageOptions = page.getByRole('group', { name: 'Bild bearbeiten' });
		const alignment = imageOptions.getByLabel('Ausrichtung');
		const width = imageOptions.getByLabel('Maximale Breite');
		await expect(imageOptions).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(alignment).toBeFocused();
		await width.selectOption('50');
		await alignment.selectOption('center');
		await expect(image).toHaveAttribute('data-image-width', '50');
		await expect(image).toHaveAttribute('data-image-align', 'center');
		await alignment.selectOption('right');
		await expect(image).toHaveAttribute('data-image-align', 'right');
		await page.screenshot({ path: testInfo.outputPath(`image-popover-${viewport}.png`) });
		await page.keyboard.press('Escape');
		await expect(imageOptions).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Schreibe deine Gedanken …' })).toBeFocused();
		await expect
			.poll(
				async () =>
					(await (await page.request.get(`/api/documents/${id}`)).json()).document.bodyMarkdown
			)
			.toContain('"akribos:image:right:50"');
		await page.reload();
		await expect(image).toBeVisible();
		await expect(image).toHaveAttribute('data-image-width', '50');
		await expect(image).toHaveAttribute('data-image-align', 'right');
		const geometry = await image.evaluate((element) => {
			const { width, right } = element.getBoundingClientRect();
			const parent = element.parentElement!.getBoundingClientRect();
			return { widthRatio: width / parent.width, rightGap: parent.right - right };
		});
		expect(geometry.widthRatio).toBeCloseTo(0.5, 2);
		expect(geometry.rightGap).toBeCloseTo(0, 1);
		await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
		await expect(page.getByRole('textbox', { name: 'Markdown', exact: true })).toHaveValue(
			/"akribos:image:right:50"/u
		);
		await page.getByRole('tab', { name: 'Visuell', exact: true }).click();
		await expect(image).toHaveAttribute('data-image-width', '50');
		expect((await request.get(`/api/documents/${id}`)).status()).toBe(401);
		await page.screenshot({
			path: testInfo.outputPath(`${id === noteId ? 'note' : 'sermon'}-image-${viewport}.png`)
		});
	}
	await page.goto(`/notes/${noteId}`);
	const source = await page.locator('.tiptap img[src]').getAttribute('src');
	const controls = page.getByTestId('publication-controls');
	const slug = `bild-${crypto.randomUUID()}`;
	await controls.getByLabel('Webadresse').fill(slug);
	await controls.getByRole('button', { name: 'Schnappschuss freigeben' }).click();
	await expect(controls.getByRole('link', { name: 'Freigegebenen Link öffnen' })).toBeVisible();
	const publicContext = await browser.newContext();
	const publicPage = await publicContext.newPage();
	try {
		await publicPage.goto(`/notes/published/${slug}`);
		const image = publicPage.locator('[data-testid="published-note"] img');
		await expect(image).toHaveAttribute('src', source!);
		await expect(image).toHaveAttribute('data-image-width', '50');
		await expect(image).toHaveAttribute('data-image-align', 'right');
		await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
		await page
			.getByRole('textbox', { name: 'Markdown', exact: true })
			.fill('Neuer privater Entwurf ohne Bild');
		await expect
			.poll(
				async () =>
					(await (await page.request.get(`/api/documents/${noteId}`)).json()).document.bodyMarkdown
			)
			.toContain('Neuer privater Entwurf');
		await publicPage.reload();
		await expect(publicPage.locator('[data-testid="published-note"] img')).toHaveAttribute(
			'src',
			source!
		);
		await expect(publicPage.getByText('Neuer privater Entwurf ohne Bild')).toHaveCount(0);
	} finally {
		await publicContext.close();
	}
});
