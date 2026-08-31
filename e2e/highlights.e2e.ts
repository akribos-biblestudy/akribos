import { expect, test, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { highlightStyles, users, verseHighlights } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Marking passages: word ranges inside one translation, sections running across verses, and whole
 * verses picked by their numbers — plus the guarantee that a highlight created before any of this
 * existed keeps applying to every translation.
 *
 * These tests drive the real gesture (press, drag, release) rather than constructing a `Range` and
 * dispatching the event the reader happens to listen for. That is the whole point of the selection
 * model: there is no browser text selection involved any more, so a test can move a pointer the way a
 * reader does and the same code runs.
 *
 * Each test registers its own account, the same way `account.e2e.ts` does, so concurrent tests never
 * race over the same user's highlight rows.
 */

function uniqueEmail(): string {
	return `e2e-hl-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const PASSWORD = 'ein-sicheres-passwort';

/**
 * Word indices in the seeded SEEDDE text, which are what a highlight is stored against.
 *
 * Joh 3,16: Denn(0) also(1) hat(2) Gott(3) die(4) Welt(5) geliebt(6) ,(7) daß(8) er(9) seinen(10)
 * Sohn(11) gab.(12) — the comma is a token of its own here because the footnote marker between
 * "geliebt" and it closes the word, where punctuation otherwise stays glued to the word before it.
 *
 * Joh 3,17: Denn(0) Gott(1) hat(2) seinen(3) Sohn(4) nicht(5) gesandt,(6) um(7) zu(8) richten.(9)
 */
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
	// the verse text these tests press and drag on. Marking it done is the same request the tour makes
	// when it is closed.
	await page.evaluate(() => fetch('/api/tour', { method: 'POST' }));
}

function databaseUrl(): string {
	return (
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs')
	);
}

/** The run rendering one word. A word and the punctuation glued to it share an index, hence `first`. */
function word(page: Page, resourceId: string, verseKey: string, index: number): Locator {
	return page
		.locator(
			`.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"] [data-w="${index}"]`
		)
		.first();
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();
	if (!box) throw new Error('word is not visible');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The plain-text runs a translation-specific highlight paints. Tagged words carry the colour on
 *  their own button instead (`.has-highlight`), which `markedRuns` includes and this does not. */
function partialHighlights(page: Page, resourceId: string, verseKey: string): Locator {
	return page.locator(
		`.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"] .partial-highlight`
	);
}

/** Every run carrying highlight ink, tagged words included. */
function markedRuns(page: Page, resourceId: string, verseKey: string): Locator {
	return page.locator(
		`.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"] .partial-highlight, ` +
			`.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"] .has-highlight`
	);
}

function verse(page: Page, resourceId: string, verseKey: string): Locator {
	return page.locator(
		`.flow-column[data-resource-id="${resourceId}"] [data-verse-key="${verseKey}"]`
	);
}

/** Presses on one word and drags to another, the way a mouse or a stylus marks a passage. */
async function dragWords(
	page: Page,
	resourceId: string,
	from: { verseKey: string; index: number },
	to: { verseKey: string; index: number }
): Promise<void> {
	// Hovering first waits for the word to be visible, stable and hit-testable. Without it the boxes
	// can be measured against a layout the reader has not finished settling — the columns get their
	// widths after hydration — and the press then lands a word or two away from the intended one.
	const origin = word(page, resourceId, from.verseKey, from.index);
	await origin.hover();

	const start = await centerOf(origin);
	const end = await centerOf(word(page, resourceId, to.verseKey, to.index));

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	// The first move has to clear the drag threshold; below it a press stays a plain click.
	await page.mouse.move(start.x + 12, start.y);
	await page.mouse.move(end.x, end.y, { steps: 8 });
	await page.mouse.up();
}

const swatches = (page: Page): Locator => page.locator('.swatches .swatch');

test('a word selection applies only in the translation it was selected in', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	// "er seinen" is plain, untagged text in both translations' rendering of verse 16, so the drag
	// neither starts nor ends on a Strong's-tagged word or a footnote marker.
	await dragWords(
		page,
		'SEEDDE',
		{ verseKey: JOHN_16, index: 9 },
		{ verseKey: JOHN_16, index: 10 }
	);

	await expect(swatches(page)).toHaveCount(10);
	await swatches(page).first().click();

	const marked = partialHighlights(page, 'SEEDDE', JOHN_16);
	await expect(marked.first()).toHaveCSS('background-color', FIRST_SWATCH_COLOR);

	// "er seinen" is two words plus the space between them; the space must be its own highlighted
	// run too ("er", " ", "seinen"), so the highlight reads as one continuous phrase instead of two
	// separate words with a gap.
	await expect(marked).toHaveCount(3);
	for (const color of await marked.evaluateAll((elements) =>
		elements.map((element) => getComputedStyle(element).backgroundColor)
	)) {
		expect(color).toBe(FIRST_SWATCH_COLOR);
	}
	// A radius on the narrow whitespace-only span pinches its background into a pill and makes it look
	// shorter than the words on either side. Rectangular adjacent runs stay visually level.
	for (const radius of await marked.evaluateAll((elements) =>
		elements.map((element) => getComputedStyle(element).borderRadius)
	)) {
		expect(radius).toBe('0px');
	}

	await expect(partialHighlights(page, 'SEEDPLAIN', JOHN_16)).toHaveCount(0);

	// The whole-verse background must not have been touched by a translation-specific selection.
	await expect(verse(page, 'SEEDDE', JOHN_16).first()).not.toHaveCSS(
		'background-color',
		FIRST_SWATCH_COLOR
	);

	await page.screenshot({
		path: 'docs/screenshots/issue-128-partial-highlight-one-column.png'
	});

	// Survives a reload, not just the optimistic UI update.
	await page.reload();
	await expect(partialHighlights(page, 'SEEDDE', JOHN_16).first()).toHaveCSS(
		'background-color',
		FIRST_SWATCH_COLOR
	);
	await expect(partialHighlights(page, 'SEEDPLAIN', JOHN_16)).toHaveCount(0);
});

