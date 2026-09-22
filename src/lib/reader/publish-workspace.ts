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
	if (structure(previous) !== structure(current)) return shared;
	const fields = (params: URLSearchParams) =>
		new Map(
			[...params].map(([key, value]) => [
				key === 'active'
					? `active:${value.split('.')[0]}`
					: ['tab', 'lookup', 'source', 'sourceRef', 'word', 'search'].includes(key)
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
			!/^(lookup|source|sourceRef|word):/.test(key) ||
			JSON.stringify(oldFields.get(key)) === JSON.stringify(newFields.get(key))
		)
			continue;
		const coordinate = key.slice(key.indexOf(':') + 1);
		for (const field of ['lookup', 'source', 'sourceRef', 'word']) {
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
