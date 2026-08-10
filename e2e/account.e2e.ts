import { expect, test } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { resources, users, verseComments } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Accounts, verse lists and notes, and the admin area.
 *
 * Each test registers its own account so they can run in any order and in parallel without competing
 * for the same rows.
 */

function uniqueEmail(): string {
	return `e2e-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const PASSWORD = 'ein-sicheres-passwort';

/**
 * Registers an account and immediately follows the confirmation link, ending up signed in on
 * `/account` — the same end state this helper had before registration required activation. Every
 * other test in this file only cares about arriving there, not about the activation step itself
 * (see register.e2e.ts for tests of that step).
 */
async function register(page: import('@playwright/test').Page, email: string): Promise<void> {
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('E2E');
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/\/register\/check-email$/);

	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);
}

/** Verse lists live under their own section of the settings dashboard now, not a page of their own. */
async function gotoLists(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/account');
	await page.getByRole('button', { name: 'Verslisten & Kommentare' }).click();
}

test('registration, sign out and sign in again', async ({ page }) => {
	const email = uniqueEmail();
	await register(page, email);
	await expect(page.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();

	await page.getByRole('button', { name: 'Abmelden' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Lies den Text');

	// The public landing page proves the session is gone; protected pages must still redirect.
	await page.goto('/account');
	await expect(page).toHaveURL(/\/login/);

	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort').fill(PASSWORD);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page).toHaveURL(/\/account$/);
});

test('an API key can be created, shown once and revoked', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.getByLabel('Name', { exact: true }).fill('Meine App');
	await page.getByRole('radio', { name: /Auch persönliche Daten/ }).check();
	await page.getByRole('button', { name: 'Schlüssel erstellen' }).click();

	await expect(page.getByText('Schlüssel erstellt')).toBeVisible();
	const shownKey = (
		await page.locator('code').filter({ hasText: 'sk_akribos_' }).textContent()
	)?.trim();
	expect(shownKey).toMatch(/^sk_akribos_/);

	const keyItem = page.locator('li', { hasText: 'Meine App' });
	await expect(keyItem).toContainText('Auch persönliche Daten');

	// The raw key is never shown again after a reload — only its non-secret prefix.
	await page.reload();
	await expect(page.getByText('Schlüssel erstellt')).not.toBeVisible();
	await expect(page.locator('li', { hasText: 'Meine App' })).toContainText(shownKey!.slice(0, 19));

	await page.getByRole('button', { name: 'Widerrufen' }).click();
	await expect(page.locator('li', { hasText: 'Meine App' })).toContainText('Widerrufen am');
});

test('a reader gets a default highlight palette, can rename a colour and add one', async ({
	page
}) => {
	await register(page, uniqueEmail());

	// Versmarkierungen live under the "Darstellung" section of the settings dashboard now.
	await page.getByRole('button', { name: 'Darstellung' }).click();

	const rows = page.locator('form[action="?/renameHighlightStyle"]');
	await expect(rows).toHaveCount(10);
	expect(
		await rows
			.locator('xpath=preceding-sibling::span[@data-color]')
			.evaluateAll((swatches) => swatches.map((swatch) => (swatch as HTMLElement).dataset.color))
	).toEqual([
		'#fff1c6',
		'#d6edcf',
		'#c5e3f4',
		'#f8c2c2',
		'#f8d6c1',
		'#e5e7eb',
		'#fbcfe8',
		'#e9d5ff',
		'#99f6e4',
		'#c7d2fe'
	]);

	await rows.first().getByRole('textbox').fill('Verheißungen');
	await rows.first().getByRole('button', { name: 'Speichern' }).click();

	// The name survives a reload — the whole point of naming a colour is to keep the label.
	await page.reload();
	await page.getByRole('button', { name: 'Darstellung' }).click();
	await expect(rows.first().getByRole('textbox')).toHaveValue('Verheißungen');

	const addForm = page.locator('form[action="?/addHighlightStyle"]');
	await addForm.locator('input[name="color"]').fill('#123456');
	await addForm.locator('input[name="name"]').fill('Meine Farbe');
	await addForm.getByRole('button', { name: 'Farbe hinzufügen' }).click();

	await expect(rows).toHaveCount(11);
	await expect(rows.last().getByRole('textbox')).toHaveValue('Meine Farbe');
});

test('a wrong password is refused', async ({ page }) => {
	const email = uniqueEmail();
	await register(page, email);
	await page.getByRole('button', { name: 'Abmelden' }).click();

	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort').fill('falsches-passwort');
	await page.getByRole('button', { name: 'Anmelden' }).click();

	await expect(page.getByRole('alert')).toContainText('falsch');
});

test('a verse list keeps its verses and notes', async ({ page }) => {
	await register(page, uniqueEmail());

	// Create a list from the settings dashboard's "Verslisten & Kommentare" section.
	await gotoLists(page);
	await page.getByPlaceholder('Neue Versliste').fill('Meine Studienliste');
	await page.getByRole('button', { name: 'Neue Versliste' }).click();
	await expect(page).toHaveURL(/\/lists\//);

	// Add a verse by reference.
	await page.getByPlaceholder('Joh 3,16').fill('Joh 3,16');
	await page.getByRole('button', { name: 'Zur Versliste hinzufügen' }).click();
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();
	await expect(page.getByText('Denn also hat Gott', { exact: false })).toBeVisible();

	// An empty list comment starts as a small bubble beside the verse and expands only on demand.
	await page.getByRole('button', { name: 'Kommentar hinzufügen' }).click();
	const noteForm = page.locator('form[action="?/saveNote"]');
	const editor = noteForm.getByRole('textbox', { name: 'Kommentar' });
	await editor.click();
	await editor.fill('Der bekannteste Vers');
	await noteForm.getByRole('button', { name: 'Speichern' }).click();

	// The note survives a reload.
	await page.reload();
	await expect(page.getByRole('button', { name: 'Kommentar bearbeiten' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Kommentar anzeigen' }).click();
	const savedComment = page.getByRole('button', { name: 'Kommentar bearbeiten' });
	await expect(savedComment).toContainText('Der bekannteste Vers');
	await savedComment.click();
	await expect(page.getByRole('textbox', { name: 'Kommentar' })).toContainText(
		'Der bekannteste Vers'
	);
});

test('reader comments belong to one verse and translation and become editable on click', async ({
	page
}) => {
	await register(page, uniqueEmail());
	await page.goto('/Joh3,16');
	const firstTranslation = page.locator('.flow-column').first();
	await expect(firstTranslation.getByRole('button', { name: 'Kommentar hinzufügen' })).toHaveCount(
		0
	);
	await firstTranslation.locator('a.verse-number', { hasText: /^16$/ }).click();
	await page.getByRole('menuitem', { name: /Kommentar für .* hinzufügen/ }).click();

	let form = firstTranslation.locator('form[action="?/saveVerseComment"]');
	await form.getByRole('textbox', { name: 'Kommentar' }).press('Escape');
	await expect(firstTranslation.locator('.verse-comment-row.with-comment')).toHaveCount(0);

	await firstTranslation.locator('a.verse-number', { hasText: /^16$/ }).click();
	await page.getByRole('menuitem', { name: /Kommentar für .* hinzufügen/ }).click();
	form = firstTranslation.locator('form[action="?/saveVerseComment"]');
	const editor = form.getByRole('textbox', { name: 'Kommentar' });
	await editor.evaluate((element) => {
		element.innerHTML = '<div>Nur für diese Übersetzung</div><div>Zweite Zeile</div>';
		element.dispatchEvent(new InputEvent('input', { bubbles: true }));
	});
	await editor.press('Control+Enter');
	await expect(firstTranslation.locator('.verse-comment-row.with-comment')).toBeVisible();

	// The second translation does not inherit the first translation's comment.
	await expect(page.locator('.flow-column').nth(1).locator('.comment-bubble')).toHaveCount(0);
	await page.reload();
	const commentRow = page
		.locator('.flow-column')
		.first()
		.locator('.verse-comment-row.with-comment');
	await expect(commentRow).toHaveCount(0);
	await page.getByRole('button', { name: 'Kommentar anzeigen' }).first().click();
	await expect(commentRow).toBeVisible();
	const saved = page.getByRole('button', { name: 'Kommentar bearbeiten' });
	await expect(saved.locator('.comment-html > div')).toHaveText([
		'Nur für diese Übersetzung',
		'Zweite Zeile'
	]);
	await saved.click();
	const reopenedEditor = page.getByRole('textbox', { name: 'Kommentar' });
	await expect(reopenedEditor).toContainText('Nur für diese Übersetzung');
	await reopenedEditor.press('Escape');
	await expect(reopenedEditor).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Kommentar bearbeiten' })).toBeVisible();
});

test('a shared list is readable without an account', async ({ page, browser }) => {
	await register(page, uniqueEmail());

	await gotoLists(page);
	await page.getByPlaceholder('Neue Versliste').fill('Geteilte Liste');
	await page.getByRole('button', { name: 'Neue Versliste' }).click();
	await page.getByPlaceholder('Joh 3,16').fill('1Mo 1,1');
	await page.getByRole('button', { name: 'Zur Versliste hinzufügen' }).click();

	await page.getByRole('button', { name: 'Teilen' }).click();
	const shareUrl = await page.locator('input[readonly]').inputValue();
	expect(shareUrl).toContain('/l/');

	// A fresh browser context has no session.
	const anonymous = await browser.newContext();
	const anonymousPage = await anonymous.newPage();
	await anonymousPage.goto(shareUrl);
	await expect(anonymousPage.getByRole('heading', { name: 'Geteilte Liste' })).toBeVisible();
	await expect(anonymousPage.getByRole('link', { name: '1.Mose 1,1' })).toBeVisible();
	await anonymous.close();
});

test('the verse menu creates a list and adds the verse in one step', async ({ page }) => {
	await register(page, uniqueEmail());

	// The point of the menu: no list has to exist first.
	await page.goto('/Joh3');
	await page.locator('#Joh3_16 a.verse-number').click();
	await page.getByRole('menuitem', { name: 'Neue Liste mit diesem Vers' }).click();

	await gotoLists(page);
	await expect(page.getByRole('link', { name: /Johannes 3,16/ })).toBeVisible();
	await page.getByRole('link', { name: /Johannes 3,16/ }).click();
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();
});

test('a signed-in reader can highlight a verse with a colour and clear it', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await page.locator('#Joh3_16 a.verse-number').click();

	const swatches = page.locator('.swatches .swatch');
	await expect(swatches).toHaveCount(10);
	await swatches.first().click();

	const verse = page.locator('[data-verse-key="43:3:16"]').first();
	await expect(verse).toHaveCSS('background-color', 'rgb(255, 241, 198)');

	// The colour survives a reload, not just the optimistic UI update.
	await page.reload();
	await expect(verse).toHaveCSS('background-color', 'rgb(255, 241, 198)');

	// The account links to a complete list for this colour, and the same data is available through
	// the personal API using the style id from that link.
	await page.goto('/account#appearance');
	await page.getByRole('button', { name: 'Darstellung' }).click();
	const showVerses = page.getByRole('link', { name: 'Verse anzeigen' }).first();
	const href = await showVerses.getAttribute('href');
	const styleId = href!.split('/').at(-1)!;
	const highlights = await page.evaluate(() =>
		fetch(`/api/v1/highlights?color=${encodeURIComponent('#FFF1C6')}&resource=SEEDDE`).then(
			(response) => response.json()
		)
	);
	expect(styleId).toBeTruthy();
	expect(highlights.verses).toEqual(
		expect.arrayContaining([expect.objectContaining({ book: 43, chapter: 3, verse: 16 })])
	);
	await showVerses.click();
	await expect(page.getByRole('link', { name: 'Johannes 3,16' })).toBeVisible();

	// Picking the same swatch again clears the highlight instead of re-applying it.
	await page.goto('/Joh3');
	await page.locator('#Joh3_16 a.verse-number').click();
	await expect(swatches.first()).toHaveAttribute('aria-pressed', 'true');
	await swatches.first().click();
	await expect(verse).not.toHaveCSS('background-color', 'rgb(255, 241, 198)');

	await page.reload();
	await expect(verse).not.toHaveCSS('background-color', 'rgb(255, 241, 198)');
});

test('the verse menu ticks and unticks an existing list', async ({ page }) => {
	await register(page, uniqueEmail());

	await gotoLists(page);
	await page.getByPlaceholder('Neue Versliste').fill('Merkverse');
	await page.getByRole('button', { name: 'Neue Versliste' }).click();

	await page.goto('/Joh3');
	const verse = page.locator('#Joh3_16 a.verse-number');

	await verse.click();
	await page.getByRole('menuitem', { name: 'Merkverse' }).click();
	await expect(page.locator('#Joh3_16 .verse-number.in-list')).toHaveCount(1);

	// Reopening shows it ticked, and clicking again takes the verse back out.
	await page.reload();
	await verse.click();
	await page.getByRole('menuitem', { name: 'Merkverse' }).click();
	await expect(page.locator('#Joh3_16 .verse-number.in-list')).toHaveCount(0);
	await page.reload();
	await expect(page.locator('#Joh3_16 .verse-number.in-list')).toHaveCount(0);
});

test('the verse menu offers signing in rather than a list', async ({ page }) => {
	await page.goto('/Joh3');
	await page.locator('#Joh3_16 a.verse-number').click();

	await expect(page.getByRole('menuitem', { name: 'Vers kopieren' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Zum Speichern anmelden' })).toBeVisible();
});

test('the admin area is hidden from a normal account', async ({ page }) => {
	await register(page, uniqueEmail());

	const response = await page.goto('/admin');
	expect(response?.status()).toBe(404);
});

test('an admin can see and edit resources', async ({ page }) => {
	// The seed script creates this account.
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden' }).click();

	await page.goto('/admin');
	await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
	await expect(page.getByText('Bibelübersetzung')).toBeVisible();

	await page.goto('/admin/resources');
	await expect(page.getByRole('button', { name: 'SEEDDE bearbeiten' })).toBeVisible();
	const resourceSearch = page.getByLabel('Ressourcen durchsuchen');
	await resourceSearch.fill('Testkommentar');
	await expect(page.getByRole('button', { name: 'SEEDCOMMENTARY bearbeiten' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'SEEDDE bearbeiten' })).toHaveCount(0);
	await resourceSearch.clear();
	await expect(page.getByRole('button', { name: 'SEEDDE bearbeiten' })).toBeVisible();

	// Editing the tab title takes effect in the reader without changing the selection labels.
	const tabTitle = page.locator('#tab-SEEDDE');
	await tabTitle.fill('Umbenannt');
	await page
		.locator('form[action="?/save"]')
		.filter({ has: tabTitle })
		.getByRole('button', { name: 'Speichern' })
		.click();

	await page.goto('/Joh3');
	await expect(page.locator('#column-0')).toContainText('Umbenannt');

	// Put it back, so the test can run again.
	await page.goto('/admin/resources');
	await page.locator('#tab-SEEDDE').fill('Testübersetzung');
	await page
		.locator('form[action="?/save"]')
		.filter({ has: page.locator('#tab-SEEDDE') })
		.getByRole('button', { name: 'Speichern' })
		.click();
});

test('deleting a Bible transfers every comment without overwriting collisions', async ({
	page
}) => {
	const suffix = Math.random().toString(36).slice(2, 9).toUpperCase();
	const sourceId = `DELETE_${suffix}`;
	const targetId = `TARGET_${suffix}`;
	const databaseUrl =
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(
			process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
		);
	const { client, db } = createDb(databaseUrl, { max: 1 });

	try {
		const [admin] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, 'admin@example.com'))
			.limit(1);
		expect(admin).toBeDefined();

		await db.insert(resources).values([
			{
				id: sourceId,
				kind: 'bible',
				name: 'Zu löschende Testbibel',
				abbrev: 'Quelle',
				language: 'de',
				isPublic: false,
				status: 'ready'
			},
			{
				id: targetId,
				kind: 'bible',
				name: 'Ziel-Testbibel',
				abbrev: 'Ziel',
				language: 'de',
				isPublic: false,
				status: 'ready'
			}
		]);
		await db.insert(verseComments).values([
			{
				userId: admin!.id,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 16,
				commentHtml: '<p>Kommentar aus der Quelle</p>'
			},
			{
				userId: admin!.id,
				resourceId: targetId,
				bookId: 43,
				chapter: 3,
				verse: 16,
				commentHtml: '<p>Kommentar am Ziel</p>'
			},
			{
				userId: admin!.id,
				resourceId: sourceId,
				bookId: 43,
				chapter: 3,
				verse: 17,
				commentHtml: '<p>Nur in der Quelle</p>'
			}
		]);

		await page.goto('/login');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden' }).click();
		await page.goto('/admin/resources');

		await page.getByRole('button', { name: `${sourceId} bearbeiten` }).click();
		const editor = page.locator('#resource-editor');
		await editor.getByRole('button', { name: 'Ressource löschen' }).click();
		await editor.getByLabel('Kommentare verschieben nach').selectOption(targetId);
		await editor.getByText('Zur Bestätigung').locator('..').getByRole('textbox').fill(sourceId);
		await editor.getByRole('button', { name: 'Endgültig löschen' }).click();
		await expect(page.getByText(`${sourceId} wurde gelöscht.`)).toBeVisible();

		const remaining = await db
			.select({ verse: verseComments.verse, html: verseComments.commentHtml })
			.from(verseComments)
			.where(and(eq(verseComments.userId, admin!.id), eq(verseComments.resourceId, targetId)));
		expect(remaining).toHaveLength(2);
		const merged = remaining.find((comment) => comment.verse === 16)?.html ?? '';
		expect(merged).toContain('Kommentar am Ziel');
		expect(merged).toContain('Kommentar aus der Quelle');
		expect(merged).toContain('Übertragen aus Quelle');
		expect(remaining.find((comment) => comment.verse === 17)?.html).toContain('Nur in der Quelle');
	} finally {
		await db.delete(verseComments).where(inArray(verseComments.resourceId, [sourceId, targetId]));
		await db.delete(resources).where(inArray(resources.id, [sourceId, targetId]));
		await client.end();
	}
});
