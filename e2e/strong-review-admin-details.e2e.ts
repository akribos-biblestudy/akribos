import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { createHash, randomUUID } from 'node:crypto';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

const dbUrl =
	process.env.E2E_DATABASE_URL ??
	testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs');

test('admin review shows the exact verse and lexicon only with reader access and rejects stale reviews', async ({
	page
}) => {
	test.setTimeout(120_000);
	const sql = postgres(dbUrl, { max: 1 });
	const resourceId = `PRIVATE-REVIEW-${randomUUID()}`;
	const resourceName = `Privates Prüfwerk ${resourceId}`;
	try {
		await sql`select pg_advisory_lock(1959718812)`;
		const [source] =
			await sql`select segments, text from verses where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		const [admin] = await sql`select id from users where email='admin@example.com'`;
		const [author] = await sql`select id from users where email='reader@example.com'`;
		await sql`insert into resources (id, kind, name, abbrev, language, status, is_public, has_strongs) values (${resourceId}, 'bible', ${resourceName}, 'Private Testbibel', 'de', 'ready', false, true)`;
		await sql`insert into verses (resource_id, book_id, chapter, verse, segments, text) values (${resourceId},43,3,16,${sql.json(source.segments)},${source.text})`;
		const hash = createHash('sha256').update(JSON.stringify(source.segments)).digest('hex');
		const [review] =
			await sql`insert into strong_assignment_reviews (resource_id,book_id,chapter,verse,word_position,strong,word,verse_fingerprint,decision,author_id) values (${resourceId},43,3,16,2,'G25','geliebt',${hash},'confirmed',${author.id}) returning id`;
		const reviewId: string = review.id;
		await page.goto('/login?redirectTo=%2Fadmin%2Fstrong-reviews');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page).toHaveURL(/\/admin\/strong-reviews/);
		let card = page.getByRole('article').filter({ hasText: resourceName });
		await expect(card).toContainText('Lesefreigabe erforderlich');
		await expect(card).not.toContainText('geliebt');
		await expect(card.getByRole('button', { name: 'Freigeben' })).toHaveCount(0);
		expect(await page.content()).not.toContain(source.text);
		const forbidden = await page.request.post('/admin/strong-reviews?/approve', {
			form: { id: reviewId },
			headers: { origin: 'http://localhost:4173', accept: 'text/html' }
		});
		expect(forbidden.status()).toBe(403);
		await sql`insert into resource_user_grants (resource_id,user_id) values (${resourceId},${admin.id})`;
		await page.reload();
		card = page.getByRole('article').filter({ hasText: resourceName });
		await expect(card).toContainText('Denn also hat');
		const word = card.getByRole('button', { name: 'Lexikoneintrag für geliebt (G25) öffnen' });
		await expect(word).toHaveText('geliebt');
		await word.click();
		const lexicon = page.getByRole('region', { name: 'Lexikon zur Strong-Prüfung' });
		await expect(lexicon).toContainText('G25');
		await expect(lexicon.getByRole('heading', { name: /ἀγαπάω/ })).toBeVisible();
		await sql`update verses set segments=${sql.json([...source.segments, '!'])} where resource_id=${resourceId}`;
		await page.reload();
		card = page.getByRole('article').filter({ hasText: resourceName });
		await expect(card).toContainText('Bibelstelle hat sich geändert');
		await expect(card.getByRole('button', { name: 'Freigeben' })).toHaveCount(0);
		const stale = await page.request.post('/admin/strong-reviews?/approve', {
			form: { id: reviewId },
			headers: { origin: 'http://localhost:4173', accept: 'text/html' }
		});
		expect(stale.status()).toBe(409);
	} finally {
		await sql`delete from resources where id=${resourceId}`;
		await sql`select pg_advisory_unlock(1959718812)`;
		await sql.end();
	}
});

test('admin review pages and filters large numbers of decisions on the server', async ({
	page
}) => {
	test.setTimeout(120_000);
	const sql = postgres(dbUrl, { max: 1 });
	const resourceId = `REVIEW-PAGES-${randomUUID()}`;
	const resourceName = `Prüfseiten ${resourceId}`;
	try {
		await sql`select pg_advisory_lock(1959718812)`;
		const [source] =
			await sql`select segments, text from verses where resource_id='SEEDDE' and book_id=43 and chapter=3 and verse=16`;
		await sql`insert into resources (id, kind, name, abbrev, language, status, is_public, has_strongs) values (${resourceId}, 'bible', ${resourceName}, 'Seitenprobe', 'de', 'ready', false, true)`;
		await sql`insert into resource_user_grants (resource_id,user_id) select ${resourceId},id from users where email='admin@example.com'`;
		await sql`insert into verses (resource_id, book_id, chapter, verse, segments, text) values (${resourceId},43,3,16,${sql.json(source.segments)},${source.text})`;
		const hash = createHash('sha256').update(JSON.stringify(source.segments)).digest('hex');
		await sql`insert into strong_assignment_reviews (resource_id,book_id,chapter,verse,word_position,strong,word,verse_fingerprint,decision)
			select ${resourceId},43,3,16,i,'G25','geliebt',${hash},'confirmed' from generate_series(0,25) as i`;
		await page.goto('/login?redirectTo=%2Fadmin%2Fstrong-reviews');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await expect(page.getByRole('article').filter({ hasText: resourceName })).toHaveCount(25);
		await page
			.getByRole('navigation', { name: 'Seiten der Strong-Prüfungen' })
			.getByRole('link', { name: 'Weiter' })
			.click();
		await expect(page.getByRole('article').filter({ hasText: resourceName })).toHaveCount(1);
		await page.getByLabel('Anzeige').selectOption('approved');
		await expect(page.getByRole('article').filter({ hasText: resourceName })).toHaveCount(0);
	} finally {
		await sql`delete from resources where id=${resourceId}`;
		await sql`select pg_advisory_unlock(1959718812)`;
		await sql.end();
	}
});
