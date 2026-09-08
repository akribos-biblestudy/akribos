import type { VerseRef } from '$lib/bible/reference';
import {
	activeReaderTab,
	addReaderTab,
	setReaderTabLinkSet,
	setReaderTabReference,
	type ReaderLinkSet,
	type ReaderWorkspace
} from './workspace';

/** Use the first visible Bible; otherwise open one in an empty tile or as a new tab in the first tile. */
export function openReaderBibleReference(
	workspace: ReaderWorkspace,
	resources: readonly { id: string; kind: string }[],
	reference: VerseRef,
	createId: () => string,
	preferredBibleId?: string | null,
	linkSet?: Exclude<ReaderLinkSet, null>
): { workspace: ReaderWorkspace; tileId: string; tabId: string } | null {
	const bibles = resources.filter((resource) => resource.kind === 'bible');
	let tile = workspace.tiles.find((candidate) => {
		const active = activeReaderTab(candidate);
		return (
			bibles.some((bible) => bible.id === active?.resourceId) &&
			(linkSet === undefined || active?.linkSet === linkSet)
		);
	});
	let tab = tile && activeReaderTab(tile);
	if (!tab && linkSet !== undefined) {
		for (const candidate of workspace.tiles) {
			const existing = candidate.tabs.find(
				(tab) => tab.linkSet === linkSet && bibles.some((bible) => bible.id === tab.resourceId)
			);
			if (existing) {
				tile = candidate;
				tab = existing;
				break;
			}
		}
	}
	let next = workspace;
	if (!tile || !tab) {
		const bible = bibles.find((candidate) => candidate.id === preferredBibleId) ?? bibles[0];
		const destination =
			workspace.tiles.find((candidate) => !activeReaderTab(candidate)) ??
			(linkSet
				? workspace.tiles.find((candidate) => activeReaderTab(candidate)?.linkSet === linkSet)
				: undefined) ??
			workspace.tiles[0];
		if (!bible || !destination) return null;
		next = addReaderTab(workspace, destination.id, bible.id, createId);
		tile = next.tiles.find((candidate) => candidate.id === destination.id);
		const added = tile && activeReaderTab(tile);
		if (!tile || !added || added.id === destination.activeTabId) return null;
		next = setReaderTabLinkSet(next, tile.id, added.id, linkSet ?? 'A');
		tab = added;
	}
	if (!tab || !tile) return null;
	return {
		workspace: setReaderTabReference(next, tile.id, tab.id, reference),
		tileId: tile.id,
		tabId: tab.id
	};
}
