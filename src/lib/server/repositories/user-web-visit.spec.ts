import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { closeDb, getDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { recordWebVisit } from './users';

afterAll(closeDb);

it('preserves login data and records only due website timestamps for active accounts', async () => {
	const db = getDb();
	const id = randomUUID();
	const lastLoginAt = new Date('2024-01-02T03:04:05.000Z');
	await db.insert(users).values({ id, email: `${id}@example.com`, lastLoginAt });
	async function account() {
		const [row] = await db.select().from(users).where(eq(users.id, id));
		return row!;
	}
	try {
		expect(await account()).toMatchObject({ lastLoginAt, lastWebVisitAt: null });
		await Promise.all([recordWebVisit(db, id), recordWebVisit(db, id)]);
		const first = (await account()).lastWebVisitAt;
		expect(first).toBeInstanceOf(Date);
		await recordWebVisit(db, id);
		expect(await account()).toMatchObject({ lastLoginAt, lastWebVisitAt: first });

		const overdue = new Date(Date.now() - 6 * 60_000);
		await db.update(users).set({ lastWebVisitAt: overdue }).where(eq(users.id, id));
		await recordWebVisit(db, id);
		expect((await account()).lastWebVisitAt?.getTime()).toBeGreaterThan(overdue.getTime());

		await db
			.update(users)
			.set({ lastWebVisitAt: overdue, disabledAt: new Date() })
			.where(eq(users.id, id));
		await recordWebVisit(db, id);
		expect(await account()).toMatchObject({ lastLoginAt, lastWebVisitAt: overdue });
	} finally {
		await db.delete(users).where(eq(users.id, id));
	}
});
