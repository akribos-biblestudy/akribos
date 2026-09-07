import { referencePath } from '$lib/bible/reference';
import {
	decodeReaderUrlState,
	encodeReaderUrlState,
	MAX_READER_URL_STATE_LENGTH,
	readReaderNotesFilters,
	readerUrl
} from './url-state';
import { activeReaderTab, normalizeReaderWorkspace, type ReaderWorkspace } from './workspace';

export const MAX_SAVED_WORKSPACES = 100;
export const MAX_WORKSPACE_NAME_LENGTH = 80;

/** The portable Reader state plus the divider sizes intentionally omitted from shared URLs. */
export type SavedWorkspaceSnapshot = {
	readerState: string;
	layoutSizes: ReaderWorkspace['layoutSizes'];
};

export type SavedWorkspaceSummary = { id: string; name: string; revision: number };

/** Provided by the root layout per render, never shared between server requests. */
export const READER_WORKSPACE_CONTEXT = Symbol('reader-workspace-capture');
export type ReaderWorkspaceCapture = { capture: (() => SavedWorkspaceSnapshot) | null };

export function cleanWorkspaceName(value: string): string | null {
	const name = value.replace(/\s+/gu, ' ').trim();
	return name && Array.from(name).length <= MAX_WORKSPACE_NAME_LENGTH ? name : null;
}

/** Used both when saving and when opening: resources may have disappeared in the meantime. */
export function restoreSavedWorkspace(
	value: { readerState: string; layoutSizes?: unknown },
	availableResourceIds: readonly string[]
) {
	if (!value.readerState || value.readerState.length > MAX_READER_URL_STATE_LENGTH) return null;
	const params = new URLSearchParams(value.readerState);
	const decoded = decodeReaderUrlState(params);
	if (!decoded) return null;
	const workspace = normalizeReaderWorkspace(
		{ ...(decoded.workspace as object), layoutSizes: value.layoutSizes },
		availableResourceIds
	);
	const focusedTile = workspace.tiles.find((tile) => tile.id === workspace.focusedTileId);
	const reference = (focusedTile && activeReaderTab(focusedTile)?.reference) ?? {
		book: 43,
		chapter: 1
	};
	try {
		const readerState = encodeReaderUrlState(
			workspace,
			decoded.searchQueries,
			readReaderNotesFilters(params)
		);
		return {
			workspace,
			reference,
			url: readerUrl(referencePath(reference), readerState),
			snapshot: { readerState, layoutSizes: workspace.layoutSizes }
		};
	} catch {
		return null;
	}
}
