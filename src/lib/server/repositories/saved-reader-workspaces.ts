import { isDeepStrictEqual } from 'node:util';
import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import {
	cleanWorkspaceName,
	MAX_SAVED_WORKSPACES,
	type SavedWorkspaceSnapshot,
	type SavedWorkspaceSummary
} from '../../reader/saved-workspaces';
import type { Database } from '../db/client';
import { savedReaderWorkspaces, sessions, users, readerBrowserTabs } from '../db/schema';
import { publishWorkspaceChanges } from '../../reader/publish-workspace';
import {
	decodeReaderUrlState,
	encodeReaderUrlState,
	readerStateFromUrl
} from '../../reader/url-state';
import type { ReaderWorkspace } from '../../reader/workspace';
import { workspaceColumns } from '../reader-workspace';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type ActiveReaderWorkspace = typeof savedReaderWorkspaces.$inferSelect & {
	selectionVersion: number;
};
export type WorkspaceSelection = {
	activeSavedWorkspaceId: string | null;
	activeSavedWorkspaceVersion: number | null;
	activeSavedWorkspaceContentVersion: number | null;
};
export function workspaceSelection(active: ActiveReaderWorkspace | null): WorkspaceSelection {
	return {
		activeSavedWorkspaceId: active?.id ?? null,
		activeSavedWorkspaceVersion: active?.selectionVersion ?? null,
		activeSavedWorkspaceContentVersion: active?.contentVersion ?? null
	};
}
export type WorkspaceWriteGuard = {
	sessionId: string;
	browserTabId?: string;
	activeId: string | null;
	selectionVersion: number | null;
	contentVersion: number | null;
	/** Server-derived permission for the first explicit action from the provisional SSR view. */
	bootstrap?: boolean;
};
export type WorkspaceDetachment = 'explicit' | 'snapshot';
export type WorkspaceWriteResult = WorkspaceSelection &
	({ saved: true } | { saved: false; reason: 'conflict' | 'detached'; message?: string });
export const WORKSPACE_CONFLICT_MESSAGE =
	'Der Arbeitsbereich wurde inzwischen geändert. Lade ihn neu oder öffne ausdrücklich einen anderen Arbeitsbereich.';

const summary = {
	id: savedReaderWorkspaces.id,
	name: savedReaderWorkspaces.name,
	revision: savedReaderWorkspaces.revision
};

/** Every mutation locks owner, then session, then content. Session deletion must wait too. */
async function lockReaderSession(tx: Transaction, userId: string, sessionId: string) {
	const [owner] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
	if (!owner || owner.disabledAt) return null;
	const [session] = await tx
		.select()
		.from(sessions)
		.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
		.for('update');
	if (!session || session.expiresAt.getTime() <= Date.now()) return null;
	return { owner, session };
}

export async function getActiveReaderWorkspace(db: Database, userId: string, sessionId: string) {
	const [row] = await db
		.select({ saved: savedReaderWorkspaces, selectionVersion: sessions.readerWorkspaceVersion })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.innerJoin(
			savedReaderWorkspaces,
			and(
				eq(savedReaderWorkspaces.id, sessions.activeReaderWorkspaceId),
				eq(savedReaderWorkspaces.userId, users.id)
			)
		)
		.where(
			and(
				eq(sessions.id, sessionId),
				eq(users.id, userId),
				gt(sessions.expiresAt, new Date()),
				isNull(users.disabledAt)
			)
		);
	return row ? { ...row.saved, selectionVersion: row.selectionVersion } : null;
}

