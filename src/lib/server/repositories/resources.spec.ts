import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { resources } from '../db/schema.ts';
import { invalidateResourceCache, listBibles } from './resources.ts';

describe.sequential('readable Bible resources', () => {
	const db = getDb();
	const publicReadyId = `PREVIEW-PUBLIC-${randomUUID()}`;
	const privateReadyId = `PREVIEW-PRIVATE-${randomUUID()}`;
	const publicImportingId = `PREVIEW-IMPORTING-${randomUUID()}`;
	const ids = [publicReadyId, privateReadyId, publicImportingId];

	beforeAll(async () => {
		await db.insert(resources).values([
			{
				id: publicReadyId,
				kind: 'bible',
				name: 'Public preview Bible',
				abbrev: 'Public',
				language: 'de',
				status: 'ready',
				isPublic: true
			},
			{
				id: privateReadyId,
				kind: 'bible',
				name: 'Private preview Bible',
				abbrev: 'Private',
				language: 'de',
				status: 'ready',
				isPublic: false
			},
			{
				id: publicImportingId,
				kind: 'bible',
				name: 'Incomplete preview Bible',
				abbrev: 'Incomplete',
				language: 'de',
				status: 'importing',
				isPublic: true
			}
		]);
		invalidateResourceCache();
	});

	afterAll(async () => {
		await db.delete(resources).where(inArray(resources.id, ids));
		invalidateResourceCache();
		await closeDb();
	});

	it('returns only public, completely imported Bibles to readers and preview callers', async () => {
		const visibleIds = new Set((await listBibles(db)).map((resource) => resource.id));
		expect(visibleIds.has(publicReadyId)).toBe(true);
		expect(visibleIds.has(privateReadyId)).toBe(false);
		expect(visibleIds.has(publicImportingId)).toBe(false);
	});
});
