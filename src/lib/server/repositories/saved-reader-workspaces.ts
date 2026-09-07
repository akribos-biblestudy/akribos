import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
	cleanWorkspaceName,
	MAX_SAVED_WORKSPACES,
	type SavedWorkspaceSnapshot,
	type SavedWorkspaceSummary
} from '../../reader/saved-workspaces';
import type { Database } from '../db/client';
import { savedReaderWorkspaces, users } from '../db/schema';
import {
	decodeReaderUrlState,
	encodeReaderUrlState,
	readerStateFromUrl,
	sameReaderUrlWorkspace
} from '../../reader/url-state';
import type { ReaderWorkspace } from '../../reader/workspace';
import { workspaceColumns } from '../reader-workspace';

const summary = {
	id: savedReaderWorkspaces.id,
	name: savedReaderWorkspaces.name,
	revision: savedReaderWorkspaces.revision,
	isActive: savedReaderWorkspaces.isActive
};

export async function getActiveReaderWorkspace(db: Database, userId: string) {
	const [row] = await db
		.select()
		.from(savedReaderWorkspaces)
		.where(and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.isActive, true)));
	return row ?? null;
}

/** Adopt the existing account/device state exactly once; never use an incoming shared URL here. */
export async function ensureDefaultReaderWorkspace(
	db: Database,
	userId: string,
	fallback: ReaderWorkspace
) {
	if (await getActiveReaderWorkspace(db, userId)) return;
	await db.transaction(async (tx) => {
		const [owner] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
		if (!owner) return;
		const rows = await tx
			.select(summary)
			.from(savedReaderWorkspaces)
			.where(eq(savedReaderWorkspaces.userId, userId));
		if (rows.some((row) => row.isActive)) return;
		let name = 'Standard';
		for (
			let suffix = 2;
			rows.some((row) => row.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'));
			suffix++
		)
			name = `Standard ${suffix}`;
		const workspace = owner.readerWorkspace ?? fallback;
		await tx.insert(savedReaderWorkspaces).values({
			userId,
			name,
			isActive: true,
			snapshot: {
				readerState: encodeReaderUrlState(workspace),
				layoutSizes: workspace.layoutSizes
			}
		});
	});
}

export type WorkspaceWriteGuard = { activeId: string | null; previous: ReaderWorkspace };

/** The account projection and active named workspace are one atomic write. */
export async function persistReaderWorkspace(
	db: Database,
	userId: string,
	workspace: ReaderWorkspace,
	options: { guard?: WorkspaceWriteGuard; readerState?: string } = {}
): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [owner] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
		if (!owner) return false;
		const [active] = await tx
			.select()
			.from(savedReaderWorkspaces)
			.where(
				and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.isActive, true))
			);
		if (
			options.guard &&
			((active?.id ?? null) !== options.guard.activeId ||
				(owner.readerWorkspace &&
					!sameReaderUrlWorkspace(owner.readerWorkspace, options.guard.previous)))
		)
			return false;
		await tx
			.update(users)
			.set({
				readerWorkspace: workspace,
				readerColumns: workspaceColumns(workspace),
				updatedAt: new Date()
			})
			.where(eq(users.id, userId));
		if (active) {
			const state = new URLSearchParams(options.readerState ?? encodeReaderUrlState(workspace));
			if (!options.readerState) {
				for (const [key, value] of new URLSearchParams(active.snapshot.readerState)) {
					if (key === 'search' || key.startsWith('notes')) state.append(key, value);
				}
			}
			await tx
				.update(savedReaderWorkspaces)
				.set({
					snapshot: {
						readerState: readerStateFromUrl(new URL(`http://reader.invalid/?${state}`))!,
						layoutSizes: workspace.layoutSizes
					},
					updatedAt: new Date()
				})
				.where(eq(savedReaderWorkspaces.id, active.id));
		}
		return true;
	});
}

/** Switching is explicit and cannot be undone by a late write from the previous active workspace. */
export async function activateSavedReaderWorkspace(
	db: Database,
	userId: string,
	id: string,
	workspace: ReaderWorkspace
) {
	return db.transaction(async (tx) => {
		await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
		const [saved] = await tx
			.select(summary)
			.from(savedReaderWorkspaces)
			.where(and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, id)));
		if (!saved) return false;
		await tx
			.update(savedReaderWorkspaces)
			.set({ isActive: false })
			.where(
				and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.isActive, true))
			);
		await tx
			.update(savedReaderWorkspaces)
			.set({ isActive: true })
			.where(eq(savedReaderWorkspaces.id, id));
		await tx
			.update(users)
			.set({
				readerWorkspace: workspace,
				readerColumns: workspaceColumns(workspace),
				updatedAt: new Date()
			})
			.where(eq(users.id, userId));
		return true;
	});
}