/** Resolve only this authenticated browser tab. Other tabs may select and publish independently. */
export async function getBrowserTabReaderWorkspace(
	db: Database,
	userId: string,
	sessionId: string,
	browserTabId: string,
	fallback: ActiveReaderWorkspace,
	sourceId?: string
): Promise<ActiveReaderWorkspace | null> {
	return db.transaction(async (tx) => {
		if (!(await lockReaderSession(tx, userId, sessionId))) return null;
		const [tab] = await tx
			.select()
			.from(readerBrowserTabs)
			.where(
				and(eq(readerBrowserTabs.sessionId, sessionId), eq(readerBrowserTabs.id, browserTabId))
			)
			.for('update');
		const [source] =
			!tab && sourceId
				? await tx
						.select()
						.from(readerBrowserTabs)
						.where(
							and(eq(readerBrowserTabs.sessionId, sessionId), eq(readerBrowserTabs.id, sourceId))
						)
				: [];
		const [saved] = await tx
			.select()
			.from(savedReaderWorkspaces)
			.where(
				and(
					eq(savedReaderWorkspaces.userId, userId),
					eq(savedReaderWorkspaces.id, tab?.workspaceId ?? source?.workspaceId ?? fallback.id)
				)
			);
		if (!saved) return null;
		if (tab?.workspaceId)
			return {
				...saved,
				snapshot: tab.snapshot,
				selectionVersion: tab.selectionVersion,
				contentVersion: tab.contentVersion
			};
		const values = {
			workspaceId: saved.id,
			snapshot: source?.workspaceId === saved.id ? source.snapshot : saved.snapshot,
			selectionVersion:
				source?.workspaceId === saved.id
					? source.selectionVersion
					: (tab?.selectionVersion ?? 0) + 1,
			contentVersion: source?.workspaceId === saved.id ? source.contentVersion : 1,
			updatedAt: new Date()
		};
		await tx
			.insert(readerBrowserTabs)
			.values({ id: browserTabId, sessionId, ...values })
			.onConflictDoUpdate({
				target: [readerBrowserTabs.sessionId, readerBrowserTabs.id],
				set: values
			});
		return { ...saved, ...values };
	});
}

/** Resolve a missing device selection once. A shared incoming Reader URL is never a fallback. */
export async function ensureDefaultReaderWorkspace(
	db: Database,
	userId: string,
	sessionId: string,
	fallback: ReaderWorkspace,
	rememberedId: string | null = null
): Promise<ActiveReaderWorkspace | null> {
	return db.transaction(async (tx) => {
		const locked = await lockReaderSession(tx, userId, sessionId);
		if (!locked) return null;
		const { owner, session } = locked;
		const rows = await tx
			.select()
			.from(savedReaderWorkspaces)
			.where(eq(savedReaderWorkspaces.userId, userId))
			.orderBy(asc(savedReaderWorkspaces.createdAt), asc(savedReaderWorkspaces.id));
		const current = rows.find((row) => row.id === session.activeReaderWorkspaceId);
		if (current) return { ...current, selectionVersion: session.readerWorkspaceVersion };
		// The old global active flag is only an upgrade/new-device hint. It is never changed on activation.
		let selected =
			rows.find((row) => row.id === rememberedId) ?? rows.find((row) => row.isActive) ?? rows[0];
		if (!selected) {
			const workspace = owner.readerWorkspace ?? fallback;
			[selected] = await tx
				.insert(savedReaderWorkspaces)
				.values({
					userId,
					name: 'Standard',
					isActive: true,
					snapshot: {
						readerState: encodeReaderUrlState(workspace),
						layoutSizes: workspace.layoutSizes
					}
				})
				.returning();
		}
		const selectionVersion = session.readerWorkspaceVersion + 1;
		await tx
			.update(sessions)
			.set({ activeReaderWorkspaceId: selected!.id, readerWorkspaceVersion: selectionVersion })
			.where(eq(sessions.id, sessionId));
		return { ...selected!, selectionVersion };
	});
}

/** Return the latest content under the same locks as the selection; callers never activate stale copies. */
export async function activateSavedReaderWorkspace(
	db: Database,
	userId: string,
	sessionId: string,
	id: string,
	browserTabId?: string
): Promise<ActiveReaderWorkspace | null> {
	return db.transaction(async (tx) => {
		const locked = await lockReaderSession(tx, userId, sessionId);
		if (!locked) return null;
		const [saved] = await tx
			.select()
			.from(savedReaderWorkspaces)
			.where(and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, id)))
			.for('update');
		if (!saved) return null;
		const selectionVersion = locked.session.readerWorkspaceVersion + 1;
		await tx
			.update(sessions)
			.set({ activeReaderWorkspaceId: id, readerWorkspaceVersion: selectionVersion })
			.where(eq(sessions.id, sessionId));
		if (browserTabId) {
			const [tab] = await tx
				.select()
				.from(readerBrowserTabs)
				.where(
					and(eq(readerBrowserTabs.sessionId, sessionId), eq(readerBrowserTabs.id, browserTabId))
				)
				.for('update');
			const values = {
				workspaceId: id,
				snapshot: saved.snapshot,
				selectionVersion: (tab?.selectionVersion ?? 0) + 1,
				contentVersion: 1,
				updatedAt: new Date()
			};
			await tx
				.insert(readerBrowserTabs)
				.values({ id: browserTabId, sessionId, ...values })
				.onConflictDoUpdate({
					target: [readerBrowserTabs.sessionId, readerBrowserTabs.id],
					set: values
				});
			return { ...saved, ...values };
		}
		return { ...saved, selectionVersion };
	});
}

