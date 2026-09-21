import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '$lib/server/db';
import { savedReaderWorkspaces, sessions, users } from '$lib/server/db/schema';
import {
	MAX_SAVED_WORKSPACES,
	restoreSavedWorkspace,
	type SavedWorkspaceSnapshot
} from '$lib/reader/saved-workspaces';
import { createUser } from './users';
import {
	changeSavedReaderWorkspace,
	getSavedReaderWorkspace,
	listSavedReaderWorkspaces,
	ensureDefaultReaderWorkspace,
	getActiveReaderWorkspace,
	activateSavedReaderWorkspace,
	persistReaderWorkspace,
	saveActiveWorkspaceView,
	workspaceSelection,
	type ActiveReaderWorkspace,
	type WorkspaceWriteGuard
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
	const userId = result.user.id;
	return { userId, sessionId: await device(userId) };
}
async function device(userId: string) {
	const id = randomUUID();
	await db.insert(sessions).values({ id, userId, expiresAt: new Date(Date.now() + 3_600_000) });
	return id;
}
const snapshot: SavedWorkspaceSnapshot = restoreSavedWorkspace(
	{
		readerState: 'layout=single&tab=1.1:SEEDDE:A:Joh3,16&active=1.1&focus=1',
		layoutSizes: {}
	},
	['SEEDDE']
)!.snapshot;
const original = restoreSavedWorkspace(snapshot, ['SEEDDE'])!.workspace;
function guard(sessionId: string, active: ActiveReaderWorkspace): WorkspaceWriteGuard {
	return {
		sessionId,
		activeId: active.id,
		selectionVersion: active.selectionVersion,
		contentVersion: active.contentVersion
	};
}
async function create(userId: string, sessionId: string, name: string, value = snapshot) {
	const result = await changeSavedReaderWorkspace(
		db,
		userId,
		{ action: 'create', name, snapshot: value },
		sessionId
	);
	if (!result.ok) throw new Error(`create failed: ${result.reason}`);
	return result.workspace;
}
afterAll(async () => {
	if (ids.length) await db.delete(users).where(inArray(users.id, ids));
	await closeDb();
});

