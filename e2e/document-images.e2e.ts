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
	await page.setViewportSize({ width: 390, height: 844 });
	for (const id of [noteId, sermonId]) {
		await page.goto(`/notes/${id}`);
		await page
			.getByLabel('Bilddatei', { exact: true })
			.setInputFiles('e2e/fixtures/document-image.png');
		const image = page.locator('.tiptap img');
		await expect(image).toBeVisible();
		await expect
			.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
			.toBe(1200);
		await expect
			.poll(
				async () =>
					(await (await page.request.get(`/api/documents/${id}`)).json()).document.bodyMarkdown
			)
			.toContain('data:image/png;base64,');
		await page.reload();
		await expect(image).toBeVisible();
		expect(
			await image.evaluate((element) => element.getBoundingClientRect().width)
		).toBeLessThanOrEqual(390);
		expect((await request.get(`/api/documents/${id}`)).status()).toBe(401);
		await page.screenshot({
			path: testInfo.outputPath(`${id === noteId ? 'note' : 'sermon'}-image-mobile.png`)
		});
	}
	await page.goto(`/notes/${noteId}`);
	const source = await page.locator('.tiptap img').getAttribute('src');
	const controls = page.getByTestId('publication-controls');
	const slug = `bild-${crypto.randomUUID()}`;
	await controls.getByLabel('Webadresse').fill(slug);
	await controls.getByRole('button', { name: 'Schnappschuss freigeben' }).click();
	await expect(controls.getByRole('link', { name: 'Freigegebenen Link öffnen' })).toBeVisible();
	const publicContext = await browser.newContext();
	const publicPage = await publicContext.newPage();
	try {
		await publicPage.goto(`/notes/published/${slug}`);
		await expect(publicPage.locator('[data-testid="published-note"] img')).toHaveAttribute(
			'src',
			source!
		);
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