test('a section dragged across a verse boundary is stored and painted as one', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	// From "seinen" in verse 16 through "Sohn" in verse 17 — the case the previous selection model
	// dropped on the floor, because a range spanning two verses was simply ignored.
	await dragWords(
		page,
		'SEEDDE',
		{ verseKey: JOHN_16, index: 10 },
		{ verseKey: JOHN_17, index: 4 }
	);

	await expect(swatches(page)).toHaveCount(10);
	await swatches(page).first().click();

	const first = markedRuns(page, 'SEEDDE', JOHN_16);
	const second = markedRuns(page, 'SEEDDE', JOHN_17);

	async function assertPainted(): Promise<void> {
		// Verse 16 is painted from "seinen" to its end, verse 17 from its start through "Sohn".
		await expect(first.first()).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
		await expect(second.first()).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
		const inFirst = await first.evaluateAll((els) => els.map((el) => el.textContent).join(''));
		const inSecond = await second.evaluateAll((els) => els.map((el) => el.textContent).join(''));
		expect(inFirst).toContain('seinen');
		expect(inFirst).toContain('gab');
		expect(inFirst).not.toContain('Denn');
		expect(inFirst).not.toContain('daß');
		expect(inSecond).toContain('Denn');
		expect(inSecond).toContain('Sohn');
		expect(inSecond).not.toContain('richten');
		// It stays specific to the translation it was drawn in.
		await expect(markedRuns(page, 'SEEDPLAIN', JOHN_16)).toHaveCount(0);
		await expect(markedRuns(page, 'SEEDPLAIN', JOHN_17)).toHaveCount(0);
	}

	await assertPainted();
	await page.reload();
	await assertPainted();

	await page.screenshot({ path: 'docs/screenshots/verse-section-highlight.png' });
});

