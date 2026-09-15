import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticateApiRequest } from '../api/gate.ts';
import { closeDb, getDb } from '../db/index.ts';
import { highlightStyles, resources, resourceUserGrants, users, verses } from '../db/schema.ts';
import { createApiKey, revokeApiKey } from './api-keys.ts';
import { listHighlightedVerses, setVerseHighlight } from './verse-highlights.ts';

describe('authorization after resource and account changes', () => {
	const db = getDb();
	const userId = randomUUID();
	const resourceIds = ['private', 'public', 'draft'].map((kind) => `${kind}-${randomUUID()}`);
	const reference = { book: 43, chapter: 3, verse: 16 };
	const text = ['Private words stay protected'];
	beforeAll(async () => {
		await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
		await db.insert(resources).values(
			resourceIds.map((id, i) => ({
				id,
				name: id,
				abbrev: id,
				kind: 'bible' as const,
				language: 'de',
				isPublic: i > 0,
				status: i === 2 ? ('draft' as const) : ('ready' as const)
			}))
		);
		await db.insert(verses).values(
			resourceIds.map((resourceId) => ({
				resourceId,
				bookId: 43,
				chapter: 3,
				verse: 16,
				text: text[0]!,
				segments: text
			}))
		);
	});
	afterAll(async () => {
		await db.delete(users).where(eq(users.id, userId));
		await db.delete(resources).where(inArray(resources.id, resourceIds));
		await closeDb();
	});
	async function style() {
		const id = randomUUID();
		await db.insert(highlightStyles).values({ id, userId, color: '#ff0000' });
		return id;
	}
	it('rejects forged partial and full-word selections without a grant or for unfinished works', async () => {
		const styleId = await style();
		for (const resourceId of [resourceIds[0]!, resourceIds[2]!]) {
			for (const end of [0, 999]) {
				await setVerseHighlight(db, userId, reference, styleId, { resourceId, start: 0, end });
			}
		}
		expect((await listHighlightedVerses(db, userId, styleId, resourceIds[1]!))?.verses).toEqual([]);
	});
	it('retains old highlights but stops returning their text immediately after grant revocation', async () => {
		const styleId = await style();
		await db.insert(resourceUserGrants).values({ resourceId: resourceIds[0]!, userId });
		await setVerseHighlight(db, userId, reference, styleId, {
			resourceId: resourceIds[0]!,
			start: 0,
			end: 0
		});
		expect((await listHighlightedVerses(db, userId, styleId, null))?.verses[0]?.segments).toEqual(
			text
		);
		await db.delete(resourceUserGrants).where(eq(resourceUserGrants.userId, userId));
		const result = await listHighlightedVerses(db, userId, styleId, resourceIds[1]!);
		expect(result?.verses).toHaveLength(1);
		expect(result?.verses[0]?.segments).toBeNull();
	});
	it('validates the fallback Bible for whole-verse highlights too', async () => {
		const styleId = await style();
		await setVerseHighlight(db, userId, reference, styleId);
		for (const resourceId of [resourceIds[0]!, resourceIds[2]!]) {
			expect(
				(await listHighlightedVerses(db, userId, styleId, resourceId))?.verses[0]?.segments
			).toBeNull();
		}
		expect(
			(await listHighlightedVerses(db, userId, styleId, resourceIds[1]!))?.verses[0]?.segments
		).toEqual(text);
	});
	it.each(['personal', 'public'] as const)(
		'rejects %s API keys while their owner is disabled',
		async (scope) => {
			const { key, apiKey } = await createApiKey(db, userId, 'permissions test', scope);
			const request = new Request('http://localhost/api/v1/documents', {
				headers: { authorization: `Bearer ${key}` }
			});
			const authenticate = () => authenticateApiRequest(db, request, '127.0.0.1');
			expect((await authenticate()).ok).toBe(true);
			await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
			expect(await authenticate()).toEqual({ ok: false, status: 401, code: 'invalid_api_key' });
			await db.update(users).set({ disabledAt: null }).where(eq(users.id, userId));
			expect((await authenticate()).ok).toBe(true);
			await revokeApiKey(db, userId, apiKey.id);
			expect((await authenticate()).ok).toBe(false);
		}
	);
});
