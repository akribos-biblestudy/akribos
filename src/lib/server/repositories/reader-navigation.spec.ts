import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import {
	commentaryEntries,
	crossReferences,
	resourceBooks,
	resources,
	resourceUserGrants,
	users,
	verses
} from '../db/schema.ts';
import { loadReaderNavigation } from './reader-navigation.ts';

describe.sequential('reader book and chapter navigation', () => {
	const db = getDb();
	const userId = randomUUID();
	const ids = ['bible', 'commentary', 'xrefs', 'lexicon', 'draft'].map(
		(kind) => `NAV-${kind}-${randomUUID()}`
	);
	beforeAll(async () => {
		await db.insert(users).values({ id: userId, email: `${userId}@example.com` });
		await db.insert(resources).values(
			ids.map((id, index) => ({
				id,
				name: id,
				abbrev: id,
				language: 'de',
				kind: (['bible', 'commentary', 'xrefs', 'lexicon', 'bible'] as const)[index]!,
				status: index === 4 ? ('importing' as const) : ('ready' as const),
				isPublic: index !== 0,
				apiEnabled: false
			}))
		);
		await db
			.insert(resourceBooks)
			.values({ resourceId: ids[0]!, bookId: 43, chapterCount: 3, verseCount: 3 });
		await db.insert(verses).values(
			[1, 3, 3].map((chapter, index) => ({
				resourceId: ids[0]!,
				bookId: 43,
				chapter,
				verse: index + 1,
				text: 'Navigation',
				segments: ['Navigation']
			}))
		);
		await db.insert(commentaryEntries).values(
			[ids[1]!, ids[2]!].map((resourceId) => ({
				resourceId,
				bookId: 43,
				chapter: 3,
				bodyHtml: '<p>Kommentar</p>'
			}))
		);
		await db.insert(crossReferences).values({
			resourceId: ids[2]!,
			fromBook: 1,
			fromChapter: 2,
			fromVerse: 1,
			toBook: 43,
			toChapter: 1,
			toVerse: 1,
			toVerseEnd: 1
		});
	});
	afterAll(async () => {
		await db.delete(resources).where(inArray(resources.id, ids));
		await db.delete(users).where(eq(users.id, userId));
		await closeDb();
	});
	it('requires a current reader grant and keeps missing chapters out despite a higher chapter_count', async () => {
		expect(await loadReaderNavigation(db, ids[0]!)).toBeUndefined();
		expect(await loadReaderNavigation(db, ids[0]!, userId)).toBeUndefined();
		await db.insert(resourceUserGrants).values({ resourceId: ids[0]!, userId });
		expect(await loadReaderNavigation(db, ids[0]!, userId)).toEqual([
			{ book: 43, chapters: [1, 3] }
		]);
		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
		expect(await loadReaderNavigation(db, ids[0]!, userId)).toBeUndefined();
		await db.update(users).set({ disabledAt: null }).where(eq(users.id, userId));
		await db.delete(resourceUserGrants).where(eq(resourceUserGrants.resourceId, ids[0]!));
		expect(await loadReaderNavigation(db, ids[0]!, userId)).toBeUndefined();
	});
	it('reads commentary chapters and both cross-reference formats, not their target chapters', async () => {
		expect(await loadReaderNavigation(db, ids[1]!)).toEqual([{ book: 43, chapters: [3] }]);
		expect(await loadReaderNavigation(db, ids[2]!)).toEqual([
			{ book: 1, chapters: [2] },
			{ book: 43, chapters: [3] }
		]);
	});
	it('does not offer unfinished imports, lexicons or unknown resources', async () => {
		expect(await loadReaderNavigation(db, ids[3]!)).toBeUndefined();
		expect(await loadReaderNavigation(db, ids[4]!)).toBeUndefined();
		expect(await loadReaderNavigation(db, 'UNKNOWN-NAV')).toBeUndefined();
	});
});
