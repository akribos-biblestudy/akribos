import { expect, test, type Page, type Response } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { documents, users, verseLists } from '../src/lib/server/db/schema.ts';
import { seedAdminSession, testUserSession } from './lib/admin-session.ts';

function columnIndex(page: Page, name: string) {
	return page
		.getByRole('columnheader', { name, exact: true })
		.evaluate((element) => (element as HTMLTableCellElement).cellIndex);
}

test('only admins see note counts and recent website activity per account', async ({
	browser,
	baseURL,
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	const fixtureId = crypto.randomUUID();
	const readerAccount = { id: crypto.randomUUID(), email: `stats-reader-${fixtureId}@example.com` };
	const historical = { id: crypto.randomUUID(), email: `stats-history-${fixtureId}@example.com` };
	const unseen = { id: crypto.randomUUID(), email: `stats-unseen-${fixtureId}@example.com` };
	const oldLogin = new Date('2024-01-02T03:04:05.000Z');
	const readerContext = await browser.newContext({ baseURL, javaScriptEnabled: false });

	try {
		await db.insert(users).values([
			{ ...readerAccount, lastLoginAt: oldLogin, emailVerifiedAt: oldLogin },
			{ ...historical, lastLoginAt: oldLogin, emailVerifiedAt: oldLogin },
			{ ...unseen, emailVerifiedAt: oldLogin }
		]);
		const body = { bodyMarkdown: '', bodyHtml: '', plainText: '' };
		await db.insert(documents).values([
			{ ...body, userId: readerAccount.id, kind: 'note', title: 'Private Notiz' },
			{
				...body,
				userId: readerAccount.id,
				kind: 'note',
				visibility: 'unlisted',
				title: 'Geteilte Notiz'
			},
			{
				...body,
				userId: readerAccount.id,
				kind: 'note',
				title: 'Gelöschte Notiz',
				deletedAt: oldLogin
			},
			{
				...body,
				userId: readerAccount.id,
				kind: 'sermon',
				title: 'Ausarbeitung',
				sermonStatus: 'outline'
			},
			{ ...body, userId: historical.id, kind: 'note', title: 'Notiz eines anderen Kontos' }
		]);
		await db.insert(verseLists).values([
			{ userId: readerAccount.id, title: 'Erste Liste' },
			{ userId: readerAccount.id, title: 'Zweite Liste' },
			{ userId: readerAccount.id, title: 'Dritte Liste' }
		]);

		await testUserSession(readerContext, readerAccount.email);
		const readerPage = await readerContext.newPage();
		expect((await readerPage.goto('/admin/users'))?.status()).toBe(404);
		expect((await readerContext.request.get('/Joh3')).status()).toBe(200);
		expect((await page.request.get('/admin/users', { maxRedirects: 0 })).status()).toBe(303);

		await seedAdminSession(page.context());
		await page.goto('/admin/users');
		const [notesColumn, listsColumn, visitColumn] = await Promise.all([
			columnIndex(page, 'Notizen'),
			columnIndex(page, 'Listen'),
			columnIndex(page, 'Zuletzt auf der Website aktiv')
		]);
		const row = (email: string) =>
			page.getByRole('row').filter({ has: page.getByRole('cell', { name: email, exact: true }) });
		const readerRow = row(readerAccount.email);
		const readerVisit = readerRow.getByRole('cell').nth(visitColumn);
		const historicalVisit = row(historical.email).getByRole('cell').nth(visitColumn);
		await expect(readerRow.getByRole('cell').nth(notesColumn)).toHaveText('2');
		await expect(readerRow.getByRole('cell').nth(listsColumn)).toHaveText('3');
		await expect(row(historical.email).getByRole('cell').nth(notesColumn)).toHaveText('1');
		await expect(row(unseen.email).getByRole('cell').nth(notesColumn)).toHaveText('0');
		await expect(readerVisit).toContainText('Noch nicht erfasst');
		await expect(historicalVisit).toContainText('Noch nicht erfasst');
		await expect(historicalVisit).toContainText('Anmeldung');
		await expect(historicalVisit.locator('time')).toHaveAttribute(
			'datetime',
			oldLogin.toISOString()
		);
		await expect(row(unseen.email).getByRole('cell').nth(visitColumn)).toHaveText(
			'Noch nicht erfasst'
		);

		const started = Date.now();
		expect((await readerPage.goto('/Joh3'))?.status()).toBe(200);
		await page.reload();
		await expect(readerVisit).not.toContainText('Noch nicht erfasst');
		const visitedAt = Date.parse(
			(await readerVisit.locator(':scope > time').getAttribute('datetime')) ?? ''
		);
		expect(visitedAt).toBeGreaterThanOrEqual(started - 1000);
		expect(visitedAt).toBeLessThanOrEqual(Date.now() + 1000);
		await expect(historicalVisit).toContainText('Noch nicht erfasst');

		const activeContext = await browser.newContext({ baseURL });
		try {
			await testUserSession(activeContext, readerAccount.email);
			const activePage = await activeContext.newPage();
			await activePage.clock.install();
			const isActivityResponse = (response: Response) =>
				new URL(response.url()).pathname === '/api/account/web-visit' &&
				response.request().method() === 'POST';
			const firstSignal = activePage.waitForResponse(isActivityResponse);
			await activePage.goto('/help');
			expect((await firstSignal).status()).toBe(204);

			await db
				.update(users)
				.set({ lastWebVisitAt: oldLogin })
				.where(eq(users.id, readerAccount.id));
			await activePage.clock.fastForward(5 * 60_000 + 1000);
			const [idle] = await db
				.select({ lastWebVisitAt: users.lastWebVisitAt })
				.from(users)
				.where(eq(users.id, readerAccount.id));
			expect(idle.lastWebVisitAt).toEqual(oldLogin);

			const actedAt = Date.now();
			const activitySignal = activePage.waitForResponse(isActivityResponse);
			await activePage.mouse.move(400, 400);
			await activePage.mouse.wheel(0, 300);
			expect((await activitySignal).status()).toBe(204);
			await expect(activePage).toHaveURL('/help');
			const [afterInteraction] = await db
				.select({ lastWebVisitAt: users.lastWebVisitAt })
				.from(users)
				.where(eq(users.id, readerAccount.id));
			expect(afterInteraction.lastWebVisitAt?.getTime()).toBeGreaterThanOrEqual(actedAt - 1000);
		} finally {
			await activeContext.close();
		}
	} finally {
		await readerContext.close();
		await db.delete(users).where(inArray(users.id, [readerAccount.id, historical.id, unseen.id]));
		await client.end();
	}
});
