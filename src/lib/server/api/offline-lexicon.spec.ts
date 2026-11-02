import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, closeDb } from '../db/index.ts';
import { lexiconEntries, resources, resourceUserGrants, users } from '../db/schema.ts';
import { GET as listV1 } from '../../../routes/api/app/offline/resources/+server.ts';
import { GET as packageV1 } from '../../../routes/api/app/offline/resources/[resource]/+server.ts';
import { GET as listV2 } from '../../../routes/api/app/offline/v2/lexicons/+server.ts';
import { GET as packageV2 } from '../../../routes/api/app/offline/v2/lexicons/[resource]/+server.ts';

const db = getDb();
const prefix = `OFFLINE-LEX-${randomUUID()}`;
const lexiconId = `${prefix}-private`;
const unavailableId = `${prefix}-unlicensed`;
const bibleId = `${prefix}-bible`;
let userId: string;

function event(resource: string, owner: string | null = userId, ip = randomUUID()) {
	const url = new URL(`http://localhost:5173/api/app/offline/v2/lexicons/${resource}`);
	const headers: Record<string, string> = {};
	return {
		url,
		request: new Request(url, { headers: { 'x-akribos-app': '1' } }),
		params: { resource },
		locals: { user: owner ? { id: owner } : null },
		getClientAddress: () => ip,
		setHeaders: (values: Record<string, string>) => Object.assign(headers, values),
		headers
	};
}

beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({ email: `${prefix}@example.test` })
		.returning();
	userId = user!.id;
	await db.insert(resources).values([
		{
			id: lexiconId,
			kind: 'lexicon',
			name: 'Private dictionary',
			abbrev: 'Lex',
			language: 'grc',
			status: 'ready',
			isPublic: false,
			offlineEnabled: true
		},
		{
			id: unavailableId,
			kind: 'lexicon',
			name: 'Unlicensed',
			abbrev: 'No',
			language: 'grc',
			status: 'ready',
			isPublic: true,
			offlineEnabled: false
		},
		{
			id: bibleId,
			kind: 'bible',
			name: 'Bible',
			abbrev: 'B',
			language: 'de',
			status: 'ready',
			isPublic: true,
			offlineEnabled: true
		}
	]);
	await db.insert(resourceUserGrants).values({ resourceId: lexiconId, userId });
	await db.insert(lexiconEntries).values([
		{
			resourceId: lexiconId,
			strong: 'G26',
			language: 'grc',
			lemma: 'ἀγάπη',
			transliteration: 'agape',
			pronunciation: 'ag-ah-pay',
			definitionHtml: '<p>love</p>',
			derivationHtml: '<p>origin</p>',
			kjvDefinitionHtml: '<p>charity</p>',
			germanTranslation: {
				definitionHtml: '<p>Liebe</p>',
				derivationHtml: null,
				kjvDefinitionHtml: null,
				machineTranslated: true
			},
			seeAlso: ['G25']
		},
		{ resourceId: lexiconId, strong: 'G25', language: 'grc', lemma: 'ἀγαπάω' }
	]);
});

afterAll(async () => {
	if (userId) await db.delete(users).where(eq(users.id, userId));
	await db.delete(resources).where(inArray(resources.id, [lexiconId, unavailableId, bibleId]));
	await closeDb();
});

