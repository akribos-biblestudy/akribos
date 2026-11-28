import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { users, verseListMembers, verseLists } from '../src/lib/server/db/schema.ts';

const password = 'ein-sicheres-passwort';
const listTitles = Array.from({ length: 12 }, (_, index) => `Studium ${index + 1}`);

async function openReaderWithCollections(page: Page): Promise<void> {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	const email = `e2e-verse-menu-${randomUUID()}@example.com`;
	try {
		const verifiedAt = new Date();
		const [reader, collaborator] = await db
			.insert(users)
			.values([
				{
					email,
					passwordHash: await hashPassword(password),
					emailVerifiedAt: verifiedAt,
					tourCompletedAt: verifiedAt
				},
				{ email: `shared-${email}`, emailVerifiedAt: verifiedAt }
			])
			.returning({ id: users.id });
		const lists = await db
			.insert(verseLists)
			.values(
				listTitles.map((title, index) => ({
					userId: index === 10 ? collaborator!.id : reader!.id,
					title,
					updatedAt: new Date(Date.UTC(2025, 1, index + 1))
				}))
			)
			.returning({ id: verseLists.id });
		await db.insert(verseListMembers).values({ listId: lists[10]!.id, userId: reader!.id });
	} finally {
		await client.end();
	}

	await page.goto('/login?redirectTo=%2Faccount');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort').fill(password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
	await page.goto('/Joh3,16');
}

function verseControls(page: Page) {
	const anchor = page.getByRole('link', { name: 'Vers Johannes 3,16', exact: true }).first();
	const menu = page.getByRole('menu', { name: 'Vers Johannes 3,16', exact: true });
	const palette = menu.getByRole('group', { name: 'Markieren' });
	const disclosure = menu.getByRole('menuitem', { name: 'Stellensammlungen' });
	const collections = menu.getByRole('group', { name: 'Stellensammlungen' });
	return { anchor, menu, palette, disclosure, collections };
}

test('the verse menu exposes recent collections on demand and retains recent usage', async ({
	page
}) => {
	await openReaderWithCollections(page);
	const { anchor, menu, palette, disclosure, collections } = verseControls(page);
	await anchor.press('Enter');
	await expect(palette.getByRole('menuitemcheckbox')).toHaveCount(10);
	await expect(palette.getByRole('menuitemcheckbox').first()).toBeFocused();
	await expect(menu.getByRole('menuitem')).toHaveText([
		'Vers kopieren',
		'Link kopieren',
		'Stellensammlungen'
	]);

	await page.keyboard.press('End');
	await expect(disclosure).toBeFocused();
	await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
	await expect(collections).toHaveCount(0);
	await page.keyboard.press('Enter');
	await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
	const entries = collections.getByRole('menuitemcheckbox');
	const initialOrder = listTitles.slice(-10).reverse();
	await expect(entries).toHaveText(initialOrder);
	await page.keyboard.press('ArrowDown');
	await expect(entries.first()).toBeFocused();

	const shared = collections.getByRole('menuitemcheckbox', { name: 'Studium 11', exact: true });
	const added = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			new URL(response.url()).searchParams.has('/addToList')
	);
	await page.keyboard.press('ArrowDown');
	await expect(shared).toBeFocused();
	await page.keyboard.press('Enter');
	expect((await added).ok()).toBe(true);
	await expect(anchor).toBeFocused();
	await anchor.press('Enter');
	await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
	await disclosure.click();
	await expect(entries).toHaveText([
		'Studium 11',
		...initialOrder.filter((title) => title !== 'Studium 11')
	]);
	await expect(shared).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);
	await expect(anchor).toBeFocused();
});

test.describe('touch', () => {
	test.use({ viewport: { width: 320, height: 600 }, hasTouch: true });

	test('ten colours and the expanded collection menu fit a narrow phone', async ({ page }) => {
		await openReaderWithCollections(page);
		const { anchor, menu, palette, disclosure, collections } = verseControls(page);
		await anchor.tap();
		const positions = await palette.getByRole('menuitemcheckbox').evaluateAll((buttons) =>
			buttons.map((button) => {
				const { x, y, width } = button.getBoundingClientRect();
				return { x, y, width };
			})
		);
		expect(positions).toHaveLength(10);
		expect(new Set(positions.map(({ y }) => y)).size).toBe(1);
		expect(positions.at(-1)!.x + positions.at(-1)!.width).toBeLessThanOrEqual(312);
		await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
		await disclosure.tap();
		await expect(collections.getByRole('menuitemcheckbox')).toHaveCount(10);
		await expect
			.poll(async () => {
				const bounds = await menu.boundingBox();
				return bounds ? bounds.x >= 8 && bounds.y >= 8 && bounds.y + bounds.height <= 592.5 : false;
			})
			.toBe(true);
		await disclosure.tap();
		await expect(collections).toHaveCount(0);
		await expect(menu).toBeVisible();
	});
});