test('picking the same colour again clears the whole section', async ({ page }) => {
	// Registering an account and then marking the same section twice is a long test; under the full
	// suite's parallel load it needs more than the default budget.
	test.slow();
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await dragWords(
		page,
		'SEEDDE',
		{ verseKey: JOHN_16, index: 10 },
		{ verseKey: JOHN_17, index: 4 }
	);
	await swatches(page).first().click();
	await expect(markedRuns(page, 'SEEDDE', JOHN_17).first()).toBeVisible();

	// Selecting exactly the same section again must offer the swatch as active, so clicking it removes
	// the section rather than writing a second, identical one.
	await dragWords(
		page,
		'SEEDDE',
		{ verseKey: JOHN_16, index: 10 },
		{ verseKey: JOHN_17, index: 4 }
	);
	await expect(swatches(page).first()).toHaveAttribute('aria-pressed', 'true');
	await swatches(page).first().click();

	await expect(markedRuns(page, 'SEEDDE', JOHN_16)).toHaveCount(0);
	await expect(markedRuns(page, 'SEEDDE', JOHN_17)).toHaveCount(0);
	await page.reload();
	await expect(markedRuns(page, 'SEEDDE', JOHN_16)).toHaveCount(0);
	await expect(markedRuns(page, 'SEEDDE', JOHN_17)).toHaveCount(0);
});

test('a press that never moves stays a click, so a tagged word still opens its entry', async ({
	page
}) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	// "Gott" carries a Strong's number in verse 16.
	await word(page, 'SEEDDE', JOHN_16, 3).click();

	await expect(swatches(page)).toHaveCount(0);
	await expect(page.locator('[data-testid="study-sidebar"], aside').first()).toBeVisible();
});

