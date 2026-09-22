import { expect, test, type Locator, type Page } from '@playwright/test';
import { Document, FootnoteReferenceRun, Packer, Paragraph, TextRun } from 'docx';
import { strFromU8, unzipSync } from 'fflate';
import { createDb } from '../src/lib/server/db/client.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

async function login(page: Page, readerFontScale = 100) {
	const email = `footnotes-${crypto.randomUUID()}@example.com`;
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
			displayName: 'Fußnoten Test',
			readerFontScale,
			emailVerifiedAt: new Date(),
			tourCompletedAt: new Date()
		});
	} finally {
		await client.end();
	}
	// A device's own reading preference takes precedence over the account seed, including on login.
	await page
		.context()
		.addCookies([
			{ name: 'reader-font-scale', value: String(readerFontScale), url: 'http://localhost:4173' }
		]);
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL('/account');
}

async function savedDocument(page: Page) {
	const id = new URL(page.url()).pathname.split('/').at(-1)!;
	const response = await page.request.get(`/api/documents/${id}`);
	expect(response.ok()).toBe(true);
	return (await response.json()).document;
}

async function expectTextInEditorViewport(target: Locator) {
	await expect
		.poll(async () =>
			target.evaluate((element) => {
				const host = element.closest('.editor-host')!;
				const viewport = host.getBoundingClientRect();
				const toolbar = host.closest('.document-editor')!.querySelector('.editor-toolbar')!;
				const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
				let text: Node | null;
				while ((text = walker.nextNode())) {
					if (!text.textContent?.trim()) continue;
					const range = document.createRange();
					range.setStart(text, 0);
					range.setEnd(text, 1);
					const glyph = range.getBoundingClientRect();
					return (
						glyph.top >= Math.max(viewport.top, toolbar.getBoundingClientRect().bottom) &&
						glyph.bottom <= Math.min(viewport.bottom, window.innerHeight)
					);
				}
				return false;
			})
		)
		.toBe(true);
}

