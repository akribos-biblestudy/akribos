import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { apiKeys, apiRequests, users } from '../db/schema.ts';
import { createApiKey } from '../repositories/api-keys.ts';
import { authenticateApiRequest } from './gate.ts';
import { startApiMaintenance } from './maintenance.ts';
import { API_REQUEST_PRUNE_BATCH_SIZE, checkApiRateLimit, pruneApiRequests } from './rate-limit.ts';

const db = getDb();
const subject = `api-maintenance-${randomUUID()}`;
const currentSubject = subject + '-current';
let userId: string | undefined;
afterAll(async () => {
	await db.delete(apiRequests).where(inArray(apiRequests.subject, [subject, currentSubject]));
	if (userId) await db.delete(users).where(eq(users.id, userId));
	await closeDb();
});

it('records each successful key use and leaves revoked keys untouched', async () => {
	const [owner] = await db
		.insert(users)
		.values({ email: `api-last-used-${randomUUID()}@example.test` })
		.returning();
	userId = owner!.id;
	const key = await createApiKey(db, userId, 'Usage regression', 'personal');
	const request = new Request('http://localhost/api/v1/resources', {
		headers: { authorization: `Bearer ${key.key}` }
	});
	expect((await authenticateApiRequest(db, request, '127.0.0.1')).ok).toBe(true);
	const [first] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.apiKey.id));
	expect(first?.lastUsedAt).toBeInstanceOf(Date);
	await db
		.update(apiKeys)
		.set({ lastUsedAt: new Date(0) })
		.where(eq(apiKeys.id, key.apiKey.id));
	expect((await authenticateApiRequest(db, request, '127.0.0.1')).ok).toBe(true);
	const [second] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.apiKey.id));
	expect(second!.lastUsedAt!.getTime()).toBeGreaterThan(0);
	await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, key.apiKey.id));
	expect((await authenticateApiRequest(db, request, '127.0.0.1')).ok).toBe(false);
	const [revoked] = await db.select().from(apiKeys).where(eq(apiKeys.id, key.apiKey.id));
	expect(revoked!.lastUsedAt).toEqual(second!.lastUsedAt);
});

it('prunes bounded batches and the running maintenance drains inactive subjects while preserving the rate window', async () => {
	const old = new Date(Date.now() - 5 * 60_000);
	await db.insert(apiRequests).values(
		Array.from({ length: API_REQUEST_PRUNE_BATCH_SIZE + 2 }, () => ({
			subject,
			requestedAt: old
		}))
	);
	await checkApiRateLimit(db, currentSubject, 2);
	const removed = await pruneApiRequests(db);
	expect(removed).toBe(API_REQUEST_PRUNE_BATCH_SIZE);
	const stop = startApiMaintenance(db);
	try {
		await expect
			.poll(
				async () =>
					(await db.select().from(apiRequests).where(eq(apiRequests.subject, subject))).length
			)
			.toBe(0);
		expect(await checkApiRateLimit(db, currentSubject, 2)).toMatchObject({
			allowed: true,
			remaining: 0
		});
		expect(await checkApiRateLimit(db, currentSubject, 2)).toMatchObject({
			allowed: false,
			remaining: 0
		});
	} finally {
		stop();
	}
});