/** Searches and sidecar filters do not otherwise produce a Reader form action. */
export async function saveActiveWorkspaceView(
	db: Database,
	userId: string,
	id: string,
	snapshot: SavedWorkspaceSnapshot
) {
	const decoded = decodeReaderUrlState(new URLSearchParams(snapshot.readerState));
	if (!decoded) return false;
	const workspace = {
		...(decoded.workspace as ReaderWorkspace),
		layoutSizes: snapshot.layoutSizes
	} as ReaderWorkspace;
	return persistReaderWorkspace(db, userId, workspace, {
		guard: { activeId: id, previous: workspace },
		readerState: snapshot.readerState
	});
}

export async function listSavedReaderWorkspaces(db: Database, userId: string) {
	return db
		.select(summary)
		.from(savedReaderWorkspaces)
		.where(eq(savedReaderWorkspaces.userId, userId))
		.orderBy(asc(savedReaderWorkspaces.name), asc(savedReaderWorkspaces.id))
		.limit(MAX_SAVED_WORKSPACES);
}

export async function getSavedReaderWorkspace(db: Database, userId: string, id: string) {
	const [row] = await db
		.select()
		.from(savedReaderWorkspaces)
		.where(and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, id)));
	return row ?? null;
}

type Change =
	| { action: 'create'; name: string; snapshot: SavedWorkspaceSnapshot }
	| {
			action: 'update';
			id: string;
			revision: number;
			name: string;
	  }
	| { action: 'delete'; id: string; revision: number };

export type SavedWorkspaceMutationResult =
	| { ok: true; workspace: SavedWorkspaceSummary }
	| { ok: false; reason: 'notFound' | 'conflict' | 'name' | 'duplicateName' | 'limit' | 'active' };

/** Serialize changes per owner to enforce the count/name limits even for concurrent creates. */
export async function changeSavedReaderWorkspace(
	db: Database,
	userId: string,
	change: Change
): Promise<SavedWorkspaceMutationResult> {
	return db.transaction(async (tx) => {
		const [owner] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for('update');
		if (!owner) return { ok: false, reason: 'notFound' };
		const rows = await tx
			.select(summary)
			.from(savedReaderWorkspaces)
			.where(eq(savedReaderWorkspaces.userId, userId));
		const current = change.action === 'create' ? null : rows.find((row) => row.id === change.id);
		if (change.action !== 'create') {
			if (!current) return { ok: false, reason: 'notFound' };
			if (current.revision !== change.revision) return { ok: false, reason: 'conflict' };
		}
		if (change.action === 'delete') {
			if (current!.isActive) return { ok: false, reason: 'active' };
			await tx
				.delete(savedReaderWorkspaces)
				.where(
					and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, change.id))
				);
			return { ok: true, workspace: current! };
		}
		const name = cleanWorkspaceName(change.name);
		if (!name) return { ok: false, reason: 'name' };
		// Use the same Unicode case folding as the database's unique index.
		const [duplicate] = await tx
			.select({ id: savedReaderWorkspaces.id })
			.from(savedReaderWorkspaces)
			.where(
				and(
					eq(savedReaderWorkspaces.userId, userId),
					sql`lower(${savedReaderWorkspaces.name}) = lower(${name})`,
					current ? ne(savedReaderWorkspaces.id, current.id) : undefined
				)
			)
			.limit(1);
		if (duplicate) return { ok: false, reason: 'duplicateName' };
		if (change.action === 'create') {
			if (rows.length >= MAX_SAVED_WORKSPACES) return { ok: false, reason: 'limit' };
			const [created] = await tx
				.insert(savedReaderWorkspaces)
				.values({ userId, name, snapshot: change.snapshot })
				.returning(summary);
			return { ok: true, workspace: created! };
		}
		const [updated] = await tx
			.update(savedReaderWorkspaces)
			.set({
				name,
				revision: current!.revision + 1,
				updatedAt: new Date()
			})
			.where(and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, change.id)))
			.returning(summary);
		return { ok: true, workspace: updated! };
	});
}
