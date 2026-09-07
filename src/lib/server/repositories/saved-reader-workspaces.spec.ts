import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '$lib/server/db';
import { savedReaderWorkspaces, users } from '$lib/server/db/schema';
import { MAX_SAVED_WORKSPACES } from '$lib/reader/saved-workspaces';
import { createUser } from './users';
import {
	changeSavedReaderWorkspace,
	getSavedReaderWorkspace,
	listSavedReaderWorkspaces
} from './saved-reader-workspaces';

const db = getDb();
const ids: string[] = [];
async function account() {
	const result = await createUser(db, {
		email: `workspace-${randomUUID()}@example.com`,
		password: 'a-fairly-good-password'
	});
	if (!result.ok) throw new Error('account creation failed');
	ids.push(result.user.id);
	return result.user.id;
}
const snapshot = {
	readerState: 'layout=single&tab=1.1:SEEDDE:A:Joh3,16&active=1.1&focus=1',
	layoutSizes: {}
};
afterAll(async () => {
	if (ids.length) await db.delete(users).where(inArray(users.id, ids));
	await closeDb();
});

describe('personal saved Reader workspaces', () => {
	it('isolates reads, renames, replacements and deletions by owner; rejects stale revisions', async () => {
		const owner = await account();
		const other = await account();
		const created = await changeSavedReaderWorkspace(db, owner, {
			action: 'create',
			name: '  Johannes  ',
			snapshot
		});
		if (!created.ok) throw new Error('create failed');
		const { id } = created.workspace;
		expect(created.workspace.name).toBe('Johannes');
		expect(await listSavedReaderWorkspaces(db, other)).toEqual([]);
		expect(await getSavedReaderWorkspace(db, other, id)).toBeNull();
		for (const change of [
			{ action: 'update' as const, id, revision: 1, name: 'Fremd', snapshot },
			{ action: 'delete' as const, id, revision: 1 }
		])
			expect(await changeSavedReaderWorkspace(db, other, change)).toEqual({
				ok: false,
				reason: 'notFound'
			});
		expect(
			await changeSavedReaderWorkspace(db, owner, {
				action: 'update',
				id,
				revision: 1,
				name: 'Wortstudie'
			})
		).toMatchObject({ ok: true, workspace: { revision: 2 } });
		expect((await getSavedReaderWorkspace(db, owner, id))!.snapshot).toEqual(snapshot);
		for (const change of [
			{ action: 'update' as const, id, revision: 1, name: 'Veraltet', snapshot },
			{ action: 'delete' as const, id, revision: 1 }
		])
			expect(await changeSavedReaderWorkspace(db, owner, change)).toEqual({
				ok: false,
				reason: 'conflict'
			});
		const next = { ...snapshot, readerState: snapshot.readerState.replace('Joh3,16', 'Röm8,1') };
		await changeSavedReaderWorkspace(db, owner, {
			action: 'update',
			id,
			revision: 2,
			name: 'Römerbrief',
			snapshot: next
		});
		expect((await getSavedReaderWorkspace(db, owner, id))!.snapshot).toEqual(next);
		expect(
			await changeSavedReaderWorkspace(db, owner, { action: 'delete', id, revision: 3 })
		).toMatchObject({ ok: true });
		expect(await getSavedReaderWorkspace(db, owner, id)).toBeNull();
	});
	it('bounds concurrent creates and enforces unique names within each account', async () => {
		const owner = await account();
		const results = await Promise.all(
			['Studium', 'studium'].map((name) =>
				changeSavedReaderWorkspace(db, owner, { action: 'create', name, snapshot })
			)
		);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: 'duplicateName' });
		const other = await account();
		expect(
			await changeSavedReaderWorkspace(db, other, { action: 'create', name: 'Studium', snapshot })
		).toMatchObject({ ok: true });
		await db.insert(savedReaderWorkspaces).values(
			Array.from({ length: MAX_SAVED_WORKSPACES - 2 }, (_, i) => ({
				userId: owner,
				name: `Workspace ${i}`,
				snapshot
			}))
		);
		const last = await Promise.all(
			['Letzter', 'Zu viel'].map((name) =>
				changeSavedReaderWorkspace(db, owner, { action: 'create', name, snapshot })
			)
		);
		expect(last.filter((result) => result.ok)).toHaveLength(1);
		expect(last.find((result) => !result.ok)).toEqual({ ok: false, reason: 'limit' });
		expect(await listSavedReaderWorkspaces(db, owner)).toHaveLength(MAX_SAVED_WORKSPACES);
		await db.delete(users).where(eq(users.id, owner));
		expect(
			await db.select().from(savedReaderWorkspaces).where(eq(savedReaderWorkspaces.userId, owner))
		).toHaveLength(0);
	});
});
