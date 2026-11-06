import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { parseUsx } from '../../bible/parse/usx.ts';
import { usxArchive } from './usx.ts';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb, closeDb } from '../db/index.ts';
import { bibleDownloadGrants, resources, verseWords, verses } from '../db/schema.ts';
import { strongAssignmentReviews } from '../db/strong-review-schema.ts';
import { ingestBible } from '../import/ingest-bible.ts';
import type { ParseStream } from '../../bible/parse/types.ts';
import { bibleSnapshot } from './snapshot.ts';
import { parseBibleSnapshot, restoreBibleSnapshot } from './restore.ts';
import { parseUsxArchive } from '../import/usx-archive.ts';

const isolated =
	process.env.EXPORT_TEST_DATABASE === '1' &&
	(() => {
		try {
			return new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_export_test');
		} catch {
			return false;
		}
	})();
const db = isolated ? getDb() : null;
const id = `EXPORT-TEST-${randomUUID()}`;
const importedId = `${id}-USX`;
const segments = [
	{ kind: 'w' as const, text: 'Wort', strong: 'G3056' },
	{
		kind: 'note' as const,
		marker: '',
		text: 'Automatische Wortzuordnung; fachlich noch nicht bestätigt.'
	},
	' und ',
	{ kind: 'w' as const, text: 'Gott', strong: 'G2316' },
	{
		kind: 'note' as const,
		marker: '',
		text: 'Automatische Wortzuordnung; fachlich noch nicht bestätigt.'
	}
];
async function* source(): ParseStream {
	yield { type: 'metadata', metadata: { id, name: 'Testbibel', abbrev: 'TEST', language: 'de' } };
	yield { type: 'verse', verse: { book: 43, chapter: 1, verse: 1, segments, heading: 'Anfang' } };
}
afterAll(async () => {
	if (!db) return;
	await db.delete(resources).where(eq(resources.id, id));
	await db.delete(resources).where(eq(resources.id, importedId));
	await closeDb();
});

