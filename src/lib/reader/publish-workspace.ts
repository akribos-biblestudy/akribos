import type { SavedWorkspaceSnapshot } from './saved-workspaces';
import { readerStateFromUrl } from './url-state';

/** Publish only fields changed in this tab. Background reading must not undo a remote layout. */
export function publishWorkspaceChanges(
	before: SavedWorkspaceSnapshot,
	after: SavedWorkspaceSnapshot,
	shared: SavedWorkspaceSnapshot
): SavedWorkspaceSnapshot {
	const previous = new URLSearchParams(before.readerState);
	const next = new URLSearchParams(after.readerState);
	const current = new URLSearchParams(shared.readerState);
	const structure = (params: URLSearchParams) =>
		JSON.stringify([
			params.get('layout'),
			params.getAll('tab').map((value) => value.slice(0, value.lastIndexOf(':')))
		]);
	// Structural edits publish a coherent new arrangement. Position/search edits must never rebuild
	// an arrangement that another tab changed, because coordinates are intentionally URL-local.
	if (structure(previous) !== structure(next)) return after;
	if (structure(previous) !== structure(current))
		return withReadingPositions(shared, changedPositions(previous, next));
	const fields = (params: URLSearchParams) =>
		new Map(
			[...params].map(([key, value]) => [
				key === 'active'
					? `active:${value.split('.')[0]}`
					: ['tab', 'lookup', 'source', 'sourceRef', 'word', 'wordPosition', 'search'].includes(key)
						? `${key}:${value.slice(0, value.indexOf(':'))}`
						: key,
				[key, value] as const
			])
		);
	const oldFields = fields(previous);
	const newFields = fields(next);
	const merged = fields(current);
	for (const key of new Set([...oldFields.keys(), ...newFields.keys()])) {
		if (JSON.stringify(oldFields.get(key)) === JSON.stringify(newFields.get(key))) continue;
		const value = newFields.get(key);
		if (value) merged.set(key, value);
		else merged.delete(key);
	}
	// A word study is one context: never combine a locally changed lookup with a remote source.
	for (const key of new Set([...oldFields.keys(), ...newFields.keys()])) {
		if (
			!/^(lookup|source|sourceRef|word|wordPosition):/.test(key) ||
			JSON.stringify(oldFields.get(key)) === JSON.stringify(newFields.get(key))
		)
			continue;
		const coordinate = key.slice(key.indexOf(':') + 1);
		for (const field of ['lookup', 'source', 'sourceRef', 'word', 'wordPosition']) {
			const contextKey = `${field}:${coordinate}`;
			const value = newFields.get(contextKey);
			if (value) merged.set(contextKey, value);
			else merged.delete(contextKey);
		}
	}
	const result = new URLSearchParams();
	for (const [key, value] of merged.values()) result.append(key, value);
	const layoutSizes = { ...shared.layoutSizes };
	for (const key of Object.keys(after.layoutSizes) as (keyof typeof layoutSizes)[]) {
		if (JSON.stringify(before.layoutSizes[key]) !== JSON.stringify(after.layoutSizes[key]))
			layoutSizes[key] = after.layoutSizes[key];
	}
	try {
		const readerState = readerStateFromUrl(new URL(`http://reader.invalid/?${result}`));
		return readerState ? { readerState, layoutSizes } : shared;
	} catch {
		return shared;
	}
}

type TabPosition = { coordinate: string; resource: string; linkSet: string; reference: string };

function tabPositions(params: URLSearchParams): TabPosition[] {
	return params.getAll('tab').map((value) => {
		const split = value.lastIndexOf(':');
		const [coordinate = '', resource = '', linkSet = ''] = value.slice(0, split).split(':');
		return { coordinate, resource, linkSet, reference: value.slice(split + 1) };
	});
}

function changedPositions(previous: URLSearchParams, next: URLSearchParams): TabPosition[] {
	const before = new Map(tabPositions(previous).map((tab) => [tab.coordinate, tab.reference]));
	return tabPositions(next).filter((tab) => before.get(tab.coordinate) !== tab.reference);
}

/**
 * Coordinates of two different arrangements do not identify the same tab. A link group does: all of
 * its tabs share one reading position. An unlinked tab only matches the same resource at the same
 * coordinate, or that resource's single unlinked tab on both sides.
 */
function positionFor(target: TabPosition, targets: TabPosition[], sources: TabPosition[]) {
	if (target.linkSet !== '-')
		return sources.findLast((source) => source.linkSet === target.linkSet)?.reference;
	const unlinked = (tabs: TabPosition[]) =>
		tabs.filter((tab) => tab.linkSet === '-' && tab.resource === target.resource);
	const candidates = unlinked(sources);
	return (
		candidates.find((source) => source.coordinate === target.coordinate)?.reference ??
		(candidates.length === 1 && unlinked(targets).length === 1
			? candidates[0]!.reference
			: undefined)
	);
}

/** Moves reading positions into another arrangement without changing that arrangement itself. */
function withReadingPositions(
	target: SavedWorkspaceSnapshot,
	sources: TabPosition[]
): SavedWorkspaceSnapshot {
	if (sources.length === 0) return target;
	const params = new URLSearchParams(target.readerState);
	const targets = tabPositions(params);
	const result = new URLSearchParams();
	let index = 0;
	let moved = false;
	for (const [key, value] of params) {
		if (key !== 'tab') {
			result.append(key, value);
			continue;
		}
		const tab = targets[index++]!;
		const reference = positionFor(tab, targets, sources) ?? tab.reference;
		moved ||= reference !== tab.reference;
		result.append(key, `${tab.coordinate}:${tab.resource}:${tab.linkSet}:${reference}`);
	}
	if (!moved) return target;
	try {
		const readerState = readerStateFromUrl(new URL(`http://reader.invalid/?${result}`));
		return readerState ? { readerState, layoutSizes: target.layoutSizes } : target;
	} catch {
		return target;
	}
}
