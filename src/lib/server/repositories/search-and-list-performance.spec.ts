import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { commentaryEntries, resources, users, verseListMembers, verseLists } from '../db/schema.ts';
import { searchCommentary } from './search.ts';
import {
	addVerseToList,
	createVerseList,
	listVerseLists,
	markedVersesByList
} from './verse-lists.ts';

describe('indexed commentary search and access-first collection reads', () => {
	const db = getDb();
	const resourceIds = [randomUUID(), randomUUID()];
	const userIds = [randomUUID(), randomUUID()];
	beforeAll(async () => {
		await db.insert(resources).values(
			resourceIds.map((id) => ({
				id,
				name: id,
				abbrev: id,
				kind: 'commentary' as const,
				language: 'de',
				status: 'ready' as const,
				isPublic: true
			}))
		);
		await db.insert(users).values(
			userIds.map((id, i) => ({
				id,
				email: `${id}@example.test`,
				displayName: i ? 'Other owner' : 'Reader'
			}))
		);
	});
	afterAll(async () => {
		await db.delete(resources).where(inArray(resources.id, resourceIds));
		await db.delete(users).where(inArray(users.id, userIds));
		await closeDb();
	});
	it('preserves title/body matching, phrase exclusions, pagination and unfiltered book counts', async () => {
		await db.insert(commentaryEntries).values([
			{
				resourceId: resourceIds[0]!,
				bookId: 43,
				chapter: 3,
				verseStart: 1,
				title: 'Hoffnung',
				bodyHtml: '<p>Am Anfang steht die Gnade.</p>'
			},
			{
				resourceId: resourceIds[0]!,
				bookId: 43,
				chapter: 3,
				verseStart: 2,
				title: null,
				bodyHtml: '<p>Hoffnung. Am anderen Anfang steht die Gnade.</p>'
			},
			{
				resourceId: resourceIds[0]!,
				bookId: 1,
				chapter: 1,
				verseStart: 1,
				title: 'Hoffnung',
				bodyHtml: '<p>Am Anfang steht die Furcht.</p>'
			},
			{
				resourceId: resourceIds[1]!,
				bookId: 43,
				chapter: 3,
				verseStart: 1,
				title: 'Hoffnung',
				bodyHtml: '<p>Foreign resource</p>'
			}
		]);
		const page = await searchCommentary(db, resourceIds[0]!, 'Hoffnung', {
			book: 43,
			page: 2,
			pageSize: 1
		});
		expect(page.total).toBe(2);
		expect(page.pageCount).toBe(2);
		expect(page.hits.map((hit) => hit.verseStart)).toEqual([2]);
		expect(page.bookCounts.filter((row) => row.count)).toEqual([
			{ book: 1, count: 1 },
			{ book: 43, count: 2 }
		]);
		const phrase = await searchCommentary(db, resourceIds[0]!, '"am Anfang" -Furcht');
		expect(phrase.hits.map((hit) => [hit.book, hit.verseStart])).toEqual([[43, 1]]);
	});
	it('automatically refreshes the stored vector after insert, update and delete', async () => {
		const [entry] = await db
			.insert(commentaryEntries)
			.values({
				resourceId: resourceIds[0]!,
				bookId: 2,
				chapter: 1,
				title: 'Überraschungen',
				bodyHtml: '<p>Die Bäume wachsen.</p>'
			})
			.returning();
		expect(
			(await searchCommentary(db, resourceIds[0]!, 'Uberraschung')).hits.map((hit) => hit.id)
		).toEqual([entry!.id]);
		expect((await searchCommentary(db, resourceIds[0]!, 'Baum')).hits.map((hit) => hit.id)).toEqual(
			[entry!.id]
		);
		await db
			.update(commentaryEntries)
			.set({ title: 'Erneuerung', bodyHtml: '<p>Lebensfreude</p>' })
			.where(eq(commentaryEntries.id, entry!.id));
		expect((await searchCommentary(db, resourceIds[0]!, 'Uberraschung')).total).toBe(0);
		expect((await searchCommentary(db, resourceIds[0]!, 'Baum')).total).toBe(0);
		expect(
			(await searchCommentary(db, resourceIds[0]!, 'Lebensfreude')).hits.map((hit) => hit.id)
		).toEqual([entry!.id]);
		await db.delete(commentaryEntries).where(eq(commentaryEntries.id, entry!.id));
		expect((await searchCommentary(db, resourceIds[0]!, 'Lebensfreude')).total).toBe(0);
	});
	it('counts only owned and shared lists, including empty lists, and honors immediate revocation', async () => {
		const reader = userIds[0]!;
		const owner = userIds[1]!;
		const own = await createVerseList(db, reader, 'Own');
		const empty = await createVerseList(db, reader, 'Empty');
		const shared = await createVerseList(db, owner, 'Shared');
		const foreign = await createVerseList(db, owner, 'Foreign');
		await db.insert(verseListMembers).values([
			{ listId: own.id, userId: reader },
			{ listId: shared.id, userId: reader }
		]);
		await addVerseToList(db, own.id, { book: 43, chapter: 3, verse: 16, verseEnd: 18 }, reader);
		await addVerseToList(db, shared.id, { book: 43, chapter: 3, verse: 19 }, owner);
		await addVerseToList(db, shared.id, { book: 1, chapter: 1, verse: 1 }, owner);
		await addVerseToList(db, foreign.id, { book: 43, chapter: 3, verse: 20 }, owner);
		await db
			.update(verseLists)
			.set({ updatedAt: new Date('2090-01-01') })
			.where(eq(verseLists.id, shared.id));
		const lists = await listVerseLists(db, reader);
		expect(lists).toHaveLength(3);
		expect(lists[0]).toMatchObject({
			id: shared.id,
			itemCount: 2,
			role: 'member',
			ownerName: 'Other owner'
		});
		expect(lists.find((list) => list.id === own.id)).toMatchObject({
			itemCount: 3,
			role: 'owner',
			ownerName: null
		});
		expect(lists.find((list) => list.id === empty.id)?.itemCount).toBe(0);
		const marks = await markedVersesByList(db, reader, 43, 3);
		expect(
			marks
				.filter((mark) => mark.listId === own.id)
				.map((mark) => mark.verse)
				.sort((a, b) => a - b)
		).toEqual([16, 17, 18]);
		expect(marks.filter((mark) => mark.listId === shared.id).map((mark) => mark.verse)).toEqual([
			19
		]);
		expect(marks.some((mark) => mark.listId === foreign.id)).toBe(false);
		await db
			.delete(verseListMembers)
			.where(and(eq(verseListMembers.listId, shared.id), eq(verseListMembers.userId, reader)));
		expect((await listVerseLists(db, reader)).map((list) => list.id).sort()).toEqual(
			[own.id, empty.id].sort()
		);
		expect(
			(await markedVersesByList(db, reader, 43, 3)).some((mark) => mark.listId === shared.id)
		).toBe(false);
	});
});
