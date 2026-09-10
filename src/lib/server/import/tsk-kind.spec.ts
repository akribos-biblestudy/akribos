import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { ParseStream } from '../../bible/parse/types.ts';
import { closeDb, getDb } from '../db/index.ts';
import { commentaryEntries, resources } from '../db/schema.ts';
import { ingestCommentary } from './ingest-simple.ts';
import { backfillTskResourceKind } from './backfill-tsk-kind.ts';

describe.sequential('TSK cross-reference category', () => {
	const db = getDb();
	const ids = [`TSK-${randomUUID()}`, `COMMENTARY-${randomUUID()}`];
	async function* stream(): ParseStream {
		yield {
			type: 'metadata',
			metadata: {
				id: 'TSK',
				abbrev: 'TSK',
				name: 'Treasury of Scripture Knowledge',
				language: 'en'
			}
		};
		yield {
			type: 'commentaryEntry',
			entry: {
				book: 43,
				chapter: 3,
				verseStart: 16,
				verseEnd: 16,
				title: 'For God',
				bodyHtml: '<p>See <a href="/1Mo1,1">Genesis 1,1</a>.</p>'
			}
		};
	}
	afterAll(async () => {
		await db.delete(resources).where(inArray(resources.id, ids));
		await closeDb();
	});
	it('classifies SWORD TSK before applying metadata overrides and preserves its annotated text', async () => {
		const result = await ingestCommentary(db, stream(), {
			sourceFormat: 'sword-commentary',
			overrides: { id: ids[0], name: 'Meine Parallelstellen', abbrev: 'TSK' }
		});
		expect(result.kind).toBe('xrefs');
		const [resource] = await db.select().from(resources).where(eq(resources.id, ids[0]!));
		expect(resource).toMatchObject({
			kind: 'xrefs',
			name: 'Meine Parallelstellen',
			status: 'ready'
		});
		const [entry] = await db
			.select()
			.from(commentaryEntries)
			.where(eq(commentaryEntries.resourceId, ids[0]!));
		expect(entry).toMatchObject({
			title: 'For God',
			bodyHtml: '<p>See <a href="/1Mo1,1">Genesis 1,1</a>.</p>'
		});
	});
	it('corrects legacy TSK once without changing content, visibility, titles or unrelated commentaries', async () => {
		await db
			.update(resources)
			.set({ kind: 'commentary', isPublic: false, tabTitle: 'Persönlich', sortOrder: 170 })
			.where(eq(resources.id, ids[0]!));
		await ingestCommentary(db, stream(), {
			sourceFormat: 'commentary-csv',
			overrides: { id: ids[1] }
		});
		const before = await db
			.select()
			.from(commentaryEntries)
			.where(eq(commentaryEntries.resourceId, ids[0]!));
		expect(await backfillTskResourceKind(db)).toBe(1);
		expect(await backfillTskResourceKind(db)).toBe(0);
		const [resource] = await db.select().from(resources).where(eq(resources.id, ids[0]!));
		expect(resource).toMatchObject({
			kind: 'xrefs',
			isPublic: false,
			tabTitle: 'Persönlich',
			sortOrder: 170
		});
		expect(
			await db.select().from(commentaryEntries).where(eq(commentaryEntries.resourceId, ids[0]!))
		).toEqual(before);
		const [commentary] = await db.select().from(resources).where(eq(resources.id, ids[1]!));
		expect(commentary?.kind).toBe('commentary');
	});
});