/** Versions cover the entire original snapshot, including searches, notes and divider sizes. */
export async function persistReaderWorkspace(
	db: Database,
	userId: string,
	workspace: ReaderWorkspace,
	options: { guard: WorkspaceWriteGuard; readerState?: string; detached?: WorkspaceDetachment }
): Promise<WorkspaceWriteResult> {
	return db.transaction(async (tx) => {
		const locked = await lockReaderSession(tx, userId, options.guard.sessionId);
		const [browserTab] =
			locked && options.guard.browserTabId
				? await tx
						.select()
						.from(readerBrowserTabs)
						.where(
							and(
								eq(readerBrowserTabs.sessionId, options.guard.sessionId),
								eq(readerBrowserTabs.id, options.guard.browserTabId)
							)
						)
						.for('update')
				: [];
		const selectedId = options.guard.browserTabId
			? browserTab?.workspaceId
			: locked?.session.activeReaderWorkspaceId;
		let shared: typeof savedReaderWorkspaces.$inferSelect | undefined;
		let active: ActiveReaderWorkspace | null = null;
		if (selectedId) {
			const [saved] = await tx
				.select()
				.from(savedReaderWorkspaces)
				.where(
					and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, selectedId))
				)
				.for('update');
			shared = saved;
			if (saved)
				active = browserTab
					? {
							...saved,
							snapshot: browserTab.snapshot,
							contentVersion: browserTab.contentVersion,
							selectionVersion: browserTab.selectionVersion
						}
					: { ...saved, selectionVersion: locked!.session.readerWorkspaceVersion };
		}
		// An explicitly opened foreign branch is always read-only. A stale owned snapshot must still
		// fail its version check before an inferred snapshot mismatch can be treated as detached.
		if (options.detached === 'explicit')
			return { saved: false, reason: 'detached', ...workspaceSelection(active) };
		let bootstrapped = false;
		// A new account without JavaScript has no viewport cookie and no selection token yet. Only its
		// first explicit action can initialize the provisional view; an existing or recovered selection
		// and even another device's first saved workspace make an unversioned request a conflict.
		if (
			options.guard.bootstrap &&
			!options.detached &&
			locked &&
			!locked.session.activeReaderWorkspaceId &&
			locked.session.readerWorkspaceVersion === 0 &&
			options.guard.activeId === null &&
			options.guard.selectionVersion === null &&
			options.guard.contentVersion === null
		) {
			const [existing] = await tx
				.select({ id: savedReaderWorkspaces.id })
				.from(savedReaderWorkspaces)
				.where(eq(savedReaderWorkspaces.userId, userId))
				.limit(1);
			if (!existing) {
				const [created] = await tx
					.insert(savedReaderWorkspaces)
					.values({
						userId,
						name: 'Standard',
						isActive: true,
						snapshot: {
							readerState: options.readerState ?? encodeReaderUrlState(workspace),
							layoutSizes: workspace.layoutSizes
						}
					})
					.returning();
				await tx
					.update(sessions)
					.set({ activeReaderWorkspaceId: created!.id, readerWorkspaceVersion: 1 })
					.where(eq(sessions.id, options.guard.sessionId));
				active = { ...created!, selectionVersion: 1 };
				bootstrapped = true;
			}
		}
		if (
			!active ||
			(!bootstrapped &&
				(active.id !== options.guard.activeId ||
					active.selectionVersion !== options.guard.selectionVersion ||
					active.contentVersion !== options.guard.contentVersion))
		) {
			return {
				saved: false,
				reason: 'conflict',
				message: WORKSPACE_CONFLICT_MESSAGE,
				...workspaceSelection(active)
			};
		}
		if (options.detached)
			return { saved: false, reason: 'detached', ...workspaceSelection(active) };
		const state = new URLSearchParams(options.readerState ?? encodeReaderUrlState(workspace));
		if (!options.readerState) {
			for (const [key, value] of new URLSearchParams(active.snapshot.readerState)) {
				if (key === 'search' || key.startsWith('notes')) state.append(key, value);
			}
		}
		const snapshot: SavedWorkspaceSnapshot = {
			readerState: readerStateFromUrl(new URL(`http://reader.invalid/?${state}`))!,
			layoutSizes: workspace.layoutSizes
		};
		if (browserTab && shared) {
			const published = publishWorkspaceChanges(active.snapshot, snapshot, shared.snapshot);
			if (!isDeepStrictEqual(published, shared.snapshot))
				await tx
					.update(savedReaderWorkspaces)
					.set({
						snapshot: published,
						contentVersion: shared.contentVersion + 1,
						updatedAt: new Date()
					})
					.where(eq(savedReaderWorkspaces.id, active.id));
			if (!isDeepStrictEqual(snapshot, active.snapshot)) {
				active.contentVersion += 1;
				await tx
					.update(readerBrowserTabs)
					.set({ snapshot, contentVersion: active.contentVersion, updatedAt: new Date() })
					.where(
						and(
							eq(readerBrowserTabs.sessionId, options.guard.sessionId),
							eq(readerBrowserTabs.id, browserTab.id)
						)
					);
			}
			return { saved: true, ...workspaceSelection(active) };
		}
		if (!isDeepStrictEqual(snapshot, active.snapshot)) {
			active.contentVersion += 1;
			await tx
				.update(savedReaderWorkspaces)
				.set({ snapshot, contentVersion: active.contentVersion, updatedAt: new Date() })
				.where(eq(savedReaderWorkspaces.id, active.id));
		}
		// Compatibility for older readers/new-device bootstrap; never the source for selected devices.
		await tx
			.update(users)
			.set({
				readerWorkspace: workspace,
				readerColumns: workspaceColumns(workspace),
				updatedAt: new Date()
			})
			.where(eq(users.id, userId));
		return { saved: true, ...workspaceSelection(active) };
	});
}