test('mobile Zen scrolls to a distant footnote and returns to the chosen repeated reference', async ({
	page
}) => {
	test.setTimeout(60_000);
	await login(page, 140);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/notes');
	await page.getByRole('button', { name: 'Neue Notiz', exact: true }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
	const paragraphs = Array.from(
		{ length: 12 },
		(_, index) =>
			`Absatz ${index + 1}. Fürsorge und Lehre brauchen Zeit zum Lesen und zum Nachdenken. ` +
			'Der längere Text trennt die Quellenangabe deutlich von ihrer Fußnote.'
	).join('\n\n');
	const markdown =
		'Eine erste Quellenangabe.[^quelle]\n\n' +
		paragraphs +
		'\n\nEine andere Quelle.[^zweite]\n\nDie erste Quelle erneut.[^quelle]\n\n' +
		'[^quelle]: Eine **formatierte Quellenangabe** mit einem sichtbaren ersten Absatz.\n\n' +
		'    Ein zweiter Absatz bleibt ebenfalls bearbeitbar.\n\n' +
		'[^zweite]: Eine ergänzende Quellenangabe.\n';
	await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
	await page.getByRole('textbox', { name: 'Markdown', exact: true }).fill(markdown);
	await page.getByRole('tab', { name: 'Visuell', exact: true }).click();
	await page.getByRole('button', { name: 'Zen-Modus', exact: true }).click();
	const zen = page.getByRole('dialog', { name: 'Zen-Modus', exact: true });
	await expect(zen.locator('.document-prose')).toHaveCSS('font-size', '23.8px');
	await expect(zen.locator('sup[data-footnote-ref]')).toHaveCount(3);
	await expect(zen.locator('li[data-footnote-id]')).toHaveCount(2);
	const sources = zen.locator('sup[data-footnote-ref="quelle"]');
	const definition = zen.locator('li[data-footnote-id="quelle"] p').first();
	for (const occurrence of [0, 1]) {
		const source = sources.nth(occurrence);
		await source.click();
		await expect(zen.getByRole('button', { name: 'Zur Textstelle', exact: true })).toBeVisible();
		await expectTextInEditorViewport(definition);
		await zen.getByRole('button', { name: 'Zur Textstelle', exact: true }).click();
		await expectTextInEditorViewport(source);
		await expect
			.poll(() =>
				source.evaluate((element) =>
					element.parentElement!.contains(getSelection()?.anchorNode ?? null)
				)
			)
			.toBe(true);
	}
	await expect(zen.locator('.footnote-actions')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('a visual footnote is one undo step and survives rich editing, Markdown, saving and mobile Zen', async ({
	page
}) => {
	test.setTimeout(60_000);
	await login(page, 140);
	await page.goto('/notes');
	await page.getByRole('button', { name: 'Neue Notiz', exact: true }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
	await page.getByLabel('Titel').fill('Eine Notiz mit Fußnote');
	const prose = page.locator('.document-prose');
	await prose.fill('Ein Gedanke mit einer Quelle.');
	await prose.press('Control+End');
	await page.getByRole('button', { name: 'Fußnote einfügen', exact: true }).click();
	await expect(prose.locator('sup[data-footnote-ref]')).toHaveCount(1);
	await expect(prose.locator('li[data-footnote-id]')).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Fußnote entfernen', exact: true })).toBeVisible();
	const id = await prose.locator('sup[data-footnote-ref]').getAttribute('data-footnote-ref');
	await prose.press('Control+z');
	await expect(prose.locator('sup[data-footnote-ref]')).toHaveCount(0);
	await expect(prose.locator('li[data-footnote-id]')).toHaveCount(0);
	await prose.press('Control+Shift+z');
	await expect(prose.locator('sup[data-footnote-ref]')).toHaveAttribute('data-footnote-ref', id!);
	await prose.press('Control+s');
	await expect.poll(async () => (await savedDocument(page)).bodyMarkdown).toContain(`[^${id}]:`);
	await page.reload();
	await expect(prose.locator('sup[data-footnote-ref]')).toHaveAttribute('data-footnote-ref', id!);
	await expect(prose.locator('li[data-footnote-id]')).toHaveCount(1);
	const definition = prose.locator('li[data-footnote-id] p').first();
	await definition.fill('Eine ausführliche Erklärung mit Joh 3,16.');
	await definition.selectText();
	await page.keyboard.press('Control+b');
	await expect(prose.locator('li[data-footnote-id] strong')).toContainText(
		'ausführliche Erklärung'
	);
	await prose.press('Control+s');
	await expect(page.locator('.save-status')).toHaveText('Gespeichert');
	await expect.poll(async () => (await savedDocument(page)).bodyMarkdown).toContain(`[^${id}]:`);
	await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(/\[\^[^\]]+\]:.*\*\*/);
	await page.getByRole('tab', { name: 'Visuell', exact: true }).click();
	await page.reload();
	await expect(prose.locator('sup[data-footnote-ref]')).toHaveAttribute('data-footnote-ref', id!);
	await expect(prose.locator('li[data-footnote-id] strong')).toContainText(
		'ausführliche Erklärung'
	);
	const saved = await savedDocument(page);
	expect(saved.bodyHtml).not.toContain('id="footnote-');
	expect(saved.bodyMarkdown).not.toContain('data-footnote');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(prose).toHaveCSS('font-size', '23.8px');
	await page.getByRole('button', { name: 'Zen-Modus', exact: true }).click();
	const zen = page.getByRole('dialog', { name: 'Zen-Modus', exact: true });
	await expect(zen.locator('sup[data-footnote-ref]')).toHaveCount(1);
	await expect(zen.locator('.document-prose')).toHaveCSS('font-size', '23.8px');
	expect(
		await zen
			.locator('li[data-footnote-id]')
			.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
	).toBeCloseTo(22.61, 1);
	await expect(zen.locator('li[data-footnote-id]')).toContainText('ausführliche Erklärung');
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.getByRole('button', { name: 'Zen-Modus beenden', exact: true }).click();
	await expect(zen).not.toBeVisible();
});

const mergedFootnotes =
	'Die Hauptaufgaben [^aufgaben_aelteste] der Ältesten sind ...\n\n' +
	'... die wirkliche Jünger Jesu sind [^juenger] ...\n\n' +
	'[^aufgaben_aelteste]: Entnommen aus „Christus und die Gemeinde“ von William MacDonald. ' +
	'Meiner Meinung nach sind diese Aufgaben nicht allesamt ausschließlich von den Ältesten durchzuführen, ' +
	'aber die Ältesten haben die Verantwortung über diese Dinge. [^juenger]: Siehe [Johannes 8,31](https://github.com/Joh8,31)\n';

test('the reported merged Markdown definitions import as two editable sermon footnotes and export completely', async ({
	page
}) => {
	test.setTimeout(60_000);
	await login(page);
	await page.goto('/notes/import');
	await page.getByLabel('Word-/Markdown-Dateien oder ZIP-Archiv').setInputFiles({
		name: 'Aelteste.md',
		mimeType: 'text/markdown',
		buffer: Buffer.from('---\ntitle: Älteste und Jünger\ntype: sermon\n---\n\n' + mergedFootnotes)
	});
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('sup[data-footnote-ref]')).toHaveCount(2);
	await expect(preview.locator('li[data-footnote-id]')).toHaveCount(2);
	await expect(preview.locator('li[data-footnote-id]').nth(1)).toContainText('Johannes 8,31');
	await preview.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
	const prose = page.locator('.document-prose');
	await expect(prose.locator('sup[data-footnote-ref]')).toHaveCount(2);
	await expect(prose.locator('li[data-footnote-id]')).toHaveCount(2);
	const document = await savedDocument(page);
	expect(document.kind).toBe('sermon');
	expect(document.bodyMarkdown.match(/^\[\^[^\]]+\]:/gm)).toHaveLength(2);
	expect(document.plainText).toContain('William MacDonald');
	expect(document.plainText).toContain('Johannes 8,31');
	await page.reload();
	await expect(prose.locator('li[data-footnote-id]').nth(1)).toContainText('Johannes 8,31');
	const id = new URL(page.url()).pathname.split('/').at(-1)!;
	for (const extension of ['md', 'docx', 'pdf']) {
		const response = await page.request.get(`/notes/${id}/export.${extension}`);
		expect(response.ok()).toBe(true);
		expect(response.headers()['content-disposition']).toContain('attachment');
		if (extension === 'md') {
			expect((await response.text()).match(/^\[\^[^\]]+\]:/gm)).toHaveLength(2);
		} else if (extension === 'docx') {
			const files = unzipSync(await response.body());
			const notes = strFromU8(files['word/footnotes.xml']!);
			expect(notes).toContain('William MacDonald');
			expect(notes).toContain('Johannes 8,31');
		} else expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');
	}
});

test('a real Word file preserves two native formatted footnotes through preview, save and reload', async ({
	page
}) => {
	test.setTimeout(60_000);
	await login(page);
	const buffer = await Packer.toBuffer(
		new Document({
			sections: [
				{
					children: [
						new Paragraph({
							children: [
								new TextRun('Erste Aussage'),
								new FootnoteReferenceRun(4),
								new TextRun(' und zweite Aussage'),
								new FootnoteReferenceRun(9)
							]
						})
					]
				}
			],
			footnotes: {
				4: {
					children: [
						new Paragraph({
							children: [new TextRun({ text: 'Formatierte erste Quelle', bold: true })]
						}),
						new Paragraph('Zweiter Absatz der ersten Fußnote.')
					]
				},
				9: { children: [new Paragraph('Zweite Quelle zu Joh 3,16.')] }
			}
		})
	);
	await page.goto('/notes/import');
	await page.getByLabel('Word-/Markdown-Dateien oder ZIP-Archiv').setInputFiles({
		name: 'Native-Fussnoten.docx',
		mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		buffer
	});
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('sup[data-footnote-ref]')).toHaveCount(2);
	await expect(preview.locator('li[data-footnote-id]')).toHaveCount(2);
	await expect(preview.locator('li[data-footnote-id] strong')).toHaveText(
		'Formatierte erste Quelle'
	);
	await preview.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+/);
	await expect(page.locator('.document-prose li[data-footnote-id]')).toHaveCount(2);
	const saved = await savedDocument(page);
	expect(saved.bodyMarkdown.match(/^\[\^[^\]]+\]:/gm)).toHaveLength(2);
	expect(saved.bodyMarkdown).toContain('**Formatierte erste Quelle**');
	expect(saved.plainText).toContain('Zweiter Absatz der ersten Fußnote.');
	await page.reload();
	await expect(page.locator('.document-prose li[data-footnote-id] strong')).toHaveText(
		'Formatierte erste Quelle'
	);
	await expect(page.locator('.document-prose li[data-footnote-id]').nth(1)).toContainText(
		'Zweite Quelle'
	);
});
