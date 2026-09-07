import { createHash, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { emailVerifications, resources, users } from '../db/schema.ts';
import {
	consumeEmailVerification,
	createEmailVerification,
	createUser,
	markEmailVerified,
	peekEmailVerification,
	updateDefaultBible
} from './users.ts';

/**
 * Account-activation tokens.
 *
 * Runs against a real database (see `closeDb`, kept around for exactly this) rather than mocking
 * drizzle's query builder, since the behaviour that matters — single use, expiry, the token itself
 * never being stored — lives in the SQL `where` clause, not in application code a mock would exercise
 * meaningfully.
 */
describe('email verification tokens', () => {
	const db = getDb();
	const createdUserIds: string[] = [];

	async function makeUser(): Promise<string> {
		const email = `verify-spec-${randomUUID()}@example.com`;
		const result = await createUser(db, { email, password: 'a-fairly-good-password' });
		if (!result.ok) throw new Error('failed to create test user');
		createdUserIds.push(result.user.id);
		return result.user.id;
	}

	afterAll(async () => {
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		await closeDb();
	});

	it('restricts the default translation to public ready Bibles and clears deleted choices', async () => {
		const userId = await makeUser();
		const otherId = await makeUser();
		const prefix = `DEFAULT-${randomUUID()}`;
		const ids = ['public', 'private', 'draft', 'lexicon'].map((suffix) => `${prefix}-${suffix}`);
		await db.insert(resources).values(
			ids.map((id, index) => ({
				id,
				name: id,
				abbrev: id,
				language: 'de',
				kind: index === 3 ? ('lexicon' as const) : ('bible' as const),
				status: index === 2 ? ('draft' as const) : ('ready' as const),
				isPublic: index !== 1
			}))
		);
		try {
			expect(await updateDefaultBible(db, userId, ids[0]!)).toBe(true);
			for (const id of [...ids.slice(1), `${prefix}-missing`])
				expect(await updateDefaultBible(db, userId, id)).toBe(false);
			const read = async (id: string) =>
				(await db.select().from(users).where(eq(users.id, id)))[0]!.defaultBibleId;
			expect(await read(userId)).toBe(ids[0]);
			expect(await read(otherId)).toBeNull();
			expect(await updateDefaultBible(db, userId, null)).toBe(true);
			expect(await read(userId)).toBeNull();
			await updateDefaultBible(db, userId, ids[0]!);
			await db.delete(resources).where(eq(resources.id, ids[0]!));
			expect(await read(userId)).toBeNull();
		} finally {
			await db.delete(resources).where(inArray(resources.id, ids));
		}
	});

	it('round-trips: a freshly issued token is valid, consuming it returns the owning user', async () => {
		const userId = await makeUser();
		const token = await createEmailVerification(db, userId);

		await expect(peekEmailVerification(db, token)).resolves.toBe(true);

		const result = await consumeEmailVerification(db, token);
		expect(result).toEqual({ userId });
	});

	it('never stores the raw token, only its hash', async () => {
		const userId = await makeUser();
		const token = await createEmailVerification(db, userId);
		const expectedId = createHash('sha256').update(token).digest('hex');

		const [row] = await db
			.select()
			.from(emailVerifications)
			.where(eq(emailVerifications.userId, userId));

		expect(row?.id).toBe(expectedId);
		expect(row?.id).not.toBe(token);
	});

	it('is single-use: a second consume of the same token fails', async () => {
		const userId = await makeUser();
		const token = await createEmailVerification(db, userId);

		await expect(consumeEmailVerification(db, token)).resolves.toEqual({ userId });
		await expect(consumeEmailVerification(db, token)).resolves.toBeNull();
		await expect(peekEmailVerification(db, token)).resolves.toBe(false);
	});

	it('rejects an unknown token', async () => {
		await expect(consumeEmailVerification(db, 'not-a-real-token')).resolves.toBeNull();
		await expect(peekEmailVerification(db, 'not-a-real-token')).resolves.toBe(false);
	});

	it('rejects an expired token', async () => {
		const userId = await makeUser();
		const token = 'expired-test-token';

		await db.insert(emailVerifications).values({
			id: createHash('sha256').update(token).digest('hex'),
			userId,
			// Already in the past, unlike the 24h TTL `createEmailVerification` issues.
			expiresAt: new Date(Date.now() - 1000)
		});

		await expect(peekEmailVerification(db, token)).resolves.toBe(false);
		await expect(consumeEmailVerification(db, token)).resolves.toBeNull();
	});

	it('marks the account as verified', async () => {
		const userId = await makeUser();

		await markEmailVerified(db, userId);

		const [row] = await db.select().from(users).where(eq(users.id, userId));
		expect(row?.emailVerifiedAt).toBeInstanceOf(Date);
	});
});
