import type { VerseRef } from '$lib/bible/reference';
import {
	activeReaderTab,
	addReaderTab,
	setReaderTabLinkSet,
	setReaderTabReference,
	type ReaderWorkspace
} from './workspace';

/** Use the first visible Bible; otherwise open one in an empty tile or as a new tab in the first tile. */
export function openReaderBibleReference(
	workspace: ReaderWorkspace,
	resources: readonly { id: string; kind: string }[],
	reference: VerseRef,
	createId: () => string,
	preferredBibleId?: string | null
): { workspace: ReaderWorkspace; tileId: string; tabId: string } | null {
	const bibles = resources.filter((resource) => resource.kind === 'bible');
	let tile = workspace.tiles.find((candidate) =>
		bibles.some((bible) => bible.id === activeReaderTab(candidate)?.resourceId)
	);
	let next = workspace;
	if (!tile) {
		const bible = bibles.find((candidate) => candidate.id === preferredBibleId) ?? bibles[0];
		const destination =
			workspace.tiles.find((candidate) => !activeReaderTab(candidate)) ?? workspace.tiles[0];
		if (!bible || !destination) return null;
		next = addReaderTab(workspace, destination.id, bible.id, createId);
		tile = next.tiles.find((candidate) => candidate.id === destination.id);
		const added = tile && activeReaderTab(tile);
		if (!tile || !added || added.id === destination.activeTabId) return null;
		next = setReaderTabLinkSet(next, tile.id, added.id, 'A');
	}
	const tab = activeReaderTab(tile);
	if (!tab) return null;
	return {
		workspace: setReaderTabReference(next, tile.id, tab.id, reference),
		tileId: tile.id,
		tabId: tab.id
	};
}
