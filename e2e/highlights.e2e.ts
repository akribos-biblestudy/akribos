import { expect, test, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { highlightStyles, users, verseHighlights } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Marking verses from a verse number's menu, which is the only way to do it: selecting text marks
 * nothing, and there is no gesture that produces a highlight.
 *
 * The stored shape still supports a word range inside one translation and a section spanning several
 * verses (see `verseHighlights` in `src/lib/server/db/schema.ts`). Nothing writes those any more, but
 * highlights written while a selection UI existed are still displayed, which the tests below cover by
 * inserting them directly.
 *
 * Each test registers its own account, the same way `account.e2e.ts` does, so concurrent tests never
 * race over the same user's highlight rows.
 */

function uniqueEmail(): string {
	return `e2e-hl-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const PASSWORD = 'ein-sicheres-passwort';
const JOHN_16 = '43:3:16';
const JOHN_17 = '43:3:17';
const FIRST_SWATCH_COLOR = 'rgb(255, 241, 198)';

async function register(page: Page, email: string): Promise<void> {
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

	// The product tour auto-opens the first time a fresh account visits the reader and sits on top of
	// the verse text and verse numbers these tests use. Marking it done is the same request the tour
	// makes when it is closed.
	await page.evaluate(() => fetch('/api/tour', { method: 'POST' }));
}

function databaseUrl(): string {
	return (
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs')
	);
}

function verse(page: Page, resourceId: string, verseKey: string): Locator {
	return page.locator(
		`.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"]`
	);
}

/** Every run carrying translation-specific highlight ink, tagged words included. */
function markedRuns(page: Page, resourceId: string, verseKey: string): Locator {
	const scope = `.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"]`;
	return page.locator(`${scope} .partial-highlight, ${scope} .has-highlight`);
}

const swatches = (page: Page): Locator => page.locator('.swatches .swatch');

/** Opens a verse's own menu, the only place a colour can be picked. */
async function openVerseMenu(page: Page, resourceId: string, verseKey: string): Promise<void> {
	await verse(page, resourceId, verseKey).getByRole('link', { name: /Vers/ }).first().click();
}

/** The id of the account that just registered, for tests that seed rows the UI cannot create. */
async function accountId(email: string): Promise<string> {
	const { client, db } = createDb(databaseUrl(), { max: 1 });
	try {
		const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
		if (!account) throw new Error('account not found');
		return account.id;
	} finally {
		await client.end();
	}
}

