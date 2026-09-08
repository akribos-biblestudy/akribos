export const TAB_HISTORY_MUTATION_EVENT = 'reader-tab-history-mutation';

/** Carry tab identity across the readable URL's coordinate changes, without sharing any history. */
export function announceTabHistoryMutation(data: unknown): void {
	if (!data || typeof data !== 'object' || !('tabOrigins' in data)) return;
	const origins = data.tabOrigins;
	if (!origins || typeof origins !== 'object' || Array.isArray(origins)) return;
	if (!Object.values(origins).every((value) => typeof value === 'string')) return;
	window.dispatchEvent(new CustomEvent(TAB_HISTORY_MUTATION_EVENT, { detail: origins }));
}
