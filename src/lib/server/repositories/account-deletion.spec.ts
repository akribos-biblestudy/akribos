import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { beginEmailLogin, consumeEmailLogin } from '../auth/email-login.ts';
import { feedbackReports } from '../db/feedback-schema.ts';
import { closeDb, getDb } from '../db/index.ts';
import {
	documentAttachments,
	documents,
	documentTags,
	emailLogins,
	loginAttempts,
	sessions,
	users,
	verseListInvites,
	verseLists
} from '../db/schema.ts';
import { deleteAccount } from './account-deletion.ts';

const db = getDb();
const prefix = `delete-account-${randomUUID()}`;
const email = `${prefix}@example.com`;
const otherEmail = `${prefix}-other@example.com`;
const feedbackId = randomUUID();

afterAll(async () => {
	await db.delete(feedbackReports).where(eq(feedbackReports.id, feedbackId));
	await db.delete(emailLogins).where(inArray(emailLogins.email, [email, otherEmail]));
	await db.delete(loginAttempts).where(like(loginAttempts.subject, `%${prefix}%`));
	await db.delete(users).where(inArray(users.email, [email, otherEmail]));
	await closeDb();
});

it('atomically deletes only the submitting account and invalidates an older unbound sign-in link', async () => {
	const staleAttempt = await beginEmailLogin(db, email, prefix, '/');
	if (staleAttempt.kind !== 'email') throw new Error('Expected a sign-in link');
	const [account, otherAccount] = await db
		.insert(users)
		.values([email, otherEmail].map((email) => ({ email, emailVerifiedAt: new Date() })))
		.returning({ id: users.id, email: users.email });
	const userId = account!.id;
	const otherUserId = otherAccount!.id;
	const expiresAt = new Date(Date.now() + 600_000);
	await db.insert(sessions).values([
		{ id: randomUUID(), userId, expiresAt },
		{ id: randomUUID(), userId: otherUserId, expiresAt }
	]);
	const [document] = await db
		.insert(documents)
		.values({ userId, kind: 'note', title: 'Note', bodyMarkdown: '', bodyHtml: '', plainText: '' })
		.returning({ id: documents.id });
	await db.insert(documentAttachments).values({
		userId,
		documentId: document!.id,
		filename: 'example.txt',
		mediaType: 'text/plain',
		content: Buffer.from('example'),
		sizeBytes: 7
	});
	const [parentTag] = await db
		.insert(documentTags)
		.values({ userId, name: 'A', normalizedName: 'a', path: 'A', normalizedPath: 'a' })
		.returning({ id: documentTags.id });
	await db.insert(documentTags).values({
		userId,
		name: 'B',
		normalizedName: 'b',
		path: 'A/B',
		normalizedPath: 'a/b',
		parentId: parentTag!.id
	});
	const [otherList] = await db
		.insert(verseLists)
		.values({ userId: otherUserId, title: 'Other account’s list' })
		.returning({ id: verseLists.id });
	await db.insert(verseListInvites).values({
		id: randomUUID(),
		listId: otherList!.id,
		email,
		invitedByUserId: otherUserId,
		expiresAt
	});
	await db
		.insert(feedbackReports)
		.values({ id: feedbackId, userId, category: 'content', description: 'Typo' });

	await expect(deleteAccount(db, userId, otherEmail)).resolves.toBe('unavailable');
	const results = await Promise.all([
		deleteAccount(db, userId, email),
		deleteAccount(db, userId, email)
	]);
	expect(results.sort()).toEqual(['deleted', 'unavailable']);
	expect(await consumeEmailLogin(db, { token: staleAttempt.token })).toBeNull();
	expect(
		await db
			.select()
			.from(loginAttempts)
			.where(eq(loginAttempts.subject, `email-login-start:email:${email}`))
	).toEqual([]);
	expect(await db.select().from(users).where(eq(users.id, userId))).toEqual([]);
	expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
	expect(await db.select().from(documents).where(eq(documents.userId, userId))).toEqual([]);
	expect(
		await db.select().from(documentAttachments).where(eq(documentAttachments.userId, userId))
	).toEqual([]);
	expect(await db.select().from(documentTags).where(eq(documentTags.userId, userId))).toEqual([]);
	expect(await db.select().from(verseListInvites).where(eq(verseListInvites.email, email))).toEqual(
		[]
	);
	expect(await db.select().from(verseLists).where(eq(verseLists.id, otherList!.id))).toHaveLength(
		1
	);
	expect(await db.select().from(sessions).where(eq(sessions.userId, otherUserId))).toHaveLength(1);
	expect(
		await db.select().from(feedbackReports).where(eq(feedbackReports.id, feedbackId))
	).toMatchObject([{ userId: null, description: 'Typo' }]);
});
