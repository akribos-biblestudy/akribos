import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { seedAdminSession } from './lib/admin-session.ts';

test('each repeated word is highlighted by position and opens its lexicon beside the verse', async ({
	page
}) => {
	const sql = postgres(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const segments = [
		{ kind: 'w', text: 'Wort', strong: 'G25' },
		{
			kind: 'note',
			marker: '',
			text: 'Automatische Wortzuordnung; fachlich noch nicht bestätigt.'
		},
		' und ',
		{ kind: 'w', text: 'Wort', strong: 'G25' },
		{ kind: 'note', marker: '', text: 'Automatische Wortzuordnung; fachlich noch nicht bestätigt.' }
	];
	const resourceId = `REVIEW-UI-${randomUUID()}`;
	try {
		await sql`insert into resources (id,kind,name,abbrev,language,status,is_public,has_strongs) values (${resourceId},'bible',${resourceId},'Review UI','de','ready',false,true)`;
		await sql`insert into resource_user_grants (resource_id,user_id) select ${resourceId},id from users where email='admin@example.com'`;
		await sql`
			insert into verses (resource_id, book_id, chapter, verse, segments, text)
			values (${resourceId}, 43, 3, 18, ${sql.json(segments)}, 'Wort und Wort')`;
		await seedAdminSession(page.context());
		await page.goto(`/strong-review?resource=${resourceId}&book=43`);
		const matches = page.locator('article').filter({ hasText: 'Joh 3,18' });
		await expect(matches).toHaveCount(2);
		for (const row of await matches.all()) {
			await expect(row).not.toContainText('Wortposition');
			await expect(
				row.getByRole('button', { name: 'Lexikoneintrag für Wort (G25) öffnen' })
			).toHaveCount(1);
		}
		const second = matches.nth(1);
		const secondWord = second.getByRole('button', { name: 'Lexikoneintrag für Wort (G25) öffnen' });
		await secondWord.click();
		await expect(secondWord).toHaveAttribute('aria-pressed', 'true');
		await expect(
			matches.nth(0).getByRole('button', { name: 'Lexikoneintrag für Wort (G25) öffnen' })
		).toHaveAttribute('aria-pressed', 'false');
		const lexicon = page.getByRole('region', { name: 'Lexikon zur Strong-Prüfung' });
		await expect(lexicon).toContainText('G25');
		await expect(lexicon.locator('.lexicon-definition')).toBeVisible();
		const articleBounds = await second.boundingBox();
		const lexiconBounds = await lexicon.boundingBox();
		expect(lexiconBounds!.x).toBeGreaterThan(articleBounds!.x + articleBounds!.width);
	} finally {
		await sql`delete from resources where id=${resourceId}`;
		await sql.end();
	}
});