describe('device selections and shared Reader snapshots', () => {
	it('allows exactly one explicit provisional first action and rejects missing tokens afterwards or on other devices', async () => {
		const { userId, sessionId } = await account();
		const expected = {
			sessionId,
			activeId: null,
			selectionVersion: null,
			contentVersion: null,
			bootstrap: true
		};
		const first = await persistReaderWorkspace(db, userId, original, { guard: expected });
		expect(first).toMatchObject({
			saved: true,
			activeSavedWorkspaceVersion: 1,
			activeSavedWorkspaceContentVersion: 1
		});
		expect(await persistReaderWorkspace(db, userId, original, { guard: expected })).toMatchObject({
			saved: false,
			reason: 'conflict'
		});
		expect(
			await persistReaderWorkspace(db, userId, original, {
				guard: { ...expected, sessionId: await device(userId) }
			})
		).toMatchObject({ saved: false, reason: 'conflict' });
		expect(await listSavedReaderWorkspaces(db, userId, sessionId)).toHaveLength(1);
	});

	it('bootstraps once across devices and keeps selection, writes and menu markers independent', async () => {
		const { userId, sessionId: phone } = await account();
		const desktop = await device(userId);
		await db.update(users).set({ readerWorkspace: original }).where(eq(users.id, userId));
		const [phoneStandard, desktopStandard] = await Promise.all([
			ensureDefaultReaderWorkspace(db, userId, phone, original),
			ensureDefaultReaderWorkspace(db, userId, desktop, original)
		]);
		expect(phoneStandard!.id).toBe(desktopStandard!.id);
		expect(await listSavedReaderWorkspaces(db, userId, phone)).toHaveLength(1);
		const research = await create(userId, desktop, 'Research');
		const desktopResearch = (await activateSavedReaderWorkspace(db, userId, desktop, research.id))!;
		expect((await getActiveReaderWorkspace(db, userId, phone))!.id).toBe(phoneStandard!.id);
		expect(
			(await listSavedReaderWorkspaces(db, userId, phone)).find((row) => row.isActive)?.id
		).toBe(phoneStandard!.id);
		expect(
			(await listSavedReaderWorkspaces(db, userId, desktop)).find((row) => row.isActive)?.id
		).toBe(research.id);
		const [phoneWrite, desktopWrite] = await Promise.all([
			saveActiveWorkspaceView(
				db,
				userId,
				{ ...snapshot, readerState: snapshot.readerState.replace('Joh3,16', '1Sam26') },
				guard(phone, phoneStandard!)
			),
			saveActiveWorkspaceView(
				db,
				userId,
				{ ...snapshot, readerState: snapshot.readerState.replace('Joh3,16', 'Mt16') },
				guard(desktop, desktopResearch)
			)
		]);
		expect(phoneWrite).toMatchObject({
			saved: true,
			activeSavedWorkspaceId: phoneStandard!.id,
			activeSavedWorkspaceContentVersion: 2
		});
		expect(desktopWrite).toMatchObject({
			saved: true,
			activeSavedWorkspaceId: research.id,
			activeSavedWorkspaceContentVersion: 2
		});
		expect((await getActiveReaderWorkspace(db, userId, phone))!.snapshot.readerState).toContain(
			'1Sam26'
		);
		expect((await getActiveReaderWorkspace(db, userId, desktop))!.snapshot.readerState).toContain(
			'Mt16'
		);
		// An already-resolved response keeps its own marker even if activation happened meanwhile.
		expect(
			(
				await listSavedReaderWorkspaces(db, userId, desktop, workspaceSelection(desktopStandard))
			).find((row) => row.isActive)?.id
		).toBe(desktopStandard!.id);
	});

	it('rejects old selection epochs after A to B to A and missing client versions', async () => {
		const { userId, sessionId } = await account();
		const a = (await ensureDefaultReaderWorkspace(db, userId, sessionId, original))!;
		const b = await create(userId, sessionId, 'B');
		await activateSavedReaderWorkspace(db, userId, sessionId, b.id);
		const reopened = (await activateSavedReaderWorkspace(db, userId, sessionId, a.id))!;
		expect(reopened.selectionVersion).toBe(a.selectionVersion + 2);
		for (const expected of [
			guard(sessionId, a),
			{ ...guard(sessionId, reopened), contentVersion: null }
		]) {
			expect(await saveActiveWorkspaceView(db, userId, snapshot, expected)).toMatchObject({
				saved: false,
				reason: 'conflict',
				activeSavedWorkspaceVersion: reopened.selectionVersion
			});
		}
		// A reference/layout mismatch in an owned stale view is still a version conflict.
		expect(
			await persistReaderWorkspace(db, userId, original, {
				guard: guard(sessionId, a),
				detached: 'snapshot'
			})
		).toMatchObject({ saved: false, reason: 'conflict' });
		expect((await getActiveReaderWorkspace(db, userId, sessionId))!.contentVersion).toBe(1);
	});

	it('guards the entire shared snapshot while keeping autosave independent of management revision', async () => {
		const { userId, sessionId: phone } = await account();
		const desktop = await device(userId);
		let current = (await ensureDefaultReaderWorkspace(db, userId, phone, original))!;
		const staleDesktop = (await ensureDefaultReaderWorkspace(db, userId, desktop, original))!;
		const states = [
			{ ...snapshot, readerState: snapshot.readerState + '&search=1.1:Liebe' },
			{
				...snapshot,
				readerState:
					snapshot.readerState + '&search=1.1:Liebe&notesQuery=Gedanke&notesTag=tag&notesFilter=all'
			},
			{ ...snapshot, layoutSizes: { single: { columns: [1], rows: [1] } } }
		];
		for (const next of states) {
			const before = current.contentVersion;
			expect(await saveActiveWorkspaceView(db, userId, next, guard(phone, current))).toMatchObject({
				saved: true,
				activeSavedWorkspaceContentVersion: before + 1
			});
			current = (await getActiveReaderWorkspace(db, userId, phone))!;
		}
		expect(
			await saveActiveWorkspaceView(db, userId, snapshot, guard(desktop, staleDesktop))
		).toMatchObject({ saved: false, reason: 'conflict' });
		expect(
			await saveActiveWorkspaceView(db, userId, current.snapshot, guard(phone, current))
		).toMatchObject({ saved: true, activeSavedWorkspaceContentVersion: current.contentVersion });
		expect(current.revision).toBe(1);
		await changeSavedReaderWorkspace(
			db,
			userId,
			{ action: 'update', id: current.id, revision: 1, name: 'Studium' },
			phone
		);
		expect((await getActiveReaderWorkspace(db, userId, phone))!).toMatchObject({
			revision: 2,
			contentVersion: current.contentVersion
		});
	});

	it('never saves detached branches even with absent tokens and allows permission cleanup using the original content version', async () => {
		const { userId, sessionId } = await account();
		const active = (await ensureDefaultReaderWorkspace(db, userId, sessionId, original))!;
		expect(
			await persistReaderWorkspace(db, userId, original, {
				guard: { sessionId, activeId: null, selectionVersion: null, contentVersion: null },
				detached: 'explicit'
			})
		).toMatchObject({ saved: false, reason: 'detached' });
		const blocked = {
			...snapshot,
			readerState: snapshot.readerState + '&tab=1.2:PRIVATE:A:Joh3,16'
		};
		await db
			.update(savedReaderWorkspaces)
			.set({ snapshot: blocked })
			.where(eq(savedReaderWorkspaces.id, active.id));
		const cleaned = restoreSavedWorkspace(blocked, ['SEEDDE'])!;
		expect(
			await saveActiveWorkspaceView(db, userId, cleaned.snapshot, guard(sessionId, active))
		).toMatchObject({ saved: true, activeSavedWorkspaceContentVersion: 2 });
		expect(
			(await getSavedReaderWorkspace(db, userId, active.id))!.snapshot.readerState
		).not.toContain('PRIVATE');
	});

	it('recovers deleted remote selections atomically and honors only own remembered choices', async () => {
		const { userId, sessionId: phone } = await account();
		const desktop = await device(userId);
		const standard = (await ensureDefaultReaderWorkspace(db, userId, phone, original))!;
		const temporary = await create(userId, phone, 'Temporär');
		const selected = (await activateSavedReaderWorkspace(db, userId, desktop, temporary.id))!;
		expect(
			await changeSavedReaderWorkspace(
				db,
				userId,
				{ action: 'delete', id: temporary.id, revision: 1 },
				phone
			)
		).toMatchObject({ ok: true });
		const [first, second] = await Promise.all([
			ensureDefaultReaderWorkspace(db, userId, desktop, original),
			ensureDefaultReaderWorkspace(db, userId, desktop, original)
		]);
		expect(first!.id).toBe(standard.id);
		expect(first!.selectionVersion).toBe(selected.selectionVersion + 1);
		expect(second!.selectionVersion).toBe(first!.selectionVersion);
		const own = await create(userId, phone, 'Eigener Hinweis');
		expect(
			(await ensureDefaultReaderWorkspace(db, userId, await device(userId), original, own.id))!.id
		).toBe(own.id);
		const other = await account();
		const foreign = await create(other.userId, other.sessionId, 'Fremder Hinweis');
		expect(
			(await ensureDefaultReaderWorkspace(db, userId, await device(userId), original, foreign.id))!
				.id
		).toBe(standard.id);
	});

	it('rechecks session ownership, revocation, expiry and disabled accounts under locks', async () => {
		const { userId, sessionId } = await account();
		const active = (await ensureDefaultReaderWorkspace(db, userId, sessionId, original))!;
		const other = await account();
		for (const invalidSession of [randomUUID(), other.sessionId]) {
			expect(
				await saveActiveWorkspaceView(db, userId, snapshot, guard(invalidSession, active))
			).toMatchObject({ saved: false, reason: 'conflict' });
			expect(await activateSavedReaderWorkspace(db, userId, invalidSession, active.id)).toBeNull();
		}
		await db
			.update(sessions)
			.set({ expiresAt: new Date(0) })
			.where(eq(sessions.id, sessionId));
		expect(
			await saveActiveWorkspaceView(db, userId, snapshot, guard(sessionId, active))
		).toMatchObject({ saved: false, reason: 'conflict' });
		await db
			.update(sessions)
			.set({ expiresAt: new Date(Date.now() + 60_000) })
			.where(eq(sessions.id, sessionId));
		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
		expect(
			await saveActiveWorkspaceView(db, userId, snapshot, guard(sessionId, active))
		).toMatchObject({ saved: false, reason: 'conflict' });
		await db.update(users).set({ disabledAt: null }).where(eq(users.id, userId));
		// A logout holding the session lock commits before the waiting write can inspect the session.
		let write!: ReturnType<typeof saveActiveWorkspaceView>;
		await db.transaction(async (tx) => {
			await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for('update');
			write = saveActiveWorkspaceView(
				db,
				userId,
				{ ...snapshot, readerState: snapshot.readerState + '&notesQuery=late' },
				guard(sessionId, active)
			);
			await tx.delete(sessions).where(eq(sessions.id, sessionId));
		});
		expect(await write).toMatchObject({ saved: false, reason: 'conflict' });
		expect((await getSavedReaderWorkspace(db, userId, active.id))!.snapshot).toEqual(snapshot);
	});
});

