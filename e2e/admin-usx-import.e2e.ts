import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	resources,
	resourceUserGrants,
	users,
	verses,
	verseWords
} from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

const id = `USXZIP-${randomUUID().toUpperCase()}`;
function fixture(broken = false) {
	return Buffer.from(
		zipSync({
			'metadata.xml': strToU8(
				`<DBLMetadata revision="7"><identification><nameLocal>USX Testbibel</nameLocal><abbreviation>${id}</abbreviation></identification><language><ldml>de</ldml></language><copyright><fullStatement><statementContent><p>Testrechte</p></statementContent></fullStatement></copyright></DBLMetadata>`
			),
			'books/GEN.usx': strToU8(
				'<usx version="3.0"><book code="GEN"/><chapter number="1"/><para style="p"><verse number="1"/>USX Anfang.<verse eid="GEN 1:1"/></para></usx>'
			),
			'books/JHN.usx': strToU8(
				broken
					? '<usx>'
					: '<usx version="3.0"><book code="JHN"/><chapter number="3"/><para style="s1">USX Überschrift</para><para style="p"><verse number="16-17"/>USX Lesetext<note style="f" caller="+"><char style="ft">USX Erläuterung.</char></note>.<verse eid="JHN 3:16-17"/></para></usx>'
			)
		})
	);
}

test('admin imports a USX ZIP as one Bible and a broken reimport preserves its text', async ({
	page
}) => {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	try {
		// Keep this import private so other parallel suites retain the public seed Bible list.
		const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
		await db.insert(resources).values({
			id,
			kind: 'bible',
			name: 'USX Testbibel',
			abbrev: id,
			language: 'de',
			status: 'importing',
			isPublic: false
		});
		await db.insert(resourceUserGrants).values({ resourceId: id, userId: admin!.id });
		await page.goto('/login');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden' }).click();
		await page.goto('/admin/import');
		await expect(page.getByLabel('Format').locator('option[value="usx-zip"]')).toHaveText(
			'USX-ZIP (Bibel, mehrere Bücher)'
		);
		await page
			.getByLabel('Datei', { exact: true })
			.setInputFiles({ name: 'USX-Test.zip', mimeType: 'application/zip', buffer: fixture() });
		await page.getByRole('button', { name: 'Importieren', exact: true }).click();
		await expect(
			page.getByText('Import gestartet (usx-zip). Der Fortschritt erscheint unten.')
		).toBeVisible();
		await expect(
			page.locator('li').filter({ hasText: id }).filter({ hasText: 'fertig' })
		).toBeVisible({ timeout: 20000 });
		const response = await page.request.get(`/api/reader/bibles/${id}/43/3`);
		expect(response.ok()).toBe(true);
		const before = await response.json();
		expect(JSON.stringify(before)).toContain('USX Erläuterung.');
		expect(JSON.stringify(before)).toContain('USX Überschrift');
		const genesis = await page.request.get(`/api/reader/bibles/${id}/1/1`);
		expect(await genesis.text()).toContain('USX Anfang.');

		await page.goto(`/Joh3,16?layout=single&tab=1.1:${id}:A:Joh3,16&active=1.1&focus=1`);
		await expect(
			page.locator('.flow-column').getByText('USX Lesetext', { exact: false })
		).toBeVisible();

		await page.getByRole('button', { name: 'Hinweis * öffnen' }).click();
		await expect(page.getByRole('note')).toHaveText('USX Erläuterung.');

		await page.goto('/admin/import');
		await page
			.getByLabel('Datei', { exact: true })
			.setInputFiles({ name: 'USX-Test.zip', mimeType: 'application/zip', buffer: fixture(true) });
		await page.getByRole('button', { name: 'Importieren', exact: true }).click();
		await expect(page.getByText('fehlgeschlagen', { exact: true }).first()).toBeVisible({
			timeout: 20000
		});
		await expect(page.getByText(/Ungültiges USX-ZIP: books\/JHN.usx/)).toBeVisible();
		const after = await page.request.get(`/api/reader/bibles/${id}/43/3`);
		expect(await after.json()).toEqual(before);
	} finally {
		await db.delete(resources).where(eq(resources.id, id));
		await client.end();
	}
});