export async function saveActiveWorkspaceView(
	db: Database,
	userId: string,
	snapshot: SavedWorkspaceSnapshot,
	guard: WorkspaceWriteGuard,
	detached?: WorkspaceDetachment
): Promise<WorkspaceWriteResult> {
	const decoded = decodeReaderUrlState(new URLSearchParams(snapshot.readerState));
	if (!decoded)
		return {
			saved: false,
			reason: 'conflict',
			message: WORKSPACE_CONFLICT_MESSAGE,
			...workspaceSelection(null)
		};
	const workspace = {
		...(decoded.workspace as ReaderWorkspace),
		layoutSizes: snapshot.layoutSizes
	};
	return persistReaderWorkspace(db, userId, workspace, {
		guard,
		readerState: snapshot.readerState,
		detached
	});
}

export async function listSavedReaderWorkspaces(
	db: Database,
	userId: string,
	sessionId: string,
	selection?: WorkspaceSelection
) {
	const activeId = selection
		? selection.activeSavedWorkspaceId
		: (await getActiveReaderWorkspace(db, userId, sessionId))?.id;
	const rows = await db
		.select(summary)
		.from(savedReaderWorkspaces)
		.where(eq(savedReaderWorkspaces.userId, userId))
		.orderBy(asc(savedReaderWorkspaces.name), asc(savedReaderWorkspaces.id))
		.limit(MAX_SAVED_WORKSPACES);
	return rows.map((row) => ({ ...row, isActive: row.id === activeId }));
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
	change: Change,
	sessionId: string,
	browserTabId?: string
): Promise<SavedWorkspaceMutationResult> {
	return db.transaction(async (tx) => {
		const locked = await lockReaderSession(tx, userId, sessionId);
		if (!locked) return { ok: false, reason: 'notFound' };
		const [browserTab] = browserTabId
			? await tx
					.select()
					.from(readerBrowserTabs)
					.where(
						and(eq(readerBrowserTabs.sessionId, sessionId), eq(readerBrowserTabs.id, browserTabId))
					)
			: [];
		const selectedId = browserTabId
			? browserTab?.workspaceId
			: locked.session.activeReaderWorkspaceId;
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
			if (current!.id === selectedId) return { ok: false, reason: 'active' };
			await tx
				.delete(savedReaderWorkspaces)
				.where(
					and(eq(savedReaderWorkspaces.userId, userId), eq(savedReaderWorkspaces.id, change.id))
				);
			return { ok: true, workspace: { ...current!, isActive: false } };
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
			return { ok: true, workspace: { ...created!, isActive: false } };
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
		return {
			ok: true,
			workspace: { ...updated!, isActive: updated!.id === selectedId }
		};
	});
}