describe('workspace management boundaries', () => {
	it('isolates reads, renames and deletions by owner and rejects stale revisions or local active deletion', async () => {
		const { userId, sessionId } = await account();
		const other = await account();
		const item = await create(userId, sessionId, '  Johannes  ');
		expect(item.name).toBe('Johannes');
		expect(await getSavedReaderWorkspace(db, other.userId, item.id)).toBeNull();
		expect(await listSavedReaderWorkspaces(db, other.userId, other.sessionId)).toEqual([]);
		expect(
			await activateSavedReaderWorkspace(db, other.userId, other.sessionId, item.id)
		).toBeNull();
		for (const change of [
			{ action: 'update' as const, id: item.id, revision: 1, name: 'Fremd' },
			{ action: 'delete' as const, id: item.id, revision: 1 }
		])
			expect(await changeSavedReaderWorkspace(db, other.userId, change, other.sessionId)).toEqual({
				ok: false,
				reason: 'notFound'
			});
		expect(
			await changeSavedReaderWorkspace(
				db,
				userId,
				{ action: 'update', id: item.id, revision: 1, name: 'Wortstudie' },
				sessionId
			)
		).toMatchObject({ ok: true, workspace: { revision: 2 } });
		expect(
			await changeSavedReaderWorkspace(
				db,
				userId,
				{ action: 'delete', id: item.id, revision: 1 },
				sessionId
			)
		).toEqual({ ok: false, reason: 'conflict' });
		await activateSavedReaderWorkspace(db, userId, sessionId, item.id);
		expect(
			await changeSavedReaderWorkspace(
				db,
				userId,
				{ action: 'delete', id: item.id, revision: 2 },
				sessionId
			)
		).toEqual({ ok: false, reason: 'active' });
		const next = await create(userId, sessionId, 'Weiter');
		await activateSavedReaderWorkspace(db, userId, sessionId, next.id);
		expect(
			await changeSavedReaderWorkspace(
				db,
				userId,
				{ action: 'delete', id: item.id, revision: 2 },
				sessionId
			)
		).toMatchObject({ ok: true });
		expect(await getSavedReaderWorkspace(db, userId, item.id)).toBeNull();
	});
	it('bounds concurrent creates and enforces unique names within each account', async () => {
		const { userId, sessionId } = await account();
		const results = await Promise.all(
			['Studium', 'studium'].map((name) =>
				changeSavedReaderWorkspace(db, userId, { action: 'create', name, snapshot }, sessionId)
			)
		);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: 'duplicateName' });
		const other = await account();
		expect(await create(other.userId, other.sessionId, 'Studium')).toMatchObject({
			name: 'Studium'
		});
		await db.insert(savedReaderWorkspaces).values(
			Array.from({ length: MAX_SAVED_WORKSPACES - 2 }, (_, i) => ({
				userId,
				name: `Workspace ${i}`,
				snapshot
			}))
		);
		const last = await Promise.all(
			['Letzter', 'Zu viel'].map((name) =>
				changeSavedReaderWorkspace(db, userId, { action: 'create', name, snapshot }, sessionId)
			)
		);
		expect(last.filter((result) => result.ok)).toHaveLength(1);
		expect(last.find((result) => !result.ok)).toEqual({ ok: false, reason: 'limit' });
		expect(await listSavedReaderWorkspaces(db, userId, sessionId)).toHaveLength(
			MAX_SAVED_WORKSPACES
		);
		await db.delete(users).where(eq(users.id, userId));
		expect(
			await db.select().from(savedReaderWorkspaces).where(eq(savedReaderWorkspaces.userId, userId))
		).toHaveLength(0);
	});
});
