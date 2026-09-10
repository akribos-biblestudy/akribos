import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	apiKeys,
	commentaryEntries,
	lexiconEntries,
	resourceBooks,
	resources,
	users,
	verses
} from '../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

async function login(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
}

test('private works require an individual grant throughout the reader and API, including after revocation', async ({
	page,
	browser,
	request
}) => {
	test.setTimeout(90_000);
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	const userId = randomUUID();
	const email = `grant-${userId}@example.com`;
	const prefix = `PRIVATE_${randomUUID()}`;
	const ids = ['bible', 'commentary', 'lexicon'].map((kind) => `${prefix}_${kind}`);
	const privateText = 'Nur für das ausgewählte Testkonto';
	const personalToken = randomUUID();
	const publicToken = randomUUID();
	const viewerContext = await browser.newContext({ baseURL: 'http://localhost:4173' });
	const viewer = await viewerContext.newPage();
	try {
		const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
		await db.insert(users).values({
			id: userId,
			email,
			passwordHash: admin!.passwordHash,
			emailVerifiedAt: new Date(),
			tourCompletedAt: new Date()
		});
		await db.insert(resources).values(
			ids.map((id, index) => ({
				id,
				name: id,
				abbrev: id,
				kind: ['bible', 'commentary', 'lexicon'][index] as 'bible' | 'commentary' | 'lexicon',
				language: index === 2 ? 'grc' : 'de',
				isPublic: false,
				status: 'ready' as const,
				hasStrongs: index === 0
			}))
		);
		await db
			.insert(resourceBooks)
			.values(
				ids
					.slice(0, 2)
					.map((resourceId) => ({ resourceId, bookId: 43, chapterCount: 3, verseCount: 1 }))
			);
		await db.insert(verses).values({
			resourceId: ids[0]!,
			bookId: 43,
			chapter: 3,
			verse: 16,
			text: privateText,
			segments: [privateText]
		});
		await db.insert(commentaryEntries).values({
			resourceId: ids[1]!,
			bookId: 43,
			chapter: 3,
			verseStart: 16,
			verseEnd: 16,
			bodyHtml: `<p>${privateText}</p>`
		});
		await db.insert(lexiconEntries).values({
			resourceId: ids[2]!,
			strong: 'G26',
			language: 'grc',
			lemma: 'Privat',
			definitionHtml: `<p>${privateText}</p>`
		});
		await db.insert(apiKeys).values([
			{
				id: createHash('sha256').update(personalToken).digest('hex'),
				userId,
				name: 'Grant test personal',
				prefix: personalToken.slice(0, 8),
				scope: 'personal'
			},
			{
				id: createHash('sha256').update(publicToken).digest('hex'),
				userId,
				name: 'Grant test public',
				prefix: publicToken.slice(0, 8),
				scope: 'public'
			}
		]);
		await login(page, 'admin@example.com');
		await login(viewer, email);
		const resourcesFor = async (
			http: APIRequestContext,
			headers = { Origin: 'http://localhost:4173' }
		) =>
			(await (await http.get('/api/v1/resources', { headers })).json()).resources as {
				id: string;
			}[];
		expect((await resourcesFor(viewer.request)).some((r) => ids.includes(r.id))).toBe(false);

		for (const id of ids) {
			await page.goto(`/admin/resources?resource=${id}`);
			const form = page.locator('form[action^="?/grants"]');
			await form.getByLabel(email).check();
			await form.getByRole('button', { name: 'Private Freigaben speichern' }).click();
			await expect(form.getByRole('status')).toHaveText('Private Freigaben gespeichert.');
		}
		const granted = await resourcesFor(viewer.request);
		for (const id of ids) expect(granted.some((r) => r.id === id)).toBe(true);
		// A guest, a different account (even an admin), and a public-scope key cannot inherit the grant.
		for (const http of [request, page.request])
			expect((await resourcesFor(http)).some((r) => ids.includes(r.id))).toBe(false);
		const publicResponse = await request.get('/api/v1/resources', {
			headers: { Authorization: `Bearer ${publicToken}` }
		});
		expect(
			(await publicResponse.json()).resources.some((r: { id: string }) => ids.includes(r.id))
		).toBe(false);
		const personalResponse = await request.get('/api/v1/resources', {
			headers: { Authorization: `Bearer ${personalToken}` }
		});
		expect(personalResponse.headers()['cache-control']).toBe('private, no-store');
		expect(
			(await personalResponse.json()).resources.some((r: { id: string }) => r.id === ids[0])
		).toBe(true);

		const path = `/Joh3,16?layout=single&tab=1.1:${ids[0]}:A:Joh3,16&active=1.1&focus=1.1`;
		await viewer.goto(path);
		await expect(viewer.locator(`.flow-column[data-resource-id="${ids[0]}"]`)).toContainText(
			privateText
		);
		await page.goto(path);
		await expect(page.locator(`.flow-column[data-resource-id="${ids[0]}"]`)).toHaveCount(0);
		const readPaths = [
			`/api/reader/43/3?resource=${ids[0]}`,
			`/api/reader/43/3?resource=${ids[1]}`,
			`/api/reader/search?resource=${ids[0]}&q=Testkonto`,
			`/api/reader/search?resource=${ids[1]}&q=Testkonto`,
			`/api/strong/G26?lexicon=${ids[2]}&resource=${ids[0]}`,
			`/api/v1/bibles/${ids[0]}/43/3`
		];
		for (const url of readPaths) {
			const allowed = await viewer.request.get(url, {
				headers: { Origin: 'http://localhost:4173' }
			});
			expect(allowed.status(), url).toBe(200);
			expect(allowed.headers()['cache-control'], url).toBe('private, no-store');
			expect(await allowed.text(), url).toContain(privateText);
			const denied = await request.get(url, { headers: { Origin: 'http://localhost:4173' } });
			expect([400, 404], url).toContain(denied.status());
			expect(await denied.text(), url).not.toContain(privateText);
		}
		// Legacy Strong parameters must not bypass the resource selection check.
		for (const url of [
			`/api/strong/G26?resources=${ids[0]}`,
			`/api/v1/strong/G26?resources=${ids[0]}`
		]) {
			const denied = await request.get(url, { headers: { Origin: 'http://localhost:4173' } });
			expect((await denied.json()).statisticsResource).not.toBe(ids[0]);
		}
		// A normal account cannot grant itself anything through a forged admin action.
		expect(
			(
				await viewer.request.post('/admin/resources?/grants', {
					headers: { Origin: 'http://localhost:4173' },
					form: { id: ids[0]!, userIds: userId }
				})
			).status()
		).toBe(404);

		for (const id of ids) {
			await page.goto(`/admin/resources?resource=${id}`);
			const form = page.locator('form[action^="?/grants"]');
			await form.getByLabel(email).uncheck();
			await form.getByRole('button', { name: 'Private Freigaben speichern' }).click();
			await expect(form.getByRole('status')).toHaveText('Private Freigaben gespeichert.');
		}
		for (const url of readPaths)
			expect([400, 404], url).toContain(
				(await viewer.request.get(url, { headers: { Origin: 'http://localhost:4173' } })).status()
			);
		const revokedKey = await request.get(`/api/v1/bibles/${ids[0]}/43/3`, {
			headers: { Authorization: `Bearer ${personalToken}` }
		});
		expect(revokedKey.status()).toBe(404);
		await viewer.reload();
		await expect(viewer.locator(`.flow-column[data-resource-id="${ids[0]}"]`)).toHaveCount(0);
	} finally {
		await viewerContext.close();
		await db.delete(resources).where(inArray(resources.id, ids));
		await db.delete(users).where(eq(users.id, userId));
		await client.end();
	}
});
