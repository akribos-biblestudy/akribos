import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ParseStream } from '../../bible/parse/types.ts';
import { getDb, closeDb } from '../db/index.ts';
import {
	apiKeys,
	highlightStyles,
	lexiconEntries,
	resources,
	resourceUserGrants,
	users,
	verseHighlights,
	verseListItems,
	verseListMembers,
	verseLists
} from '../db/schema.ts';
import { refreshStrongStatisticsBlocking } from '../db/statistics.ts';
import { ingestBible } from '../import/ingest-bible.ts';
import { invalidateResourceCache, listResources } from '../repositories/resources.ts';
import { loadStrongEntry, loadOriginalWord } from '../repositories/strong.ts';
import { authenticateApiRequest, type ApiAuth } from './gate.ts';
import { config } from '../config.ts';
import { GET as resourceList } from '../../../routes/api/v1/resources/+server.ts';
import { GET as chapter } from '../../../routes/api/v1/bibles/[bible]/[book]/[chapter]/+server.ts';
import { GET as readerChapter } from '../../../routes/api/reader/bibles/[bible]/[book]/[chapter]/+server.ts';
import { GET as readerLabels } from '../../../routes/api/reader/resources/+server.ts';
import { GET as search } from '../../../routes/api/v1/search/+server.ts';
import { GET as strong } from '../../../routes/api/v1/strong/[strong]/+server.ts';
import { GET as list } from '../../../routes/api/v1/lists/[id]/+server.ts';
import { GET as highlights } from '../../../routes/api/v1/highlights/+server.ts';
import { actions as adminActions } from '../../../routes/admin/resources/+page.server.ts';

const db = getDb();
const prefix = `API-ACCESS-${randomUUID()}`.toUpperCase();
const id = (name: string) => `${prefix}-${name}`;
const resourceIds: string[] = [];
let userId: string;
let styleId: string;
let listId: string;
const keys = { public: randomUUID(), personal: randomUUID() };

async function* bibleSource(resourceId: string, text: string, language = 'de'): ParseStream {
	yield {
		type: 'metadata',
		metadata: { id: resourceId, name: resourceId, abbrev: 'Test', language }
	};
	yield {
		type: 'verse',
		verse: {
			book: 43,
			chapter: 3,
			verse: 16,
			segments: ['licensedword ', { kind: 'w', text, strong: 'G25', morph: 'N-NSM' }]
		}
	};
}

async function bible(name: string, apiEnabled: boolean, isPublic = true, language = 'de') {
	const resourceId = id(name);
	resourceIds.push(resourceId);
	await ingestBible(db, bibleSource(resourceId, name, language), { sourceFormat: 'regression' });
	await db
		.update(resources)
		.set({ apiEnabled, isPublic, sortOrder: apiEnabled ? 10 : 0 })
		.where(eq(resources.id, resourceId));
	if (!isPublic) await db.insert(resourceUserGrants).values({ resourceId, userId });
}

type Caller = 'public' | 'personal' | 'guest' | 'session';
async function request(
	caller: Caller,
	path: string,
	params: Record<string, string> = {},
	credentials: { sessionUserId?: string; token?: string } = {}
) {
	let apiAuth: ApiAuth;
	if (caller === 'public' || caller === 'personal') {
		const auth = await authenticateApiRequest(
			db,
			new Request(`${config().ORIGIN}${path}`, {
				headers: { authorization: `Bearer ${credentials.token ?? keys[caller]}` }
			}),
			'127.0.0.1'
		);
		if (!auth.ok) throw new Error('Fixture key was rejected');
		apiAuth = auth.auth;
	} else {
		const auth = await authenticateApiRequest(
			db,
			new Request(`${config().ORIGIN}${path}`, {
				headers: { origin: config().ORIGIN, 'sec-fetch-site': 'same-origin' }
			}),
			'127.0.0.1'
		);
		if (!auth.ok) throw new Error('Fixture browser request was rejected');
		apiAuth = auth.auth;
	}
	const headers: Record<string, string> = {};
	return {
		url: new URL(path, config().ORIGIN),
		params,
		locals: {
			user: credentials.sessionUserId
				? { id: credentials.sessionUserId }
				: caller === 'session'
					? { id: userId }
					: null,
			apiAuth
		},
		setHeaders(values: Record<string, string>) {
			Object.assign(headers, values);
		},
		headers
	};
}

beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({ email: `${prefix.toLowerCase()}@example.test` })
		.returning();
	userId = user!.id;
	for (const scope of ['public', 'personal'] as const)
		await db.insert(apiKeys).values({
			id: createHash('sha256').update(keys[scope]).digest('hex'),
			userId,
			name: 'Existing integration',
			prefix: 'test',
			scope
		});
	await bible('AllowedPublic', true);
	await bible('ForbiddenPublic', false);
	await bible('AllowedPrivate', true, false);
	await bible('ForbiddenPrivate', false, false);
	await bible('AllowedOriginal', true, true, 'grc');
	await bible('ForbiddenOriginal', false, true, 'grc');
	for (const enabled of [false, true]) {
		const resourceId = id(enabled ? 'AllowedLexicon' : 'ForbiddenLexicon');
		resourceIds.push(resourceId);
		await db.insert(resources).values({
			id: resourceId,
			kind: 'lexicon',
			name: resourceId,
			abbrev: 'Lex',
			language: 'grc',
			status: 'ready',
			apiEnabled: enabled,
			sortOrder: enabled ? 10 : 0
		});
		await db.insert(lexiconEntries).values({
			resourceId,
			strong: 'G25',
			language: 'grc',
			lemma: 'ἀγαπάω',
			definitionHtml: enabled ? 'Allowed definition' : 'Forbidden definition'
		});
	}
	const [style] = await db.insert(highlightStyles).values({ userId, color: '#ff0000' }).returning();
	styleId = style!.id;
	for (const name of ['AllowedPublic', 'ForbiddenPublic', 'ForbiddenPrivate'])
		await db.insert(verseHighlights).values({
			userId,
			styleId,
			resourceId: id(name),
			bookId: 43,
			chapter: 3,
			verse: 16,
			endVerse: 16,
			startWord: 0,
			endWord: 0
		});
	const [createdList] = await db
		.insert(verseLists)
		.values({ userId, title: 'Licence test', isPublic: true })
		.returning();
	listId = createdList!.id;
	await db
		.insert(verseListItems)
		.values({ listId, bookId: 43, chapter: 3, verse: 16, addedByUserId: userId });
	await refreshStrongStatisticsBlocking(db);
	invalidateResourceCache();
});

afterAll(async () => {
	await db.delete(users).where(eq(users.id, userId));
	await db.delete(resources).where(inArray(resources.id, resourceIds));
	invalidateResourceCache();
	await closeDb();
});