test('the verse menu highlights a verse in every translation', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await openVerseMenu(page, 'SEEDDE', JOHN_17);

	await expect(swatches(page)).toHaveCount(10);
	await swatches(page).first().click();

	// Verse 17 is one both fixture translations contain, so the colour has to show in both.
	await expect(verse(page, 'SEEDDE', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
	await expect(verse(page, 'SEEDPLAIN', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);

	// Survives a reload, not just the optimistic UI update.
	await page.reload();
	await expect(verse(page, 'SEEDDE', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
});

test('picking the active colour again clears the verse', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await openVerseMenu(page, 'SEEDDE', JOHN_17);
	await swatches(page).first().click();
	await expect(verse(page, 'SEEDDE', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);

	await openVerseMenu(page, 'SEEDDE', JOHN_17);
	await expect(swatches(page).first()).toHaveAttribute('aria-pressed', 'true');
	await swatches(page).first().click();

	await expect(verse(page, 'SEEDDE', JOHN_17)).not.toHaveCSS(
		'background-color',
		FIRST_SWATCH_COLOR
	);
	await page.reload();
	await expect(verse(page, 'SEEDDE', JOHN_17)).not.toHaveCSS(
		'background-color',
		FIRST_SWATCH_COLOR
	);
});

test('selecting verse text marks nothing and leaves the browser its own selection', async ({
	page
}) => {
	await register(page, uniqueEmail());
	await page.goto('/Joh3');

	const target = verse(page, 'SEEDDE', JOHN_16).locator('.verse-text').last();
	await target.hover();
	const box = (await target.boundingBox())!;

	await page.mouse.move(box.x + 4, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 10 });
	await page.mouse.up();

	// No palette, no menu: a drag across the text is a text selection and nothing else.
	await expect(swatches(page)).toHaveCount(0);
	await expect(page.getByRole('menu')).toHaveCount(0);

	// And the browser's own selection still works, so the text can be copied.
	expect(await page.evaluate(() => window.getSelection()?.toString().trim().length ?? 0)) //
		.toBeGreaterThan(0);
});

test('a stored word range is still painted, in its own translation only', async ({ page }) => {
	const email = uniqueEmail();
	await register(page, email);
	const userId = await accountId(email);

	const { client, db } = createDb(databaseUrl(), { max: 1 });
	try {
		const [style] = await db
			.insert(highlightStyles)
			.values({ userId, color: '#123456' })
			.returning();

		// "er seinen" in SEEDDE's rendering of verse 16 — the shape a word selection used to write.
		await db.insert(verseHighlights).values({
			userId,
			styleId: style!.id,
			bookId: 43,
			chapter: 3,
			verse: 16,
			endVerse: 16,
			resourceId: 'SEEDDE',
			startWord: 9,
			endWord: 10
		});
	} finally {
		await client.end();
	}

	await page.goto('/Joh3');
	const marked = markedRuns(page, 'SEEDDE', JOHN_16);
	await expect(marked.first()).toHaveCSS('background-color', 'rgb(18, 52, 86)');
	expect(await marked.evaluateAll((els) => els.map((el) => el.textContent).join(''))).toBe(
		'er seinen'
	);
	await expect(markedRuns(page, 'SEEDPLAIN', JOHN_16)).toHaveCount(0);
});

test('a stored section spanning two verses is still painted across both', async ({ page }) => {
	const email = uniqueEmail();
	await register(page, email);
	const userId = await accountId(email);

	const { client, db } = createDb(databaseUrl(), { max: 1 });
	try {
		const [style] = await db
			.insert(highlightStyles)
			.values({ userId, color: '#123456' })
			.returning();

		// From "seinen" in verse 16 through "Sohn" in verse 17: two endpoints, spread over the verses
		// in between at render time.
		await db.insert(verseHighlights).values({
			userId,
			styleId: style!.id,
			bookId: 43,
			chapter: 3,
			verse: 16,
			endVerse: 17,
			resourceId: 'SEEDDE',
			startWord: 10,
			endWord: 4
		});
	} finally {
		await client.end();
	}

	await page.goto('/Joh3');
	const first = await markedRuns(page, 'SEEDDE', JOHN_16).evaluateAll((els) =>
		els.map((el) => el.textContent).join('')
	);
	const second = await markedRuns(page, 'SEEDDE', JOHN_17).evaluateAll((els) =>
		els.map((el) => el.textContent).join('')
	);

	// Verse 16 from "seinen" to its end, verse 17 from its start through "Sohn".
	expect(first).toContain('seinen');
	expect(first).toContain('gab');
	expect(first).not.toContain('daß');
	expect(second).toContain('Denn');
	expect(second).toContain('Sohn');
	expect(second).not.toContain('richten');
});

/**
 * Perceptual lightness (0 dark, 1 light) of a computed `color` value, whichever notation the browser
 * serialized it in — recent Chromium reports `oklch(L C H)` for colors declared via modern CSS color
 * functions, where `L` already is that lightness, rather than `rgb(r g b)`.
 */
function lightness(color: string): number {
	const oklch = /^oklch\(([\d.]+)/.exec(color);
	if (oklch) return Number(oklch[1]);
	const [r, g, b] = color
		.match(/\d+/g)!
		.slice(0, 3)
		.map((value) => Number(value) / 255);
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

test('highlighted text stays dark, readable ink in dark mode, not the light body text color', async ({
	page
}) => {
	const email = uniqueEmail();
	await register(page, email);
	const userId = await accountId(email);

	const { client, db } = createDb(databaseUrl(), { max: 1 });
	try {
		const [style] = await db
			.insert(highlightStyles)
			.values({ userId, color: '#fff1c6' })
			.returning();

		// One of each kind: a word range in verse 16, a whole verse in 17.
		await db.insert(verseHighlights).values([
			{
				userId,
				styleId: style!.id,
				bookId: 43,
				chapter: 3,
				verse: 16,
				endVerse: 16,
				resourceId: 'SEEDDE',
				startWord: 9,
				endWord: 10
			},
			{ userId, styleId: style!.id, bookId: 43, chapter: 3, verse: 17, endVerse: 17 }
		]);
	} finally {
		await client.end();
	}

	await page.goto('/Joh3');
	const marked = markedRuns(page, 'SEEDDE', JOHN_16).first();
	const wholeVerse = verse(page, 'SEEDDE', JOHN_17);
	await expect(marked).toBeVisible();

	await page.getByRole('button', { name: 'Dunkles Design' }).click();

	// The dark-mode body text color is light; a highlighted run must not inherit it, since the
	// highlighter palette stays light pastel backgrounds in every theme.
	const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
	expect(lightness(bodyColor)).toBeGreaterThan(0.7);

	expect(lightness(await marked.evaluate((el) => getComputedStyle(el).color))).toBeLessThan(0.4);
	expect(lightness(await wholeVerse.evaluate((el) => getComputedStyle(el).color))).toBeLessThan(
		0.4
	);
});

test('a whole-verse highlight created before sections existed keeps applying to every translation', async ({
	page
}) => {
	const email = uniqueEmail();
	await register(page, email);
	const userId = await accountId(email);

	const { client, db } = createDb(databaseUrl(), { max: 1 });
	try {
		const [style] = await db
			.insert(highlightStyles)
			.values({ userId, color: '#123456' })
			.returning();

		// The exact shape every highlight had before word ranges and sections existed: no resource, no
		// word range, and `end_verse` equal to the verse — which is what the migration backfilled.
		await db.insert(verseHighlights).values({
			userId,
			styleId: style!.id,
			bookId: 43,
			chapter: 3,
			verse: 17,
			endVerse: 17
		});
	} finally {
		await client.end();
	}

	await page.goto('/Joh3');
	await expect(verse(page, 'SEEDDE', JOHN_17)).toHaveCSS('background-color', 'rgb(18, 52, 86)');
	await expect(verse(page, 'SEEDPLAIN', JOHN_17)).toHaveCSS('background-color', 'rgb(18, 52, 86)');

	await page.screenshot({
		path: 'docs/screenshots/issue-128-legacy-highlight-all-columns.png'
	});
});
