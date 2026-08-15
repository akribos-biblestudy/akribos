import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import { highlightStyles, users, verseHighlights } from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Partial (word-range) verse highlights, and the guarantee that a highlight created before this
 * feature existed — whole verse, no resource or word range — keeps applying to every translation
 * after the migration that added `resource_id`/`start_word`/`end_word`.
 *
 * Each test registers its own account, the same way `account.e2e.ts` does, so concurrent tests never
 * race over the same user's highlight rows.
 */

function uniqueEmail(): string {
	return `e2e-hl-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const PASSWORD = 'ein-sicheres-passwort';

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
}

function databaseUrl(): string {
	return (
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs')
	);
}

/**
 * Selects text inside one translation's rendering of one verse, ignoring the verse-number link, then
 * dispatches the `mouseup` the reader listens for — all inside one `page.evaluate` so the selection
 * cannot be cleared by a round-trip back to Playwright in between.
 *
 * `needle` names an exact substring to select; omitting it selects the verse's entire rendered text,
 * which is how a reader would highlight the whole verse (in every translation) by dragging across it.
 */
async function selectVerseText(
	page: Page,
	resourceId: string,
	verseKey: string,
	needle?: string
): Promise<void> {
	await page.evaluate(
		({ resourceId, verseKey, needle }) => {
			const column = document.querySelector(`.flow-column[data-resource-id="${resourceId}"]`);
			const verseEl = column?.querySelector<HTMLElement>(`[data-verse-key="${verseKey}"]`);
			if (!verseEl) throw new Error(`verse not found: ${resourceId} ${verseKey}`);

			const textNodes: Text[] = [];
			for (const container of verseEl.querySelectorAll('.verse-text')) {
				const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
				let node: Node | null;
				while ((node = walker.nextNode())) textNodes.push(node as Text);
			}

			const combined = textNodes.map((node) => node.textContent ?? '').join('');
			const target = needle ?? combined;
			const start = combined.indexOf(target);
			if (start < 0) throw new Error(`text not found in verse: "${target}"`);
			const end = start + target.length;

			const range = document.createRange();
			let position = 0;
			for (const node of textNodes) {
				const text = node.textContent ?? '';
				const nodeStart = position;
				const nodeEnd = position + text.length;
				if (start >= nodeStart && start <= nodeEnd) range.setStart(node, start - nodeStart);
				if (end >= nodeStart && end <= nodeEnd) range.setEnd(node, end - nodeStart);
				position = nodeEnd;
			}

			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			verseEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		},
		{ resourceId, verseKey, needle }
	);
}

test('a partial highlight applies only in the translation it was selected in', async ({ page }) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	// "er seinen" is plain, untagged text in both SEEDDE and SEEDPLAIN's rendering of verse 16, so it
	// is a safe run to select without landing on a Strong's-tagged word or a footnote marker.
	await selectVerseText(page, 'SEEDDE', '43:3:16', 'er seinen');

	const swatches = page.locator('.swatches .swatch');
	await expect(swatches).toHaveCount(10);
	await swatches.first().click();

	const seeddeHighlight = page.locator(
		'.flow-column[data-resource-id="SEEDDE"] [data-verse-key="43:3:16"] .partial-highlight'
	);
	await expect(seeddeHighlight.first()).toHaveCSS('background-color', 'rgb(255, 241, 198)');

	const seedplainHighlight = page.locator(
		'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"] .partial-highlight'
	);
	await expect(seedplainHighlight).toHaveCount(0);

	// The whole-verse background must not have been touched by a translation-specific selection.
	await expect(
		page.locator('.flow-column[data-resource-id="SEEDDE"] [data-verse-key="43:3:16"]').first()
	).not.toHaveCSS('background-color', 'rgb(255, 241, 198)');

	await page.screenshot({
		path: 'docs/screenshots/issue-128-partial-highlight-one-column.png'
	});

	// Survives a reload, not just the optimistic UI update.
	await page.reload();
	await expect(seeddeHighlight.first()).toHaveCSS('background-color', 'rgb(255, 241, 198)');
	await expect(seedplainHighlight).toHaveCount(0);
});

test('selecting an entire verse highlights it for every translation, like the verse-number menu', async ({
	page
}) => {
	await register(page, uniqueEmail());

	await page.goto('/Joh3');
	await selectVerseText(page, 'SEEDDE', '43:3:17');

	const swatches = page.locator('.swatches .swatch');
	await expect(swatches).toHaveCount(10);
	await swatches.first().click();

	const seeddeVerse = page.locator(
		'.flow-column[data-resource-id="SEEDDE"] [data-verse-key="43:3:17"]'
	);
	const seedplainVerse = page.locator(
		'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:17"]'
	);
	await expect(seeddeVerse).toHaveCSS('background-color', 'rgb(255, 241, 198)');
	await expect(seedplainVerse).toHaveCSS('background-color', 'rgb(255, 241, 198)');
});

test('a whole-verse highlight created before partial highlights existed keeps applying to every translation', async ({
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

		// The exact shape every highlight had before this feature: no resource, no word range. Verse 17
		// is one only SEEDDE and SEEDPLAIN both contain, so it can assert the colour shows in both.
		await db.insert(verseHighlights).values({
			userId: account!.id,
			styleId: style!.id,
			bookId: 43,
			chapter: 3,
			verse: 17
		});
	} finally {
		await client.end();
	}

	await page.goto('/Joh3');
	const seeddeVerse = page.locator(
		'.flow-column[data-resource-id="SEEDDE"] [data-verse-key="43:3:17"]'
	);
	const seedplainVerse = page.locator(
		'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:17"]'
	);
	await expect(seeddeVerse).toHaveCSS('background-color', 'rgb(18, 52, 86)');
	await expect(seedplainVerse).toHaveCSS('background-color', 'rgb(18, 52, 86)');

	await page.screenshot({
		path: 'docs/screenshots/issue-128-legacy-highlight-all-columns.png'
	});
});
