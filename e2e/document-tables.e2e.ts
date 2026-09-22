import { expect, test, type Page } from '@playwright/test';
import { createDb } from '../src/lib/server/db/client.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

async function login(page: Page) {
	const email = `tables-${crypto.randomUUID()}@example.test`;
	const password = 'ein-sicheres-passwort';
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	try {
		await db.insert(users).values({
			email,
			passwordHash: await hashPassword(password),
			displayName: 'Tabellen Test',
			emailVerifiedAt: new Date(),
			tourCompletedAt: new Date()
		});
	} finally {
		await client.end();
	}
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL('/account');
}

async function saved(page: Page) {
	const id = new URL(page.url()).pathname.split('/').at(-1)!;
	return (await (await page.request.get(`/api/documents/${id}`)).json()).document;
}

test('a table can be inserted, edited, expanded and saved across Markdown mode and reload', async ({
	page
}, testInfo) => {
	await login(page);
	await page.goto('/notes');
	await page.getByRole('button', { name: 'Neue Notiz', exact: true }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
	await page.getByRole('button', { name: 'Tabelle einfügen', exact: true }).click();
	const table = page.locator('.tiptap table');
	await expect(table.locator('th')).toHaveCount(3);
	await expect(table.locator('td')).toHaveCount(6);
	await table.locator('th').first().click();
	await page.keyboard.insertText('Älteste');
	await page.keyboard.press('Tab');
	await page.keyboard.insertText('Diakone');
	await table.locator('td').first().click();
	await page.keyboard.insertText('Untadelig');
	await page.getByRole('combobox', { name: 'Zeile', exact: true }).selectOption('after');
	await expect(table.locator('tr')).toHaveCount(4);
	await page.getByRole('combobox', { name: 'Spalte', exact: true }).selectOption('after');
	await expect(table.locator('th')).toHaveCount(4);
	await page
		.getByRole('combobox', { name: 'Spalte ausrichten', exact: true })
		.selectOption('right');
	await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Markdown', exact: true })).toHaveValue(
		/\| Älteste \|[\s\S]*\| Untadelig \|/
	);
	await expect.poll(async () => (await saved(page)).bodyHtml).toContain('<table>');
	await expect.poll(async () => (await saved(page)).bodyMarkdown).toContain('Untadelig');
	await page.getByRole('tab', { name: 'Visuell', exact: true }).click();
	await expect(table.locator('th')).toHaveCount(4);
	await page.reload();
	await expect(table.locator('th')).toHaveCount(4);
	await expect(table.locator('tr')).toHaveCount(4);
	await expect(table).toContainText('Untadelig');
	await page.screenshot({ path: testInfo.outputPath('table-desktop.png') });
});

test('Markdown import retains real tables, blank cells and footnotes without horizontal page overflow on mobile', async ({
	page
}, testInfo) => {
	await login(page);
	const markdown =
		'| Älteste | Männer | Frauen |\n| :--- | :---: | ---: |\n| **Untadelig**[^a]<br> | Treu | |\n| Gastfrei | <code>x&#92;&#124;y</code> | Nüchtern[^b] |\n\n[^a]: Erste Erklärung.\n\n[^b]: Zweite Erklärung.\n';
	await page.goto('/notes/import');
	await page.getByLabel('Word-/Markdown-Dateien oder ZIP-Archiv').setInputFiles({
		name: 'Gemeinde.md',
		mimeType: 'text/markdown',
		buffer: Buffer.from(markdown)
	});
	await page.getByRole('button', { name: 'Importvorschau erstellen', exact: true }).click();
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('table')).toContainText('Untadelig');
	await preview.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
	await page.setViewportSize({ width: 390, height: 844 });
	const table = page.locator('.tiptap table');
	await expect(table.locator('th')).toHaveCount(3);
	await expect(table.locator('td')).toHaveCount(6);
	await expect(table.locator('sup[data-footnote-ref]')).toHaveCount(2);
	await expect(table.locator('td').nth(2)).toHaveText('');
	await expect
		.poll(() =>
			table.evaluate((element) => ({
				scrolls: element.scrollWidth > element.clientWidth,
				pageFits: document.documentElement.scrollWidth <= innerWidth
			}))
		)
		.toEqual({ scrolls: true, pageFits: true });
	await table.evaluate((element) => {
		element.scrollLeft = element.scrollWidth;
	});
	await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
	await table.locator('td').last().click();
	await page.keyboard.press('End');
	await page.keyboard.insertText(' ergänzt');
	await expect.poll(async () => (await saved(page)).bodyMarkdown).toContain('ergänzt');
	await page.reload();
	await expect(table.locator('th')).toHaveCount(3);
	await expect(page.locator('.tiptap li[data-footnote-id]')).toHaveCount(2);
	await expect(table.locator('td').last()).toContainText('ergänzt');
	// ProseMirror adds a non-persisted caret helper after the actual terminal hard break.
	await expect(
		table.locator('td').first().locator('br:not(.ProseMirror-trailingBreak)')
	).toHaveCount(1);
	expect((await saved(page)).bodyHtml.match(/<br>/g)).toHaveLength(1);
	await expect(table.locator('td code')).toHaveText('x\\|y');
	await page.screenshot({ path: testInfo.outputPath('table-mobile.png') });
});
