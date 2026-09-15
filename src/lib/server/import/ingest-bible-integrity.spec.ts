import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { ParsedVerse, ParseStream } from '../../bible/parse/types.ts';
import { parseVpl } from '../../bible/parse/vpl.ts';
import { closeDb, getDb } from '../db/index.ts';
import { resources, resourceBooks, verses, verseWords } from '../db/schema.ts';
import { ingestBible } from './ingest-bible.ts';

const db = getDb();
const ids: string[] = [];
function resourceId() {
	const id = `IMPORT-REGRESSION-${randomUUID()}`;
	ids.push(id);
	return id;
}
const options = { sourceFormat: 'regression', batchSize: 1 };
const original: ParsedVerse = {
	book: 43,
	chapter: 3,
	verse: 16,
	segments: [{ kind: 'w', text: 'Gott', strong: 'G2316' }]
};
async function* source(id: string, rows: ParsedVerse[]): ParseStream {
	yield { type: 'metadata', metadata: { id, name: id, abbrev: 'TEST', language: 'de' } };
	for (const verse of rows) yield { type: 'verse', verse };
}
async function snapshot(id: string) {
	return {
		resource: await db.select().from(resources).where(eq(resources.id, id)),
		verses: await db.select().from(verses).where(eq(verses.resourceId, id)),
		words: await db.select().from(verseWords).where(eq(verseWords.resourceId, id)),
		books: await db.select().from(resourceBooks).where(eq(resourceBooks.resourceId, id))
	};
}

afterAll(async () => {
	await db.delete(resources).where(inArray(resources.id, ids));
	await closeDb();
});

describe('atomic Bible import and duplicates across batches', () => {
	it('rejects unrecognized and empty content while preserving all existing data', async () => {
		const id = resourceId();
		await ingestBible(db, source(id, [original]), options);
		const before = await snapshot(id);
		await expect(
			ingestBible(
				db,
				parseVpl('Nur Überschrift, ohne gültige Verszeile.', { metadata: { id } }),
				options
			)
		).rejects.toThrow('no usable Bible text');
		expect(await snapshot(id)).toEqual(before);
		await expect(
			ingestBible(db, source(id, [{ ...original, segments: [] }]), options)
		).rejects.toThrow('no usable Bible text');
		expect(await snapshot(id)).toEqual(before);
	});

	it('rolls back a late parser failure after batches were written, but commits a valid replacement', async () => {
		const id = resourceId();
		await ingestBible(db, source(id, [original]), options);
		const before = await snapshot(id);
		async function* broken(): ParseStream {
			yield* source(
				id,
				Array.from({ length: 5 }, (_, index) => ({
					...original,
					verse: index + 1,
					segments: ['Ersatz']
				}))
			);
			throw new Error('broken source');
		}
		await expect(ingestBible(db, broken(), options)).rejects.toThrow('broken source');
		expect(await snapshot(id)).toEqual(before);
		await ingestBible(
			db,
			source(id, [{ ...original, verse: 17, segments: ['Neuer Inhalt'] }]),
			options
		);
		const after = await snapshot(id);
		expect(after.verses).toHaveLength(1);
		expect(after.verses[0]).toMatchObject({ verse: 17, text: 'Neuer Inhalt' });
		expect(after.words).toHaveLength(0);
		expect(after.resource[0]).toMatchObject({ status: 'ready', verseCount: 1, wordCount: 0 });
	});

	it('keeps the first nonempty text across flushes and book switches and counts final rows', async () => {
		const id = resourceId();
		const empty = { ...original, verse: 1, segments: [] };
		const rows: ParsedVerse[] = [
			empty,
			original,
			{ ...original, verse: 17 },
			{ ...original, verse: 18 },
			{ ...original, verse: 1, segments: [{ kind: 'w', text: 'Sohn', strong: 'G5207' }] },
			{ ...original, book: 1, chapter: 1, verse: 1 },
			{ ...original, segments: ['Falscher späterer Text'] },
			{ ...original, verse: 1, segments: [] }
		];
		const result = await ingestBible(db, source(id, rows), options);
		const stored = await snapshot(id);
		expect(result).toMatchObject({ verseCount: 5, wordCount: 5 });
		expect(result.warnings).toHaveLength(3);
		expect(stored.verses.find((row) => row.bookId === 43 && row.verse === 16)?.text).toBe('Gott');
		expect(stored.verses.find((row) => row.bookId === 43 && row.verse === 1)?.text).toBe('Sohn');
		expect(stored.resource[0]).toMatchObject({
			verseCount: stored.verses.length,
			wordCount: stored.words.length
		});
	});
});
