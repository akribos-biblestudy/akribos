import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { resources, resourceUserGrants, users, lexiconEntries } from '../db/schema.ts';
import { invalidateResourceCache, listResources } from './resources.ts';
import { replaceResourceUserGrants } from './resource-grants.ts';
import { findLexiconEntry, pickStatisticsResource } from './strong.ts';
import { updateDefaultBible } from './users.ts';

describe.sequential('private resource grants', () => {
	const db = getDb();
	const owner = randomUUID();
	const other = randomUUID();
	const prefix = `GRANT-${randomUUID()}`;
	const ids = ['bible', 'lexicon', 'draft'].map((suffix) => `${prefix}-${suffix}`);
	beforeAll(async () => {
		await db
			.insert(users)
			.values(
				[owner, other].map((id) => ({ id, email: `${id}@example.com`, passwordHash: 'unused' }))
			);
		await db.insert(resources).values(
			ids.map((id, index) => ({
				id,
				name: id,
				abbrev: id,
				language: 'grc',
				kind: index === 1 ? ('lexicon' as const) : ('bible' as const),
				isPublic: false,
				status: index === 2 ? ('draft' as const) : ('ready' as const),
				hasStrongs: true
			}))
		);
		await db.insert(lexiconEntries).values({
			resourceId: ids[1]!,
			strong: 'G26',
			language: 'grc',
			lemma: 'Preview',
			definitionHtml: '<p>Private lexicon text</p>'
		});
		invalidateResourceCache();
	});
	const visible = async (userId?: string) =>
		(await listResources(db, userId)).filter((r) => ids.includes(r.id)).map((r) => r.id);

	it('isolates grants by user and keeps unfinished imports unavailable', async () => {
		for (const id of ids) expect(await replaceResourceUserGrants(db, id, [owner])).toBe('saved');
		expect(await visible(owner)).toEqual(expect.arrayContaining(ids.slice(0, 2)));
		expect(await visible(owner)).not.toContain(ids[2]);
		expect(await visible(other)).toEqual([]);
		expect(await visible()).toEqual([]);
	});

	it('checks lexicon lookups, statistics and default-Bible changes against the grant', async () => {
		expect((await findLexiconEntry(db, ids[1]!, 'G26', owner))?.lemma).toBe('Preview');
		expect(await findLexiconEntry(db, ids[1]!, 'G26', other)).toBeUndefined();
		expect(await findLexiconEntry(db, ids[1]!, 'G26')).toBeUndefined();
		expect(await pickStatisticsResource(db, [ids[0]!], 'G26', owner)).toBe(ids[0]);
		expect(await pickStatisticsResource(db, [ids[0]!], 'G26', other)).not.toBe(ids[0]);
		expect(await updateDefaultBible(db, owner, ids[0]!)).toBe(true);
		expect(await updateDefaultBible(db, other, ids[0]!)).toBe(false);
	});

	it('rejects unknown accounts atomically and revokes access without waiting for a cache', async () => {
		expect(await replaceResourceUserGrants(db, ids[0]!, [randomUUID()])).toBe('users');
		expect(await visible(owner)).toContain(ids[0]);
		await replaceResourceUserGrants(db, ids[0]!, []);
		expect(await visible(owner)).not.toContain(ids[0]);
		expect(await updateDefaultBible(db, owner, ids[0]!)).toBe(false);
	});

	it('disabled accounts cannot use retained grants and deleting accounts removes grants', async () => {
		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, owner));
		expect(await visible(owner)).toEqual([]);
		expect(await findLexiconEntry(db, ids[1]!, 'G26', owner)).toBeUndefined();
		expect(await replaceResourceUserGrants(db, ids[0]!, [owner])).toBe('users');
		await db.delete(users).where(eq(users.id, owner));
		expect(
			await db.select().from(resourceUserGrants).where(eq(resourceUserGrants.userId, owner))
		).toEqual([]);
	});
	afterAll(async () => {
		await db.delete(resources).where(inArray(resources.id, ids));
		await db.delete(users).where(inArray(users.id, [owner, other]));
		invalidateResourceCache();
		await closeDb();
	});
});
