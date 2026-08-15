import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { users, verseListInvites, verseLists } from '../db/schema.ts';
import { createUser } from './users.ts';
import { createVerseList, findListAccess } from './verse-lists.ts';
import {
	acceptVerseListInvite,
	createVerseListInvite,
	leaveVerseList,
	listMembersAndInvites,
	peekVerseListInvite,
	removeVerseListMember,
	revokeVerseListInvite
} from './verse-list-members.ts';

/**
 * Invitations to collaborate on a shared list: minting a token, resolving it read-only for the
 * landing page, and turning it into membership — including the cases the issue calls out as needing a
 * careful choice (an invite for someone else's address, an expired token, a repeat invite).
 */
describe('verse list invites and membership', () => {
	const db = getDb();
	const createdUserIds: string[] = [];
	const createdListIds: string[] = [];

	async function makeUser(email?: string): Promise<{ id: string; email: string }> {
		const address = email ?? `list-invite-spec-${randomUUID()}@example.com`;
		const result = await createUser(db, { email: address, password: 'a-fairly-good-password' });
		if (!result.ok) throw new Error('failed to create test user');
		createdUserIds.push(result.user.id);
		return { id: result.user.id, email: result.user.email };
	}

	async function makeList(ownerId: string): Promise<string> {
		const list = await createVerseList(db, ownerId, 'Shared list');
		createdListIds.push(list.id);
		return list.id;
	}

	afterAll(async () => {
		for (const id of createdListIds) {
			await db.delete(verseLists).where(eq(verseLists.id, id));
		}
		for (const id of createdUserIds) {
			await db.delete(users).where(eq(users.id, id));
		}
		await closeDb();
	});

	it('round-trips: invite, peek, accept, then the invitee has member access', async () => {
		const owner = await makeUser();
		const invitee = await makeUser();
		const listId = await makeList(owner.id);

		const invite = await createVerseListInvite(db, listId, invitee.email, owner.id);
		expect(invite.ok).toBe(true);
		if (!invite.ok) return;

		const peeked = await peekVerseListInvite(db, invite.token);
		expect(peeked?.listId).toBe(listId);
		expect(peeked?.email).toBe(invitee.email);

		const result = await acceptVerseListInvite(db, invite.token, invitee);
		expect(result).toEqual({ ok: true, listId });

		const access = await findListAccess(db, listId, invitee.id);
		expect(access).toEqual({ list: expect.objectContaining({ id: listId }), isOwner: false });

		// Single use: the same token cannot be accepted twice.
		const second = await acceptVerseListInvite(db, invite.token, invitee);
		expect(second).toEqual({ ok: false, reason: 'invalid' });
	});

	it('refuses to accept an invite with a different account than it was sent to', async () => {
		const owner = await makeUser();
		const invitee = await makeUser();
		const bystander = await makeUser();
		const listId = await makeList(owner.id);

		const invite = await createVerseListInvite(db, listId, invitee.email, owner.id);
		if (!invite.ok) throw new Error('expected the invite to be created');

		const result = await acceptVerseListInvite(db, invite.token, bystander);
		expect(result).toEqual({ ok: false, reason: 'emailMismatch' });

		// The invite itself is still open for its actual recipient afterwards.
		expect(await acceptVerseListInvite(db, invite.token, invitee)).toEqual({ ok: true, listId });
	});

	it('rejects an expired invite', async () => {
		const owner = await makeUser();
		const invitee = await makeUser();
		const listId = await makeList(owner.id);

		const invite = await createVerseListInvite(db, listId, invitee.email, owner.id);
		if (!invite.ok) throw new Error('expected the invite to be created');

		const id = createHash('sha256').update(invite.token).digest('hex');
		await db
			.update(verseListInvites)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(verseListInvites.id, id));

		expect(await peekVerseListInvite(db, invite.token)).toBeNull();
		expect(await acceptVerseListInvite(db, invite.token, invitee)).toEqual({
			ok: false,
			reason: 'invalid'
		});
	});

	it('refuses to invite the list owner, or someone already a member', async () => {
		const owner = await makeUser();
		const member = await makeUser();
		const listId = await makeList(owner.id);

		expect(await createVerseListInvite(db, listId, owner.email, owner.id)).toEqual({
			ok: false,
			reason: 'isOwner'
		});

		const invite = await createVerseListInvite(db, listId, member.email, owner.id);
		if (!invite.ok) throw new Error('expected the invite to be created');
		await acceptVerseListInvite(db, invite.token, member);

		expect(await createVerseListInvite(db, listId, member.email, owner.id)).toEqual({
			ok: false,
			reason: 'alreadyMember'
		});
	});

	it('a repeat invite to the same still-pending address replaces the old token', async () => {
		const owner = await makeUser();
		const invitee = await makeUser();
		const listId = await makeList(owner.id);

		const first = await createVerseListInvite(db, listId, invitee.email, owner.id);
		const second = await createVerseListInvite(db, listId, invitee.email, owner.id);
		if (!first.ok || !second.ok) throw new Error('expected both invites to be created');

		expect(await peekVerseListInvite(db, first.token)).toBeNull();
		expect(await peekVerseListInvite(db, second.token)).not.toBeNull();
	});

	it('lists accepted members and still-pending invites, and lets an owner remove either', async () => {
		const owner = await makeUser();
		const accepted = await makeUser();
		const pending = await makeUser();
		const listId = await makeList(owner.id);

		const acceptedInvite = await createVerseListInvite(db, listId, accepted.email, owner.id);
		const pendingInvite = await createVerseListInvite(db, listId, pending.email, owner.id);
		if (!acceptedInvite.ok || !pendingInvite.ok) throw new Error('expected invites to be created');
		await acceptVerseListInvite(db, acceptedInvite.token, accepted);

		let overview = await listMembersAndInvites(db, listId);
		expect(overview).toHaveLength(2);
		const acceptedRow = overview.find((row) => row.kind === 'accepted');
		const pendingRow = overview.find((row) => row.kind === 'pending');
		expect(acceptedRow).toMatchObject({ userId: accepted.id });
		expect(pendingRow).toMatchObject({ email: pending.email });

		await removeVerseListMember(db, listId, acceptedRow!.id);
		await revokeVerseListInvite(db, listId, pendingRow!.id);

		overview = await listMembersAndInvites(db, listId);
		expect(overview).toHaveLength(0);
		expect(await findListAccess(db, listId, accepted.id)).toBeUndefined();
	});

	it('lets a member leave a list they do not own', async () => {
		const owner = await makeUser();
		const member = await makeUser();
		const listId = await makeList(owner.id);

		const invite = await createVerseListInvite(db, listId, member.email, owner.id);
		if (!invite.ok) throw new Error('expected the invite to be created');
		await acceptVerseListInvite(db, invite.token, member);
		expect(await findListAccess(db, listId, member.id)).toBeDefined();

		await leaveVerseList(db, listId, member.id);
		expect(await findListAccess(db, listId, member.id)).toBeUndefined();
		// The owner's own access is unaffected.
		expect(await findListAccess(db, listId, owner.id)).toMatchObject({ isOwner: true });
	});
});
