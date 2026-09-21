import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { isReferenceInCanon, parseReference } from '$lib/bible/reference';
import {
	decodeReaderUrlState,
	encodeReaderUrlState,
	readReaderNotesFilters
} from '$lib/reader/url-state';
import { activeReaderTab, setReaderTabReference } from '$lib/reader/workspace';
import { restoreSavedWorkspace } from '$lib/reader/saved-workspaces';
import { getDb } from './db';
import { defaultColumns } from './columns';
import { isUuid } from './documents/application';
import {
	needsInitialReaderViewport,
	resolveReaderWorkspace,
	workspaceColumns
} from './reader-workspace';
import { listReaderResources, type ReadableResource } from './repositories/resources';
import {
	ensureDefaultReaderWorkspace,
	getActiveReaderWorkspace,
	workspaceSelection,
	type WorkspaceWriteGuard
} from './repositories/saved-reader-workspaces';

export const ACTIVE_READER_WORKSPACE_COOKIE = 'reader-active-workspace';

/** A convenience hint for the next login, never authorization or the current session's authority. */
export function readActiveReaderWorkspaceHint(cookies: Cookies, userId: string): string | null {
	const value = cookies.get(ACTIVE_READER_WORKSPACE_COOKIE);
	if (!value) return null;
	const [owner, id, extra] = value.split(':');
	return owner === userId && id && !extra && isUuid(id) ? id : null;
}

/** Only explicit activation writes this cookie; delayed autosave responses cannot roll it back. */
export function writeActiveReaderWorkspaceHint(cookies: Cookies, userId: string, id: string) {
	cookies.set(ACTIVE_READER_WORKSPACE_COOKIE, `${userId}:${id}`, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production'
	});
}

type ContextEvent = Pick<RequestEvent, 'cookies' | 'locals'>;
export type ReaderWorkspaceContext = Awaited<ReturnType<typeof loadReaderWorkspaceContext>>;

/** Layout and page loads run concurrently. They must share bootstrap, content and selection. */
export function resolveReaderWorkspaceContext(
	event: ContextEvent,
	initialize = false
): Promise<ReaderWorkspaceContext> {
	return (event.locals.readerWorkspaceContext ??= loadReaderWorkspaceContext(event, initialize));
}

async function loadReaderWorkspaceContext({ cookies, locals }: ContextEvent, initialize: boolean) {
	const db = getDb();
	const resources = await listReaderResources(db, locals.user?.id);
	const fallbackReference = parseReference(cookies.get('location') ?? '') ?? undefined;
	const fallback = resolveReaderWorkspace(
		cookies,
		resources,
		locals.user?.readerWorkspace,
		locals.user?.readerColumns,
		fallbackReference
	);
	let activeSaved =
		locals.user && locals.sessionId
			? await getActiveReaderWorkspace(db, locals.user.id, locals.sessionId)
			: null;
	let awaitingInitialViewport =
		!activeSaved &&
		needsInitialReaderViewport(
			cookies,
			resources,
			locals.user?.readerWorkspace,
			locals.user?.readerColumns
		);
	if (!activeSaved && locals.user && locals.sessionId && (!awaitingInitialViewport || initialize)) {
		activeSaved = await ensureDefaultReaderWorkspace(
			db,
			locals.user.id,
			locals.sessionId,
			fallback,
			readActiveReaderWorkspaceHint(cookies, locals.user.id)
		);
		if (activeSaved) awaitingInitialViewport = false;
	}
	const restored = activeSaved
		? restoreSavedWorkspace(
				activeSaved.snapshot,
				resources.map((resource) => resource.id)
			)
		: null;
	const workspace = restored?.workspace ?? fallback;
	// Compatibility consumers in this same request must also see the device's selection.
	if (locals.user && activeSaved) {
		locals.user = {
			...locals.user,
			readerWorkspace: workspace,
			readerColumns: workspaceColumns(workspace)
		};
	}
	const guard: WorkspaceWriteGuard | undefined =
		locals.user && locals.sessionId
			? {
					sessionId: locals.sessionId,
					activeId: activeSaved?.id ?? null,
					selectionVersion: activeSaved?.selectionVersion ?? null,
					contentVersion: activeSaved?.contentVersion ?? null
				}
			: undefined;
	return {
		resources,
		workspace,
		activeSaved,
		snapshot: restored?.snapshot ?? null,
		selection: workspaceSelection(activeSaved),
		guard,
		awaitingInitialViewport
	};
}

export function readWorkspaceVersion(value: unknown): number | null {
	if (typeof value !== 'string' && typeof value !== 'number') return null;
	if (typeof value === 'string' && !/^[1-9]\d*$/.test(value)) return null;
	const version = Number(value);
	return Number.isSafeInteger(version) && version > 0 ? version : null;
}

/** A scroll before the autosave debounce may be resumed only against its exact confirmed snapshot. */
export function readBoundReaderResume(cookies: Cookies, context: ReaderWorkspaceContext) {
	const raw = cookies.get('reader-resume');
	if (!raw || raw.length > 2048 || !context.snapshot || !context.activeSaved) return null;
	try {
		const hint: unknown = JSON.parse(raw);
		if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return null;
		const value = hint as Record<string, unknown>;
		if (
			value.workspaceId !== context.selection.activeSavedWorkspaceId ||
			value.workspaceVersion !== context.selection.activeSavedWorkspaceVersion ||
			value.workspaceContentVersion !== context.selection.activeSavedWorkspaceContentVersion ||
			typeof value.reference !== 'string'
		)
			return null;
		const reference = parseReference(value.reference);
		if (!reference || !isReferenceInCanon(reference)) return null;
		const tile = context.workspace.tiles.find((entry) => entry.id === value.sourceTileId);
		const tab = tile && activeReaderTab(tile);
		if (!tile || !tab || tile.activeTabId !== value.sourceTabId || tab.id !== value.sourceTabId)
			return null;
		const workspace = setReaderTabReference(context.workspace, tile.id, tab.id, reference);
		const params = new URLSearchParams(context.snapshot.readerState);
		const searches = decodeReaderUrlState(params)?.searchQueries ?? {};
		return {
			workspace,
			snapshot: {
				readerState: encodeReaderUrlState(workspace, searches, readReaderNotesFilters(params)),
				layoutSizes: workspace.layoutSizes
			}
		};
	} catch {
		return null;
	}
}

/** Search, lists and highlights use the same selected device view as the Reader header. */
export function readerWorkspaceBibleColumns(
	context: ReaderWorkspaceContext,
	bibles: ReadableResource[]
) {
	const readableIds = new Set(bibles.map((resource) => resource.id));
	const selected = workspaceColumns(context.workspace).filter((id) => readableIds.has(id));
	return selected.length ? selected : defaultColumns(bibles);
}