describe.skipIf(!isolated)('Bible snapshots', () => {
	const testDb = db!;
	it('round-trips verses, word enrichment and approved and pending reviews; public downloads need an explicit grant', async () => {
		await ingestBible(testDb, source(), { sourceFormat: 'test' });
		await testDb
			.update(verseWords)
			.set({ lemma: 'λόγος', translit: 'logos' })
			.where(and(eq(verseWords.resourceId, id), eq(verseWords.strong, 'G3056')));
		const [verse] = await testDb.select().from(verses).where(eq(verses.resourceId, id));
		const hash = createHash('sha256').update(JSON.stringify(verse!.segments)).digest('hex');
		await testDb.insert(strongAssignmentReviews).values([
			{
				resourceId: id,
				bookId: 43,
				chapter: 1,
				verse: 1,
				wordPosition: 0,
				strong: 'G3056',
				word: 'Wort',
				verseFingerprint: hash,
				decision: 'confirmed',
				approvedAt: new Date()
			},
			{
				resourceId: id,
				bookId: 43,
				chapter: 1,
				verse: 1,
				wordPosition: 1,
				strong: 'G2316',
				word: 'Gott',
				verseFingerprint: hash,
				decision: 'incorrect'
			}
		]);
		await testDb.update(resources).set({ isPublic: true }).where(eq(resources.id, id));
		expect(await bibleSnapshot(testDb, id, true)).toBeNull();
		await testDb.insert(bibleDownloadGrants).values({ resourceId: id });
		const publicSnapshot = await bibleSnapshot(testDb, id, true);
		expect(publicSnapshot?.reviews).toHaveLength(1);
		expect(publicSnapshot?.reviews[0]).not.toHaveProperty('authorId');
		expect(publicSnapshot?.reviews[0]).not.toHaveProperty('approvedBy');
		const backup = await bibleSnapshot(testDb, id, false);
		const portable = parseBibleSnapshot(JSON.stringify(backup));
		expect(portable.reviews).toHaveLength(2);
		await ingestBible(testDb, source(), { sourceFormat: 'test' });
		expect(await bibleSnapshot(testDb, id, true)).toBeNull();
		await restoreBibleSnapshot(testDb, portable);
		const restored = await bibleSnapshot(testDb, id, false);
		expect(restored?.verses).toEqual(backup?.verses);
		expect(restored?.reviews).toHaveLength(2);
		expect(
			restored?.reviews.find((review) => review.strong === 'G3056')?.approvedAt
		).not.toBeNull();
		expect(await bibleSnapshot(testDb, id, true)).toBeNull();
	});

	it('exports an exchange archive with usable USX and anonymous published decisions', async () => {
		await testDb.update(resources).set({ isPublic: true }).where(eq(resources.id, id));
		await testDb.insert(bibleDownloadGrants).values({ resourceId: id }).onConflictDoNothing();
		const snapshot = await bibleSnapshot(testDb, id, true);
		const files = unzipSync(usxArchive(snapshot!));
		const xml = strFromU8(files['43-JHN.usx']!);
		const events = [];
		for await (const event of parseUsx(xml)) events.push(event);
		const verse = events.find((event) => event.type === 'verse');
		expect(verse).toMatchObject({ verse: { book: 43, chapter: 1, verse: 1 } });
		expect(xml).toContain('strong="G03056"');
		const reviews = JSON.parse(strFromU8(files['strong-pruefungen.json']!)).reviews;
		expect(reviews).toHaveLength(1);
		expect(reviews[0]).not.toHaveProperty('authorId');
	});

	it('reimports explicitly approved USX reviews and leaves pending assignments unconfirmed', async () => {
		const original = await bibleSnapshot(testDb, id, false);
		const zip = usxArchive(original!);
		await ingestBible(testDb, parseUsxArchive(zip, 'Test.zip'), {
			sourceFormat: 'usx-zip',
			overrides: { id: importedId }
		});
		const restored = await bibleSnapshot(testDb, importedId, false);
		expect(restored?.reviews).toHaveLength(1);
		expect(restored?.reviews[0]).toMatchObject({
			strong: 'G3056',
			word: 'Wort',
			decision: 'confirmed',
			approvedAt: expect.any(Date)
		});
		const importedVerse = restored!.verses[0]!;
		const { strongAssignmentStatus } = await import('../../bible/strong-assignment.ts');
		const { overlayApprovedReviews } = await import('../strong-review/repository.ts');
		expect(strongAssignmentStatus(importedVerse.segments, 'G3056', 'Wort', 0)).toBe('unconfirmed');
		expect(
			strongAssignmentStatus(
				overlayApprovedReviews(importedVerse.segments, 'G3056', restored!.reviews as never),
				'G3056',
				'Wort',
				0
			)
		).toBeNull();
		expect(strongAssignmentStatus(importedVerse.segments, 'G2316', 'Gott', 1)).toBe('unconfirmed');
	});

	it('keeps a current pending review rather than silently overwriting it on reimport', async () => {
		const original = await bibleSnapshot(testDb, id, false);
		await testDb
			.update(strongAssignmentReviews)
			.set({ decision: 'incorrect', approvedAt: null })
			.where(
				and(
					eq(strongAssignmentReviews.resourceId, importedId),
					eq(strongAssignmentReviews.strong, 'G3056')
				)
			);
		const result = await ingestBible(testDb, parseUsxArchive(usxArchive(original!), 'Test.zip'), {
			sourceFormat: 'usx-zip',
			overrides: { id: importedId }
		});
		expect(
			result.warnings.some((warning) =>
				warning.includes('vorhandene Strong-Prüfungen bleiben unverändert')
			)
		).toBe(true);
		const [saved] = await testDb
			.select()
			.from(strongAssignmentReviews)
			.where(
				and(
					eq(strongAssignmentReviews.resourceId, importedId),
					eq(strongAssignmentReviews.strong, 'G3056')
				)
			);
		expect(saved?.decision).toBe('incorrect');
		expect(saved?.approvedAt).toBeNull();
	});

	it('does not overwrite any existing review when the reimport fingerprint differs', async () => {
		const original = await bibleSnapshot(testDb, id, false);
		await testDb
			.update(strongAssignmentReviews)
			.set({ decision: 'incorrect', verseFingerprint: 'f'.repeat(64), approvedAt: null })
			.where(
				and(
					eq(strongAssignmentReviews.resourceId, importedId),
					eq(strongAssignmentReviews.strong, 'G3056')
				)
			);
		const result = await ingestBible(testDb, parseUsxArchive(usxArchive(original!), 'Test.zip'), {
			sourceFormat: 'usx-zip',
			overrides: { id: importedId }
		});
		expect(
			result.warnings.some((warning) =>
				warning.includes('vorhandene Strong-Prüfungen bleiben unverändert')
			)
		).toBe(true);
		const [saved] = await testDb
			.select()
			.from(strongAssignmentReviews)
			.where(
				and(
					eq(strongAssignmentReviews.resourceId, importedId),
					eq(strongAssignmentReviews.strong, 'G3056')
				)
			);
		expect(saved?.verseFingerprint).toBe('f'.repeat(64));
		expect(saved?.decision).toBe('incorrect');
	});

	it('rejects a snapshot whose verse text was tampered with', async () => {
		const backup = await bibleSnapshot(testDb, id, false);
		const invalid = JSON.parse(JSON.stringify(backup));
		invalid.verses[0].text = 'anderer Text';
		expect(() => parseBibleSnapshot(JSON.stringify(invalid))).toThrow();
	});
});
