import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	resourceBooks,
	resources,
	resourceUserGrants,
	sessions,
	users,
	verses
} from '../src/lib/server/db/schema.ts';

const { db, client } = createDb(
	process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs')
);
const userId = randomUUID();
const token = randomBytes(32).toString('base64url');
const works = ['de', 'en', 'hbo'].map((language) => ({
	id: `BOOK_TITLE_${language}_${userId}`,
	language
}));
const chapters = [
	[8, 4],
	[9, 1],
	[9, 2],
	[9, 30],
	[9, 31],
	[10, 1],
	[10, 2]
] as const;

test.beforeAll(async () => {
	// Private grants keep these boundary fixtures out of every other reader's default resources.
	await db.transaction(async (tx) => {
		await tx.insert(users).values({
			id: userId,
			email: `book-headings-${userId}@example.com`,
			emailVerifiedAt: new Date(),
			tourCompletedAt: new Date()
		});
		await tx.insert(sessions).values({
			id: createHash('sha256').update(token).digest('hex'),
			userId,
			expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
		});
		await tx.insert(resources).values(
			works.map(({ id, language }) => ({
				id,
				name: `Buchüberschriften ${language}`,
				abbrev: `Buchtest ${language}`,
				kind: 'bible' as const,
				language,
				direction: language === 'hbo' ? ('rtl' as const) : ('ltr' as const),
				isPublic: false,
				status: 'ready' as const
			}))
		);
		await tx.insert(resourceUserGrants).values(works.map(({ id }) => ({ resourceId: id, userId })));
		await tx.insert(resourceBooks).values(
			works.flatMap(({ id }) =>
				[
					[8, 4, 20],
					[9, 31, 80],
					[10, 2, 40]
				].map(([bookId, chapterCount, verseCount]) => ({
					resourceId: id,
					bookId: bookId!,
					chapterCount: chapterCount!,
					verseCount: verseCount!
				}))
			)
		);
		await tx.insert(verses).values(
			works.flatMap(({ id }) =>
				chapters.flatMap(([bookId, chapter]) =>
					Array.from({ length: 20 }, (_, index) => {
						const text = `Abschnitt ${bookId}, Kapitel ${chapter}, Vers ${index + 1}. Dieser Lesetext macht den Übergang zwischen den Büchern beim Scrollen sichtbar.`;
						return {
							resourceId: id,
							bookId,
							chapter,
							verse: index + 1,
							text,
							segments: [text]
						};
					})
				)
			)
		);
	});
});

test.afterAll(async () => {
	try {
		await db.delete(users).where(eq(users.id, userId));
		await db.delete(resources).where(
			inArray(
				resources.id,
				works.map(({ id }) => id)
			)
		);
	} finally {
		await client.end();
	}
});

async function authenticate(context: BrowserContext, baseURL: string) {
	await context.addCookies([{ name: 'session', value: token, url: baseURL, httpOnly: true }]);
}

function readerUrl(reference: string, resourceId = works[0]!.id) {
	return `/${reference}?${new URLSearchParams({
		layout: 'single',
		tab: `1.1:${resourceId}:A:${reference}`,
		active: '1.1',
		focus: '1'
	})}`;
}

function chapterResponse(page: Page, book: number, chapter: number) {
	return page.waitForResponse((response) => {
		const url = new URL(response.url());
		return (
			url.pathname === `/api/reader/${book}/${chapter}` &&
			url.searchParams.get('resource') === works[0]!.id
		);
	});
}

async function expectTitleBeforeText(chapter: Locator, title: string) {
	const heading = chapter.getByRole('heading', { level: 2, name: title, exact: true });
	await expect(heading).toHaveCount(1);
	expect(
		await chapter.evaluate((element) => {
			const heading = element.querySelector('h2');
			const verse = element.querySelector('[data-verse-key]');
			return (
				!!heading &&
				!!verse &&
				!!(heading.compareDocumentPosition(verse) & Node.DOCUMENT_POSITION_FOLLOWING)
			);
		})
	).toBe(true);
	return heading;
}