describe.sequential('version 2 offline lexicon packages', () => {
	it('isolates the opt-in catalogue and returns the unmodified article fields', async () => {
		const viewer = event(lexiconId);
		const catalogue = await (await listV2(viewer as never)).json();
		expect(catalogue.version).toBe(2);
		expect(catalogue.owner).toBe(userId);
		expect(catalogue.resources.map((r: { id: string }) => r.id)).toEqual([lexiconId]);
		const legacy = await (await listV1(viewer as never)).json();
		expect(legacy.version).toBe(1);
		expect(legacy.resources.map((r: { id: string }) => r.id)).not.toContain(lexiconId);
		await expect(packageV1(viewer as never)).rejects.toMatchObject({ status: 404 });
		const response = await packageV2(viewer as never);
		const body = await response.json();
		expect(viewer.headers['cache-control']).toBe('private, no-store');
		expect(viewer.headers.vary).toBe('Cookie');
		expect(body).toMatchObject({
			version: 2,
			owner: userId,
			resource: { id: lexiconId, kind: 'lexicon' }
		});
		expect(body.entries.map((item: { strong: string }) => item.strong)).toEqual(['G25', 'G26']);
		expect(body.entries[1]).toMatchObject({
			language: 'grc',
			lemma: 'ἀγάπη',
			transliteration: 'agape',
			pronunciation: 'ag-ah-pay',
			definitionHtml: '<p>love</p>',
			derivationHtml: '<p>origin</p>',
			kjvDefinitionHtml: '<p>charity</p>',
			germanTranslation: { definitionHtml: '<p>Liebe</p>', machineTranslated: true },
			seeAlso: ['G25']
		});
	});

	it('requires app header, offline permission and current Reader grant', async () => {
		const missing = event(lexiconId);
		missing.request = new Request(missing.url);
		await expect(packageV2(missing as never)).rejects.toMatchObject({ status: 400 });
		const foreign = event(lexiconId);
		foreign.request = new Request(foreign.url, {
			headers: { 'x-akribos-app': '1', origin: 'https://example.invalid' }
		});
		await expect(packageV2(foreign as never)).rejects.toMatchObject({ status: 403 });
		await expect(packageV2(event(lexiconId, null) as never)).rejects.toMatchObject({ status: 404 });
		await expect(packageV2(event(unavailableId) as never)).rejects.toMatchObject({ status: 404 });
		await expect(packageV2(event(bibleId) as never)).rejects.toMatchObject({ status: 404 });
		await db.delete(resourceUserGrants).where(eq(resourceUserGrants.resourceId, lexiconId));
		await expect(packageV2(event(lexiconId) as never)).rejects.toMatchObject({ status: 404 });
		expect((await (await listV2(event(lexiconId) as never)).json()).resources).toEqual([]);
		await db.insert(resourceUserGrants).values({ resourceId: lexiconId, userId });
		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
		await expect(packageV2(event(lexiconId) as never)).rejects.toMatchObject({ status: 404 });
		await db.update(users).set({ disabledAt: null }).where(eq(users.id, userId));
		await db.update(resources).set({ isPublic: true }).where(eq(resources.id, lexiconId));
		expect((await (await packageV2(event(lexiconId, null) as never)).json()).owner).toBeNull();
		await db.update(resources).set({ isPublic: false }).where(eq(resources.id, lexiconId));
		await db.update(resources).set({ offlineEnabled: false }).where(eq(resources.id, lexiconId));
		await expect(packageV2(event(lexiconId) as never)).rejects.toMatchObject({ status: 404 });
		await db.update(resources).set({ offlineEnabled: true }).where(eq(resources.id, lexiconId));
	});

	it('rejects oversized packages before loading article data', async () => {
		await db
			.update(lexiconEntries)
			.set({ definitionHtml: sql`repeat('x', ${32 * 1024 * 1024 + 1})` })
			.where(eq(lexiconEntries.resourceId, lexiconId));
		await expect(packageV2(event(lexiconId) as never)).rejects.toMatchObject({ status: 413 });
	});

	it('shares the per-IP package rate limit and reports retry time', async () => {
		const limited = event(unavailableId, userId, randomUUID());
		let status = 0;
		for (let i = 0; i < 31 && status !== 429; i++) {
			try {
				await packageV2(limited as never);
			} catch (caught) {
				status = (caught as { status: number }).status;
			}
		}
		expect(status).toBe(429);
		expect(limited.headers['retry-after']).toBe('60');
	});
});
