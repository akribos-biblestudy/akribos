import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
	cleanWorkspaceName,
	MAX_SAVED_WORKSPACES,
	type SavedWorkspaceSnapshot,
	type SavedWorkspaceSummary
} from '../../reader/saved-workspaces';
import type { Database } from '../db/client';
import { savedReaderWorkspaces, users } from '../db/schema';

const summary = {
	id: savedReaderWorkspaces.id,
	name: savedReaderWorkspaces.name,
	revision: savedReaderWorkspaces.revision
};

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
			snapshot?: SavedWorkspaceSnapshot;
	  }
	| { action: 'delete'; id: string; revision: number };

export type SavedWorkspaceMutationResult =
	| { ok: true; workspace: SavedWorkspaceSummary }
	| { ok: false; reason: 'notFound' | 'conflict' | 'name' | 'duplicateName' | 'limit' };

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
				...(change.snapshot ? { snapshot: change.snapshot } : {}),
				revision: current!.revision + 1,
				updatedAt: new Date()
			})
			.where(and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, change.id)))
			.returning(summary);
		return { ok: true, workspace: updated! };
	});
}