test('book headings are server rendered before chapter one, including without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	try {
		await authenticate(context, baseURL!);
		const page = await context.newPage();
		await page.goto(readerUrl('1Sam1'));
		await expectTitleBeforeText(page.locator('[data-chapter-key="9:1"]'), '1. Samuel');
		await expect(page.locator('.flow-book-title')).toHaveAttribute('lang', 'de');
		await page.goto(readerUrl('1Sam2'));
		await expect(page.locator('[data-verse-key="9:2:1"]')).toBeVisible();
		await expect(page.locator('.flow-book-title')).toHaveCount(0);
		await page.goto(readerUrl('Ruth1'));
		await expect(page.locator('.empty-resource')).toBeVisible();
		await expect(page.locator('.flow-book-title')).toHaveCount(0);
	} finally {
		await context.close();
	}
});

test('scrolling past 1 Samuel 31 shows the next book title on a narrow screen', async ({
	page,
	context,
	baseURL
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await authenticate(context, baseURL!);
	const next = chapterResponse(page, 10, 1);
	await page.goto(readerUrl('1Sam31'));
	expect((await next).ok()).toBe(true);
	const column = page.locator('.flow-column');
	await expect(column.locator('[data-chapter-key="9:31"] .flow-book-title')).toHaveCount(0);
	const heading = await expectTitleBeforeText(
		column.locator('[data-chapter-key="10:1"]'),
		'2. Samuel'
	);
	await column.hover();
	await expect
		.poll(
			async () => {
				const titleBox = await heading.boundingBox();
				const columnBox = await column.boundingBox();
				if (
					titleBox &&
					columnBox &&
					titleBox.y >= columnBox.y &&
					titleBox.y + titleBox.height <= columnBox.y + columnBox.height
				)
					return true;
				await page.mouse.wheel(0, 500);
				return false;
			},
			{ timeout: 15_000 }
		)
		.toBe(true);
	await expect(heading).toBeInViewport();
	await expect(column.locator('.flow-book-title')).toHaveCount(1);
});

test('prepending Ruth 4 keeps the Samuel title at the following book boundary', async ({
	page,
	context,
	baseURL
}) => {
	await authenticate(context, baseURL!);
	const initialized = chapterResponse(page, 9, 2);
	await page.goto(readerUrl('1Sam1'));
	expect((await initialized).ok()).toBe(true);
	const column = page.locator('.flow-column');
	const previous = chapterResponse(page, 8, 4);
	await column.hover();
	await page.mouse.wheel(0, -700);
	expect((await previous).ok()).toBe(true);
	await expect(column.locator('[data-chapter-key="8:4"]')).toBeAttached();
	const heading = await expectTitleBeforeText(
		column.locator('[data-chapter-key="9:1"]'),
		'1. Samuel'
	);
	await expect(column.locator('[data-chapter-key="8:4"] .flow-book-title')).toHaveCount(0);
	expect(
		await column
			.locator('.flow-chapter')
			.evaluateAll((elements) =>
				elements.map((element) => element.getAttribute('data-chapter-key'))
			)
	).toEqual(expect.arrayContaining(['8:4', '9:1']));
	expect(
		await column.evaluate((element) => {
			const previous = element.querySelector('[data-chapter-key="8:4"]')!;
			const current = element.querySelector('[data-chapter-key="9:1"]')!;
			return !!(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING);
		})
	).toBe(true);
	await heading.scrollIntoViewIfNeeded();
	await expect(heading).toBeInViewport();
	await expect(column.locator('.flow-book-title')).toHaveCount(1);
});

test('narrow English and Hebrew readers use the work language and direction without overflow', async ({
	page,
	context,
	baseURL
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await authenticate(context, baseURL!);
	for (const [resource, title, language, direction] of [
		[works[1]!.id, '1 Samuel', 'en', 'ltr'],
		[works[2]!.id, 'שמואל א', 'he', 'rtl']
	]) {
		await page.goto(readerUrl('1Sam1', resource));
		const heading = await expectTitleBeforeText(page.locator('[data-chapter-key="9:1"]'), title!);
		await expect(heading).toHaveAttribute('lang', language!);
		await expect(heading).toHaveAttribute('dir', direction!);
		await heading.scrollIntoViewIfNeeded();
		await expect(heading).toBeInViewport();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			390
		);
	}
});

test('linked translations keep both book headings visible after chapter preloading', async ({
	page
}) => {
	const loaded = page.waitForResponse((response) =>
		response.url().includes('/api/reader/1/2?resource=SEEDPLAIN')
	);
	await page.goto('/1Mo1');
	expect((await loaded).ok()).toBe(true);
	const headings = page.locator('.flow-book-title');
	await expect(headings).toHaveCount(2);
	await expect(headings.nth(0)).toBeInViewport();
	await expect(headings.nth(1)).toBeInViewport();
});
