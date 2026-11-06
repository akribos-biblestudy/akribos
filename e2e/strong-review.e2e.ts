import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

const dbUrl =
	process.env.E2E_DATABASE_URL ??
	testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs');
const target = {
	resourceId: 'SEEDDE',
	bookId: 43,
	chapter: 3,
	verse: 16,
	wordPosition: 2,
	strong: 'G25',
	word: 'geliebt'
};
const study = '/api/strong/G25?resource=SEEDDE&ref=Joh3%2C16&word=geliebt&wordPosition=2';
async function login(page: Page, email: string, password: string) {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort').fill(password);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page).not.toHaveURL(/\/login/);
}
test('rights, pending review, approval and changed source remain isolated', async ({ browser }) => {
	const sql = postgres(dbUrl);
	const admin = await browser.newContext();
	const reader = await browser.newContext();
	const guest = await browser.newContext();
	const adminPage = await admin.newPage();
	const readerPage = await reader.newPage();
	const [row] =
		await sql`select segments from verses where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
	const original = row.segments;
	try {
		await sql`delete from strong_assignment_reviews where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await sql`delete from strong_review_grants where user_id=(select id from users where email='reader@example.com')`;
		await login(adminPage, 'admin@example.com', 'seed-admin-password');
		await login(readerPage, 'reader@example.com', 'seed-reader-password');
		await readerPage.getByRole('button', { name: 'Konto-Menü' }).click();
		await expect(readerPage.getByRole('menuitem', { name: 'Strong prüfen' })).toHaveCount(0);
		await readerPage.getByRole('button', { name: 'Konto-Menü' }).click();
		const send = (decision: string) =>
			reader.request.post('/api/strong-review', { data: { ...target, decision } });
		expect((await send('confirmed')).status()).toBe(403);
		await adminPage.goto('/admin/users');
		const accountRow = adminPage.getByRole('row').filter({ hasText: 'reader@example.com' });
		await accountRow.getByRole('button', { name: 'Berechtigen', exact: true }).click();
		await expect(accountRow.getByRole('button', { name: /Berechtigt/ })).toBeVisible();
		await readerPage.reload();
		await readerPage.getByRole('button', { name: 'Konto-Menü' }).click();
		await expect(readerPage.getByRole('menuitem', { name: 'Strong prüfen' })).toBeVisible();
		const whitespaceVariant = original.map((segment: unknown) => {
			if (
				segment &&
				typeof segment === 'object' &&
				'text' in segment &&
				(segment as { text: string }).text ===
					'Automatische Wortzuordnung; fachlich noch nicht bestätigt.'
			) {
				return {
					...segment,
					text: '  Automatische Wortzuordnung;\n fachlich   noch nicht bestätigt.  '
				};
			}
			return segment;
		});
		await sql`update verses set segments=${sql.json(whitespaceVariant)} where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await readerPage.goto('/strong-review?resource=SEEDDE');
		await expect(readerPage.locator('article').filter({ hasText: 'G25' })).toBeVisible();
		await sql`update verses set segments=${sql.json(original)} where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await readerPage.reload();
		const card = readerPage.locator('article').filter({ hasText: 'G25' });
		const confirm = card.getByRole('button', { name: 'Zuordnung bestätigen' });
		await confirm.focus();
		await expect(
			card.getByRole('tooltip').filter({ hasText: 'Zuordnung bestätigen' })
		).toBeVisible();
		await confirm.click();
		const confirmed = card.getByRole('button', { name: 'Bestätigung zurückziehen' });
		await expect(confirmed).toHaveAttribute('aria-pressed', 'true');
		await expect(confirmed.locator('svg')).toHaveAttribute('fill', 'currentColor');
		await confirmed.click();
		await expect(confirm).toHaveAttribute('aria-pressed', 'false');
		await card.getByRole('button', { name: 'Als fehlerhaft markieren' }).click();
		const incorrect = card.getByRole('button', { name: 'Markierung als fehlerhaft zurückziehen' });
		await expect(incorrect).toHaveAttribute('aria-pressed', 'true');
		await expect(incorrect.locator('svg')).toHaveAttribute('fill', 'currentColor');
		await incorrect.click();
		await expect(card.getByRole('button', { name: 'Als fehlerhaft markieren' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		expect((await send('confirmed')).status()).toBe(200);
		expect((await (await reader.request.get(study)).json()).reviewState).toEqual({
			decision: 'confirmed',
			approved: false
		});
		expect((await (await guest.request.get(study)).json()).reviewState).toBeNull();
		expect((await send('incorrect')).status()).toBe(200);
		expect((await send('withdraw')).status()).toBe(200);
		expect((await send('confirmed')).status()).toBe(200);
		await adminPage.goto('/admin/strong-reviews');
		await adminPage.getByRole('button', { name: 'Freigeben' }).click();
		await expect(adminPage.getByText('Keine Prüfungen in dieser Ansicht.')).toBeVisible();
		expect((await send('incorrect')).status()).toBe(409);
		expect((await send('withdraw')).status()).toBe(409);
		expect((await (await guest.request.get(study)).json()).reviewState).toEqual({
			decision: 'confirmed',
			approved: true
		});
		await sql`update verses set segments=${sql.json([...original, '!'])} where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		expect((await (await guest.request.get(study)).json()).reviewState).toBeNull();
		await adminPage.goto('/admin/strong-reviews');
		await adminPage.getByLabel('Anzeige').selectOption('approved');
		await expect(adminPage.getByText(/Bibelstelle hat sich geändert/)).toBeVisible();
		await sql`update verses set segments=${sql.json(original)} where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await sql`delete from strong_assignment_reviews where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		expect((await send('confirmed')).status()).toBe(200);
		const [pending] =
			await sql`select id from strong_assignment_reviews where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		const [approval, change] = await Promise.all([
			admin.request.post('/admin/strong-reviews?/approve', {
				form: { id: pending.id },
				headers: { origin: 'http://localhost:4173' }
			}),
			send('incorrect')
		]);
		const [after] =
			await sql`select approved_at, decision from strong_assignment_reviews where id=${pending.id}`;
		expect([200, 409]).toContain(approval.status());
		expect([200, 409]).toContain(change.status());
		if (after.approved_at) {
			expect(after.decision).toBe(change.status() === 200 ? 'incorrect' : 'confirmed');
			expect((await send('incorrect')).status()).toBe(409);
		} else {
			expect(approval.status()).toBe(409);
			expect(after.decision).toBe('incorrect');
		}
		await sql`delete from strong_review_grants where user_id=(select id from users where email='reader@example.com')`;
		await readerPage.goto('/account');
		await readerPage.getByRole('button', { name: 'Konto-Menü' }).click();
		await expect(readerPage.getByRole('menuitem', { name: 'Strong prüfen' })).toHaveCount(0);
		expect((await reader.request.get('/strong-review')).status()).toBe(403);
	} finally {
		await sql`update verses set segments=${sql.json(original)} where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await sql`delete from strong_assignment_reviews where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await sql`delete from strong_review_grants where user_id=(select id from users where email='reader@example.com')`;
		await Promise.all([admin.close(), reader.close(), guest.close(), sql.end()]);
	}
});
