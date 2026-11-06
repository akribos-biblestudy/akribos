import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

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
	let insertedId: number | undefined;
	try {
		const [inserted] = await sql`
			insert into verses (resource_id, book_id, chapter, verse, segments, text)
			values ('SEEDDE', 43, 3, 18, ${sql.json(segments)}, 'Wort und Wort') returning id`;
		insertedId = Number(inserted.id);
		await page.goto('/login?redirectTo=%2Fstrong-review');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
		await page.goto('/strong-review?resource=SEEDDE&book=43');
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
		if (insertedId) await sql`delete from verses where id=${insertedId}`;
		await sql.end();
	}
});
