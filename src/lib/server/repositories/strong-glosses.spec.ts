import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { resources, verses, verseWords } from '../db/schema.ts';
import { refreshStrongStatisticsBlocking } from '../db/statistics.ts';
import { loadStrongGlosses, loadStrongOccurrences, loadStrongStatistics } from './strong.ts';

describe('German translation lemmas in Strong word studies', () => {
	const db = getDb();
	const strong = 'G932';
	const originalLemma = 'βασιλεία';
	const languages = ['de', 'de-CH', 'en', 'und'] as const;
	const resourceIds = languages.map((language) => `GLOSS-${language}-${randomUUID()}`);
	const fixtures: {
		book: number;
		chapter: number;
		verse: number;
		forms: [string, number][];
	}[] = [
		{
			book: 40,
			chapter: 1,
			verse: 1,
			forms: [
				['Reich', 30],
				['Reiche', 10]
			]
		},
		{
			book: 40,
			chapter: 1,
			verse: 2,
			forms: [
				['Reich', 30],
				['Reiches', 20]
			]
		},
		{ book: 40, chapter: 1, verse: 3, forms: [['Reiche', 20]] },
		{
			book: 43,
			chapter: 3,
			verse: 16,
			forms: [
				['Reiche', 20],
				['Reiches', 20]
			]
		},
		{
			book: 43,
			chapter: 3,
			verse: 17,
			forms: [
				['Königreich', 5],
				['Königreiche', 4],
				['das', 62],
				['das Reich', 1],
				['Neulichtwort', 1]
			]
		}
	];

	beforeAll(async () => {
		await db.insert(resources).values(
			resourceIds.map((id, index) => ({
				id,
				name: id,
				abbrev: id,
				kind: 'bible' as const,
				language: languages[index]!,
				status: 'ready' as const,
				sortOrder: 100_000,
				hasStrongs: true
			}))
		);
		for (const resourceId of resourceIds) {
			for (const fixture of fixtures) {
				const words = fixture.forms.flatMap(([word, count]) => Array<string>(count).fill(word));
				const text = words.join(' ');
				const [verse] = await db
					.insert(verses)
					.values({
						resourceId,
						bookId: fixture.book,
						chapter: fixture.chapter,
						verse: fixture.verse,
						segments: [text],
						text
					})
					.returning({ id: verses.id });
				await db.insert(verseWords).values(
					words.map((word, position) => ({
						resourceId,
						verseId: verse!.id,
						bookId: fixture.book,
						position,
						word,
						strong,
						lemma: originalLemma,
						morph: 'N-NSF'
					}))
				);
			}
		}
		await refreshStrongStatisticsBlocking(db);
	}, 30_000);

	afterAll(async () => {
		try {
			await db.delete(resources).where(inArray(resources.id, resourceIds));
			await refreshStrongStatisticsBlocking(db);
		} finally {
			await closeDb();
		}
	}, 30_000);

	it('groups German inflections before limiting and preserves their frequencies and total', async () => {
		for (const resourceId of resourceIds.slice(0, 2)) {
			const glosses = await loadStrongGlosses(db, strong, resourceId, 20);
			expect(glosses.map(({ display, occurrences }) => ({ display, occurrences }))).toEqual([
				{ display: 'Reich', occurrences: 150 },
				{ display: 'das', occurrences: 62 },
				{ display: 'Königreich', occurrences: 9 },
				{ display: 'das Reich', occurrences: 1 },
				{ display: 'Neulichtwort', occurrences: 1 }
			]);
			expect(glosses[0]?.forms).toEqual([
				{ display: 'Reich', occurrences: 60 },
				{ display: 'Reiche', occurrences: 50 },
				{ display: 'Reiches', occurrences: 40 }
			]);
			expect(glosses[2]?.forms).toEqual([
				{ display: 'Königreich', occurrences: 5 },
				{ display: 'Königreiche', occurrences: 4 }
			]);
			expect(glosses.reduce((total, gloss) => total + gloss.occurrences, 0)).toBe(223);
			expect(await loadStrongStatistics(db, strong, resourceId)).toEqual({
				occurrences: 223,
				verseCount: 5
			});
			// The most frequent individual spelling is "das" (62), but the first lemma is Reich (150).
			expect(await loadStrongGlosses(db, strong, resourceId, 1)).toEqual([glosses[0]]);
		}
	});

	it('resolves lemma and old inflected filters to distinct verses with book filters and pagination', async () => {
		const resourceId = resourceIds[0]!;
		for (const gloss of ['Reich', 'Reiche', 'Reiches']) {
			const result = await loadStrongOccurrences(db, strong, resourceId, { gloss });
			expect(result.total).toBe(4);
			expect(result.occurrences.map(({ book, chapter, verse }) => [book, chapter, verse])).toEqual([
				[40, 1, 1],
				[40, 1, 2],
				[40, 1, 3],
				[43, 3, 16]
			]);
			expect(
				result.occurrences.every(({ lemma, morph }) => lemma === originalLemma && morph === 'N-NSF')
			).toBe(true);
		}
		const secondPage = await loadStrongOccurrences(db, strong, resourceId, {
			gloss: 'Reiches',
			page: 2,
			pageSize: 2
		});
		expect(secondPage).toMatchObject({ total: 4, page: 2, pageCount: 2 });
		expect(secondPage.occurrences.map(({ book, verse }) => [book, verse])).toEqual([
			[40, 3],
			[43, 16]
		]);
		const john = await loadStrongOccurrences(db, strong, resourceId, {
			gloss: 'Reich',
			book: 43,
			pageSize: 1
		});
		expect(john).toMatchObject({ total: 1, page: 1, pageCount: 1 });
		expect(john.occurrences.map(({ verse }) => verse)).toEqual([16]);
		const stored = await db
			.select({ lemma: verseWords.lemma })
			.from(verseWords)
			.where(eq(verseWords.resourceId, resourceId));
		expect(stored).toHaveLength(223);
		expect(stored.every(({ lemma }) => lemma === originalLemma)).toBe(true);
	});

	it('keeps unknown words and multiword renderings separate from recognized lemmas', async () => {
		const resourceId = resourceIds[0]!;
		for (const gloss of ['das', 'das Reich', 'Neulichtwort']) {
			const result = await loadStrongOccurrences(db, strong, resourceId, { gloss });
			expect(result.total).toBe(1);
			expect(result.occurrences.map(({ book, chapter, verse }) => [book, chapter, verse])).toEqual([
				[43, 3, 17]
			]);
		}
		const missing = await loadStrongOccurrences(db, strong, resourceId, { gloss: 'Unbekanntwort' });
		expect(missing.total).toBe(0);
		expect(missing.occurrences).toEqual([]);
	});

	it('does not apply German lemma groups to foreign or unspecified resource languages', async () => {
		for (const resourceId of resourceIds.slice(2)) {
			const glosses = await loadStrongGlosses(db, strong, resourceId, 20);
			expect(glosses.map(({ display, occurrences }) => ({ display, occurrences }))).toEqual([
				{ display: 'das', occurrences: 62 },
				{ display: 'Reich', occurrences: 60 },
				{ display: 'Reiche', occurrences: 50 },
				{ display: 'Reiches', occurrences: 40 },
				{ display: 'Königreich', occurrences: 5 },
				{ display: 'Königreiche', occurrences: 4 },
				{ display: 'das Reich', occurrences: 1 },
				{ display: 'Neulichtwort', occurrences: 1 }
			]);
			const result = await loadStrongOccurrences(db, strong, resourceId, { gloss: 'Reiches' });
			expect(result.total).toBe(2);
			expect(result.occurrences.map(({ book, verse }) => [book, verse])).toEqual([
				[40, 2],
				[43, 16]
			]);
		}
	});

	it('distinguishes noun and verb lemmas while retaining old and case-ambiguous filters', async () => {
		const resourceId = `GLOSS-CASE-${randomUUID()}`;
		const caseStrong = 'G2198';
		try {
			await db.insert(resources).values({
				id: resourceId,
				name: resourceId,
				abbrev: resourceId,
				kind: 'bible',
				language: 'de',
				status: 'ready',
				sortOrder: 100_000,
				hasStrongs: true
			});
			for (const fixture of [
				{ word: 'Lebens', verse: 1, count: 2 },
				{ word: 'lebt', verse: 2, count: 1 }
			]) {
				const words = Array<string>(fixture.count).fill(fixture.word);
				const text = words.join(' ');
				const [verse] = await db
					.insert(verses)
					.values({
						resourceId,
						bookId: 43,
						chapter: 1,
						verse: fixture.verse,
						segments: [text],
						text
					})
					.returning({ id: verses.id });
				await db.insert(verseWords).values(
					words.map((word, position) => ({
						resourceId,
						verseId: verse!.id,
						bookId: 43,
						position,
						word,
						strong: caseStrong,
						lemma: 'ζάω'
					}))
				);
			}
			await refreshStrongStatisticsBlocking(db);
			const glosses = await loadStrongGlosses(db, caseStrong, resourceId);
			expect(glosses).toEqual([
				{
					display: 'Leben',
					occurrences: 2,
					forms: [{ display: 'Lebens', occurrences: 2 }]
				},
				{
					display: 'leben',
					occurrences: 1,
					forms: [{ display: 'lebt', occurrences: 1 }]
				}
			]);
			expect(await loadStrongGlosses(db, caseStrong, resourceId, 1)).toEqual([glosses[0]]);
			for (const selected of ['leben', 'lebt', 'LEBEN']) {
				expect(await loadStrongGlosses(db, caseStrong, resourceId, 1, selected)).toEqual(glosses);
			}
			expect(await loadStrongGlosses(db, caseStrong, resourceId, 1, 'Leben')).toEqual([glosses[0]]);
			for (const [gloss, expectedVerses] of [
				['Leben', [1]],
				['leben', [2]],
				['Lebens', [1]],
				['LEBEN', [1, 2]]
			] as const) {
				const result = await loadStrongOccurrences(db, caseStrong, resourceId, { gloss });
				expect(result.total).toBe(expectedVerses.length);
				expect(result.occurrences.map(({ verse }) => verse)).toEqual(expectedVerses);
			}
		} finally {
			await db.delete(resources).where(eq(resources.id, resourceId));
			await refreshStrongStatisticsBlocking(db);
		}
	}, 30_000);
});
