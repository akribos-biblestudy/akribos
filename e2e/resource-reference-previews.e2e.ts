import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	commentaryEntries,
	lexiconEntries,
	resourceBooks,
	resources
} from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { registerWithPassword } from './lib/auth.ts';

test('imported commentary, cross-reference prose and lexicons link and preview references without rewriting stored HTML', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const ids = ['commentary', 'xrefs', 'lexicon'].map((kind) => `REF_${kind}_${randomUUID()}`);
	const html =
		'<p>Vergleiche Joh 3,16-17 und 2. Sam 9,2. <code>Joh 3,16</code> <a class="strong-link" href="/G2316">G2316</a></p>';
	try {
		await db.insert(resources).values(
			ids.map((id, index) => ({
				id,
				name: `Reference fixture ${index}`,
				abbrev: `REF${index}`,
				kind: ['commentary', 'xrefs', 'lexicon'][index] as 'commentary' | 'xrefs' | 'lexicon',
				language: index === 2 ? 'grc' : 'de',
				status: 'ready' as const,
				isPublic: true,
				sortOrder: 99999
			}))
		);
		await db
			.insert(resourceBooks)
			.values(
				ids
					.slice(0, 2)
					.map((resourceId) => ({ resourceId, bookId: 43, chapterCount: 3, verseCount: 1 }))
			);
		await db.insert(commentaryEntries).values(
			ids.slice(0, 2).map((resourceId) => ({
				resourceId,
				bookId: 43,
				chapter: 3,
				verseStart: 16,
				verseEnd: 16,
				bodyHtml: html
			}))
		);
		await db.insert(lexiconEntries).values({
			resourceId: ids[2]!,
			strong: 'G25',
			language: 'grc',
			lemma: 'Test',
			definitionHtml: html
		});
		// Account reads see fixtures immediately, independent of the guest catalogue's 30s cache.
		await registerWithPassword(
			page,
			`references-${randomUUID()}@example.com`,
			'reference-test-password',
			'Reference Reader'
		);
		for (const [index, id] of ids.entries()) {
			await page.goto(
				`/Joh3?layout=columns-2&tab=1.1:SEEDDE:A:Joh3&tab=2.1:${id}:B:Joh3&active=1.1&active=2.1&focus=1${index === 2 ? '&lookup=2.1:G25' : ''}`
			);
			const prose = page
				.locator('.reader-tile')
				.nth(1)
				.locator(index === 2 ? '.lexicon-body' : '.commentary-body')
				.first();
			const reference = prose.getByRole('link', { name: 'Joh 3,16-17', exact: true });
			await expect(reference).toHaveAttribute('href', /layout=columns-2/);
			await expect(prose.getByRole('link', { name: '2. Sam 9,2', exact: true })).toHaveAttribute(
				'data-reference',
				'2Sam9,2'
			);
			await expect(prose.locator('code a')).toHaveCount(0);
			await expect(prose.locator('a.strong-link')).toHaveText('G2316');
			await reference.hover();
			const preview = page.getByTestId('bible-reference-preview').filter({ visible: true });
			await expect(preview).toContainText('Denn also hat Gott');
			await expect(preview).toContainText('nicht gesandt');
			await page.keyboard.press('Escape');
			await page.getByTestId('layout-picker').hover();
			await page.getByTestId('layout-picker').focus();
			await reference.focus();
			await expect(preview).toBeVisible();
			await page.keyboard.press('Escape');
			await reference.press('Enter');
			await expect(page).toHaveURL((url) =>
				url.searchParams.getAll('tab').some((value) => value.includes(`:${id}:B:Joh3,16`))
			);
			await expect(page.locator('.reader-tile')).toHaveCount(2);
			expect(new URL(page.url()).searchParams.getAll('tab')).toContain('1.1:SEEDDE:A:Joh3');
			if (index === 0) {
				const field = page
					.locator('.reader-tile')
					.nth(1)
					.getByRole('searchbox', { name: /Bibelstelle oder Suche in/ });
				await field.fill('Vergleiche');
				await field.press('Enter');
				const resultReference = page
					.locator('.commentary-result')
					.getByRole('link', { name: 'Joh 3,16-17', exact: true });
				await expect(resultReference).toHaveAttribute('href', /layout=columns-2/);
				await resultReference.hover();
				await expect(preview).toContainText('Denn also hat Gott');
			}
		}
		const storedCommentaries = await db
			.select({ html: commentaryEntries.bodyHtml })
			.from(commentaryEntries)
			.where(inArray(commentaryEntries.resourceId, ids));
		expect(storedCommentaries.map((entry) => entry.html)).toEqual([html, html]);
		const storedLexicons = await db
			.select({ html: lexiconEntries.definitionHtml })
			.from(lexiconEntries)
			.where(inArray(lexiconEntries.resourceId, ids));
		expect(storedLexicons.map((entry) => entry.html)).toEqual([html]);
	} finally {
		await db.delete(resources).where(inArray(resources.id, ids));
		await client.end();
	}
});