test('USX import and reimport preserve word-specific uncertainty in the lexicon', async ({
	page
}) => {
	test.setTimeout(90_000);
	const resourceId = `USXSTATUS-${randomUUID().toUpperCase()}`;
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const archive = (status: 'unreviewed' | 'confirmed', revision: string) =>
		Buffer.from(
			zipSync({
				'metadata.xml': strToU8(
					`<DBLMetadata revision="${revision}"><identification><nameLocal>USX Status-Test</nameLocal><abbreviation>${resourceId}</abbreviation></identification><language><ldml>de</ldml></language></DBLMetadata>`
				),
				'JHN.usx': strToU8(
					`<usx version="3.0"><book code="JHN"/><chapter number="3"/><para style="p"><verse number="16"/><char style="w" strong="G25" x-akribos-status="${status}">Probe</char> <char style="w" strong="G25" x-akribos-status="confirmed">Probe</char> <char style="w" strong="G25">Probe</char><note style="f" caller="a"><char style="ft">Normale Quellenanmerkung.</char></note>.<verse eid="JHN 3:16"/></para></usx>`
				)
			})
		);
	const upload = async (status: 'unreviewed' | 'confirmed', revision: string) => {
		await page.goto('/admin/import');
		await page.getByLabel('Datei', { exact: true }).setInputFiles({
			name: 'USX-Status-Test.zip',
			mimeType: 'application/zip',
			buffer: archive(status, revision)
		});
		await page.getByRole('button', { name: 'Importieren', exact: true }).click();
		await expect
			.poll(
				async () => {
					const [row] = await db
						.select({ status: resources.status, revision: resources.sourceRevision })
						.from(resources)
						.where(eq(resources.id, resourceId));
					return row;
				},
				{ timeout: 20_000 }
			)
			.toEqual({ status: 'ready', revision });
	};
	const openReader = () =>
		page.goto(
			`/Joh3,16?layout=columns-2&tab=1.1:${resourceId}:A:Joh3,16&tab=2.1:STRONGS_GREEK:A:Joh3,16&active=1.1&active=2.1&focus=1`
		);
	const readWords = () =>
		db
			.select({ position: verseWords.position, word: verseWords.word, strong: verseWords.strong })
			.from(verseWords)
			.where(eq(verseWords.resourceId, resourceId))
			.orderBy(verseWords.position);
	const storedVerse = async () =>
		(await db.select().from(verses).where(eq(verses.resourceId, resourceId)))[0]!;
	try {
		// Private synthetic content cannot change other suites' public/default Bible selection.
		const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
		await db.insert(resources).values({
			id: resourceId,
			kind: 'bible',
			name: 'USX Status-Test',
			abbrev: resourceId,
			language: 'de',
			status: 'importing',
			isPublic: false
		});
		await db.insert(resourceUserGrants).values({ resourceId, userId: admin!.id });
		await page.goto('/login');
		await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
		await page.getByRole('button', { name: 'Weiter', exact: true }).click();
		await page.getByLabel('Passwort').fill('seed-admin-password');
		await page.getByRole('button', { name: 'Anmelden' }).click();

		await upload('unreviewed', '1');
		const before = await storedVerse();
		expect(before.text).toBe('Probe Probe Probe.');
		expect(before.segments.filter((s) => typeof s !== 'string' && s.kind === 'note')).toHaveLength(
			2
		);
		const words = await readWords();
		expect(words).toEqual(
			[0, 1, 2].map((position) => ({ position, word: 'Probe', strong: 'G25' }))
		);
		await openReader();
		const verse = page
			.locator(`.flow-column[data-resource-id="${resourceId}"]`)
			.locator('[data-verse-key="43:3:16"]');
		await expect(verse.locator('.footnote-marker')).toHaveCount(1);
		await verse.locator('.footnote-marker').click();
		await expect(page.getByRole('note')).toHaveText('Normale Quellenanmerkung.');
		await verse.locator('.footnote-marker').click();
		const study = page.locator('.lexicon-tab');
		for (const position of [0, 1, 2]) {
			const response = page.waitForResponse((reply) => {
				const url = new URL(reply.url());
				return (
					url.pathname === '/api/strong/G25' &&
					url.searchParams.get('resource') === resourceId &&
					url.searchParams.get('wordPosition') === String(position)
				);
			});
			await verse.locator('.strong[data-strong="G25"]').nth(position).click();
			expect((await (await response).json()).assignmentStatus).toBe(
				position === 0 ? 'unconfirmed' : null
			);
			if (position === 0) {
				await expect(study.locator('.assignment-note')).toContainText('„Probe“ zu G25 in Joh 3,16');
			} else {
				await expect(study.locator('.assignment-note')).toHaveCount(0);
			}
		}
		await expect(study.locator('.occurrence .footnote-marker')).toHaveCount(2);

		await upload('confirmed', '2');
		const after = await storedVerse();
		expect(after.text).toBe(before.text);
		expect(await readWords()).toEqual(words);
		expect(after.segments.filter((s) => typeof s !== 'string' && s.kind === 'note')).toEqual([
			{ kind: 'note', marker: 'a', text: 'Normale Quellenanmerkung.' }
		]);
		await openReader();
		await verse.locator('.strong[data-strong="G25"]').first().click();
		await expect(study.locator('.headword strong')).toHaveText('G25');
		await expect(study.locator('.assignment-note')).toHaveCount(0);
		await expect(study.locator('.occurrence .footnote-marker')).toHaveCount(1);
		expect(
			(
				await (
					await page.request.get(
						`/api/strong/G25?resource=${resourceId}&ref=Joh3,16&word=Probe&wordPosition=0`
					)
				).json()
			).assignmentStatus
		).toBeNull();
	} finally {
		await db.delete(resources).where(eq(resources.id, resourceId));
		await client.end();
	}
});
