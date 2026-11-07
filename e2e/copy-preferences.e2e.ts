import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { users } from '../src/lib/server/db/schema.ts';
import { testUserSession } from './lib/admin-session.ts';

test('copy settings persist for every format and reject an invalid position', async ({
	page,
	context
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const email = `copy-settings-${randomUUID()}@example.com`;
	let userId: string | undefined;
	try {
		const [user] = await db
			.insert(users)
			.values({ email, emailVerifiedAt: new Date(), tourCompletedAt: new Date() })
			.returning({ id: users.id });
		userId = user.id;
		await testUserSession(context, email);
		await page.goto('/account?tab=appearance');

		const position = page.getByLabel('Bibelverse kopieren');
		const source = page.getByLabel('Übersetzung in der Stellenangabe ergänzen');
		await expect(position).toHaveValue('before');
		await expect(source).not.toBeChecked();
		for (const [value, included] of [
			['before', true],
			['after', false],
			['after', true],
			['before', false]
		] as const) {
			await position.selectOption(value);
			await source.setChecked(included);
			await page.getByRole('button', { name: 'Kopiereinstellungen speichern' }).click();
			await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible();
			await page.reload();
			await expect(position).toHaveValue(value);
			if (included) await expect(source).toBeChecked();
			else await expect(source).not.toBeChecked();

			if (value === 'after' && included) {
				await context.grantPermissions(['clipboard-read', 'clipboard-write']);
				await page.goto('/Joh3?layout=single&tab=1.1:SEEDPLAIN:A:Joh3&active=1.1&focus=1');
				const verse = page.locator(
					'.flow-column[data-resource-id="SEEDPLAIN"] [data-verse-key="43:3:16"]'
				);
				await expect(verse).toBeVisible();
				await verse
					.locator('.verse-text')
					.first()
					.evaluate((element) => {
						const range = document.createRange();
						range.selectNodeContents(element);
						const selection = window.getSelection()!;
						selection.removeAllRanges();
						selection.addRange(range);
					});
				await page.keyboard.press('Control+c');
				const selectionCopy = await page.evaluate(() => navigator.clipboard.readText());
				expect(selectionCopy).toMatch(/^Denn so sehr hat Gott/);
				expect(selectionCopy).toMatch(/\n– Johannes 3,16 \(Schlicht\)$/);
				await verse.locator('.verse-number').click();
				await page.getByRole('menuitem', { name: 'Vers kopieren' }).click();
				await expect
					.poll(() => page.evaluate(() => navigator.clipboard.readText()))
					.toBe(selectionCopy);
				await page.goto('/account?tab=appearance');
			}
		}

		const result = await page.evaluate(async () => {
			const data = new FormData();
			data.set('copyReferencePosition', 'invalid');
			data.set('copyIncludeSource', 'on');
			const response = await fetch('/account?/copyPreferences', {
				method: 'POST',
				headers: { accept: 'application/json' },
				body: data
			});
			return response.json() as Promise<{ type: string; status: number }>;
		});
		expect(result).toMatchObject({ type: 'failure', status: 400 });
		await page.reload();
		await expect(position).toHaveValue('before');
		await expect(source).not.toBeChecked();
	} finally {
		if (userId) await db.delete(users).where(eq(users.id, userId));
		await client.end();
	}
});