test('a whole verse dragged end to end is highlighted in every translation', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	// Verse 17 runs from word 0 to word 9; covering it entirely means "this verse", which has always
	// applied everywhere rather than only in the column it was drawn in.
	await dragWords(page, 'SEEDDE', { verseKey: JOHN_17, index: 0 }, { verseKey: JOHN_17, index: 9 });

	await expect(swatches(page)).toHaveCount(10);
	await swatches(page).first().click();

	await expect(verse(page, 'SEEDDE', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
	await expect(verse(page, 'SEEDPLAIN', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
});

test('a verse section picked by its numbers applies to every translation', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	// The gesture-free path: open verse 16's menu, arm the section, then tap verse 17's number.
	await verse(page, 'SEEDDE', JOHN_16).getByRole('link', { name: /Vers/ }).first().click();
	await page.getByRole('menuitem', { name: 'Abschnitt ab hier markieren' }).click();
	await expect(page.getByRole('status')).toContainText('letzte Verszahl');

	await verse(page, 'SEEDDE', JOHN_17).getByRole('link', { name: /Vers/ }).first().click();
	await expect(swatches(page)).toHaveCount(10);
	await swatches(page).first().click();

	for (const resourceId of ['SEEDDE', 'SEEDPLAIN']) {
		for (const verseKey of [JOHN_16, JOHN_17]) {
			await expect(verse(page, resourceId, verseKey)).toHaveCSS(
				'background-color',
				FIRST_SWATCH_COLOR
			);
		}
	}

	await page.reload();
	await expect(verse(page, 'SEEDPLAIN', JOHN_17)).toHaveCSS('background-color', FIRST_SWATCH_COLOR);
});

test.describe('touch selection', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

	/**
	 * A finger resting on a word and then dragging. The hold is what separates selecting from
	 * scrolling, and it is timed by the reader rather than by the browser's own long-press — which is
	 * exactly the part that used to behave differently on every Android build and e-ink reader.
	 */
	async function touchDrag(
		page: Page,
		from: { verseKey: string; index: number },
		to: { verseKey: string; index: number }
	): Promise<void> {
		const common = { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true };
		// Dispatched on the word itself, so it is the event's target the way a real finger's would be;
		// the reader listens further up and resolves the far end from the coordinates.
		const origin = word(page, 'SEEDDE', from.verseKey, from.index);
		await origin.scrollIntoViewIfNeeded();
		const start = await centerOf(origin);

		await origin.dispatchEvent('pointerdown', { ...common, clientX: start.x, clientY: start.y });
		// Longer than the hold the reader waits for before the gesture becomes a selection.
		await page.waitForTimeout(500);
		// Measured after the hold: the far end is resolved from coordinates, so it must be read off a
		// layout that has finished settling rather than one from before the page was done loading.
		const end = await centerOf(word(page, 'SEEDDE', to.verseKey, to.index));
		await origin.dispatchEvent('pointermove', { ...common, clientX: end.x, clientY: end.y });
		await origin.dispatchEvent('pointerup', { ...common, clientX: end.x, clientY: end.y });
	}

	test('the palette opens as a bottom sheet that does not cover the selection', async ({
		page
	}) => {
		await register(page, uniqueEmail());
		await page.goto('/Joh3');

		await touchDrag(page, { verseKey: JOHN_16, index: 9 }, { verseKey: JOHN_16, index: 10 });
		await expect(swatches(page)).toHaveCount(10);

		// The hold and drag marked exactly the two words it ran across.
		const selectedText = await page
			.locator('.flow-column[data-resource-id="SEEDDE"] .selected')
			.evaluateAll((els) => els.map((el) => el.textContent).join(''));
		expect(selectedText).toBe('er seinen');

		const menu = page.getByRole('menu');
		const menuBox = (await menu.boundingBox())!;
		const selected = (await word(page, 'SEEDDE', JOHN_16, 9).boundingBox())!;
		const viewport = page.viewportSize()!;

		// Pinned across the bottom, spanning the screen, and starting below the words it was opened for.
		expect(menuBox.width).toBeGreaterThan(viewport.width * 0.9);
		expect(menuBox.y).toBeGreaterThan(selected.y + selected.height);
		expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);

		// A swatch has to be big enough to hit with a finger or a stylus first time.
		const swatch = (await swatches(page).first().boundingBox())!;
		expect(swatch.width).toBeGreaterThanOrEqual(32);
		expect(swatch.height).toBeGreaterThanOrEqual(32);

		await page.screenshot({ path: 'docs/screenshots/selection-sheet-mobile.png' });
	});

	test('a hold and drag marks a passage, a short tap does not', async ({ page }) => {
		await register(page, uniqueEmail());
		await page.goto('/Joh3');

		// A tap without the hold must leave the reader alone — it is how a page is scrolled and how a
		// tagged word is looked up.
		await word(page, 'SEEDDE', JOHN_16, 9).tap();
		await expect(swatches(page)).toHaveCount(0);

		await touchDrag(page, { verseKey: JOHN_16, index: 9 }, { verseKey: JOHN_16, index: 10 });
		await expect(swatches(page)).toHaveCount(10);

		await swatches(page).first().click();
		await expect(partialHighlights(page, 'SEEDDE', JOHN_16)).toHaveCount(3);
	});
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
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await dragWords(
		page,
		'SEEDDE',
		{ verseKey: JOHN_16, index: 9 },
		{ verseKey: JOHN_16, index: 10 }
	);
	await swatches(page).first().click();

	const marked = partialHighlights(page, 'SEEDDE', JOHN_16).first();

	await dragWords(page, 'SEEDDE', { verseKey: JOHN_17, index: 0 }, { verseKey: JOHN_17, index: 9 });
	await swatches(page).first().click();
	const wholeVerse = verse(page, 'SEEDDE', JOHN_17);

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

	const { client, db } = createDb(databaseUrl(), { max: 1 });
	try {
		const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
		expect(account).toBeDefined();

		const [style] = await db
			.insert(highlightStyles)
			.values({ userId: account!.id, color: '#123456' })
			.returning();

		// The exact shape every highlight had before this feature: no resource, no word range, and
		// `end_verse` equal to the verse — which is what the migration backfilled for existing rows.
		// Verse 17 is one both translations contain, so it can assert the colour shows in both.
		await db.insert(verseHighlights).values({
			userId: account!.id,
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