describe.sequential('independent resource permission for the public API', () => {
	it.each(['public', 'personal', 'guest', 'session'] as const)(
		'enforces licence permission for %s, including explicit ids and automatic word-study sources',
		async (caller) => {
			const listing = await request(caller, '/api/v1/resources');
			const available = (await (await resourceList(listing as never)).json()).resources as {
				id: string;
			}[];
			expect(available.some((row) => row.id === id('AllowedPublic'))).toBe(true);
			expect(available.some((row) => row.id === id('AllowedPrivate'))).toBe(
				caller === 'personal' || caller === 'session'
			);
			expect(
				available.some((row) => row.id.startsWith(prefix) && row.id.includes('Forbidden'))
			).toBe(false);
			expect(listing.headers['cache-control']).toBe('private, no-store');
			for (const name of ['ForbiddenPublic', 'ForbiddenPrivate']) {
				const event = await request(caller, '/api/v1/bibles', {
					bible: id(name),
					book: '43',
					chapter: '3'
				});
				expect((await chapter(event as never)).status).toBe(404);
			}
			const searchEvent = await request(
				caller,
				`/api/v1/search?q=licensedword&bibles=${id('ForbiddenPublic')},${id('ForbiddenPrivate')}`
			);
			const searched = await (await search(searchEvent as never)).json();
			expect(searched.total).toBe(0);
			expect(searchEvent.headers['cache-control']).toBe('private, no-store');
			const strongEvent = await request(
				caller,
				`/api/v1/strong/G25?ref=Joh3,16&resources=${id('ForbiddenPublic')}`,
				{ strong: 'G25' }
			);
			const study = await (await strong(strongEvent as never)).json();
			expect(study.entry.definitionHtml).toBe('Allowed definition');
			expect(study.original.resourceId).toBe(id('AllowedOriginal'));
			expect(JSON.stringify(study)).not.toContain('Forbidden');
			expect(strongEvent.headers['cache-control']).toBe('private, no-store');
		}
	);

	it('keeps reader text and labels available while private grants remain required', async () => {
		for (const caller of ['guest', 'session'] as const) {
			const event = await request(caller, '/api/reader/bibles', {
				bible: id('ForbiddenPrivate'),
				book: '43',
				chapter: '3'
			});
			const response = await readerChapter(event as never);
			expect(response.status).toBe(caller === 'session' ? 200 : 404);
			const publicEvent = await request(caller, '/api/reader/bibles', {
				bible: id('ForbiddenPublic'),
				book: '43',
				chapter: '3'
			});
			expect((await readerChapter(publicEvent as never)).status).toBe(200);
			const labels = await (await readerLabels(event as never)).json();
			expect(labels.resources.some((row: { id: string }) => row.id === id('ForbiddenPublic'))).toBe(
				true
			);
		}
		expect((await loadStrongEntry(db, 'G25'))?.definitionHtml).toBe('Forbidden definition');
		expect(
			(await loadOriginalWord(db, { strong: 'G25', book: 43, chapter: 3, verse: 16 }))?.resourceId
		).toBe(id('ForbiddenOriginal'));
	});

	it('preserves list and highlight references while omitting texts whose API permission is absent', async () => {
		const listEvent = await request(
			'public',
			`/api/v1/lists/${listId}?bible=${id('ForbiddenPublic')}`,
			{ id: listId }
		);
		const collection = await (await list(listEvent as never)).json();
		expect(collection.items).toMatchObject([{ book: 43, chapter: 3, verse: 16, segments: null }]);
		expect(listEvent.headers['cache-control']).toBe('private, no-store');
		const event = await request(
			'personal',
			`/api/v1/highlights?style=${styleId}&resource=${id('AllowedPublic')}`
		);
		const result = await (await highlights(event as never)).json();
		expect(result.verses).toHaveLength(3);
		for (const row of result.verses) {
			expect(row.segments === null).toBe(row.resourceId !== id('AllowedPublic'));
			expect(row).toMatchObject({ book: 43, chapter: 3, verse: 16 });
		}
		expect(event.headers['cache-control']).toBe('private, no-store');
		const blockedDefault = await request(
			'personal',
			`/api/v1/highlights?style=${styleId}&resource=${id('ForbiddenPublic')}`
		);
		expect((await highlights(blockedDefault as never)).status).toBe(404);
	});

	it('redacts contributor emails for public readers while preserving personal owner and member access', async () => {
		const extraUsers: string[] = [];
		try {
			const [member, stranger] = await db
				.insert(users)
				.values([
					{ email: `${randomUUID()}@example.test` },
					{ email: `${randomUUID()}@example.test` }
				])
				.returning();
			extraUsers.push(member!.id, stranger!.id);
			await db.insert(verseListMembers).values({ listId, userId: member!.id });
			const makeKey = async (owner: string, scope: 'public' | 'personal') => {
				const token = randomUUID();
				await db.insert(apiKeys).values({
					id: createHash('sha256').update(token).digest('hex'),
					userId: owner,
					name: 'List privacy regression',
					prefix: 'test',
					scope
				});
				return token;
			};
			const memberKey = await makeKey(member!.id, 'personal');
			const strangerPublicKey = await makeKey(stranger!.id, 'public');
			const strangerPersonalKey = await makeKey(stranger!.id, 'personal');
			const cases: Array<{
				name: string;
				caller: Caller;
				sessionUserId?: string;
				token?: string;
				personalAccess?: boolean;
			}> = [
				{ name: 'guest', caller: 'guest' },
				{ name: 'owner public key', caller: 'public' },
				{ name: 'owner public key with owner session', caller: 'public', sessionUserId: userId },
				{ name: 'stranger public key', caller: 'public', token: strangerPublicKey },
				{ name: 'stranger session', caller: 'session', sessionUserId: stranger!.id },
				{ name: 'stranger personal key', caller: 'personal', token: strangerPersonalKey },
				{ name: 'owner session', caller: 'session', personalAccess: true },
				{ name: 'owner personal key', caller: 'personal', personalAccess: true },
				{
					name: 'member session',
					caller: 'session',
					sessionUserId: member!.id,
					personalAccess: true
				},
				{ name: 'member personal key', caller: 'personal', token: memberKey, personalAccess: true }
			];
			const ownerEmail = `${prefix.toLowerCase()}@example.test`;
			for (const scenario of cases) {
				const event = await request(
					scenario.caller,
					`/api/v1/lists/${listId}`,
					{ id: listId },
					scenario
				);
				const response = await list(event as never);
				expect(response.status, scenario.name).toBe(200);
				const collection = await response.json();
				expect(collection.items[0].addedByName, scenario.name).toBe(
					scenario.personalAccess ? ownerEmail : 'Ein Mitglied der Liste'
				);
				if (!scenario.personalAccess)
					expect(JSON.stringify(collection), scenario.name).not.toContain(ownerEmail);
				expect(event.headers['cache-control'], scenario.name).toBe('private, no-store');
			}
		} finally {
			if (extraUsers.length) await db.delete(users).where(inArray(users.id, extraUsers));
		}
	});

	it('applies admin changes to existing keys immediately, without using the Reader resource cache', async () => {
		await listResources(db); // Warm the Reader cache before changing the independent API setting.
		const data = new FormData();
		data.set('id', id('AllowedPublic'));
		data.set('isPublic', 'on');
		data.set('apiAccessSettings', '1');
		await adminActions.save({
			request: new Request(`${config().ORIGIN}/admin/resources`, { method: 'POST', body: data })
		} as never);
		for (const caller of ['public', 'personal'] as const) {
			const event = await request(caller, '/api/v1/bibles', {
				bible: id('AllowedPublic'),
				book: '43',
				chapter: '3'
			});
			expect((await chapter(event as never)).status).toBe(404);
		}
		await ingestBible(db, bibleSource(id('AllowedPublic'), 'Reimported'), {
			sourceFormat: 'regression'
		});
		expect(
			(
				await db
					.select()
					.from(resources)
					.where(eq(resources.id, id('AllowedPublic')))
			)[0]?.apiEnabled
		).toBe(false);
		data.set('apiEnabled', 'on');
		await adminActions.save({
			request: new Request(`${config().ORIGIN}/admin/resources`, { method: 'POST', body: data })
		} as never);
		const restored = await request('personal', '/api/v1/bibles', {
			bible: id('AllowedPublic'),
			book: '43',
			chapter: '3'
		});
		expect((await chapter(restored as never)).status).toBe(200);
	});

	it('honours a revoked private grant even when API access is enabled', async () => {
		await db
			.delete(resourceUserGrants)
			.where(
				and(
					eq(resourceUserGrants.userId, userId),
					eq(resourceUserGrants.resourceId, id('AllowedPrivate'))
				)
			);
		const event = await request('personal', '/api/v1/bibles', {
			bible: id('AllowedPrivate'),
			book: '43',
			chapter: '3'
		});
		expect((await chapter(event as never)).status).toBe(404);
	});
});
