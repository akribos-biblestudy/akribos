import type { VerseRef } from '$lib/bible/reference';
import type { ReaderStudyContext } from './workspace';

export type TabHistoryLocation =
	| { kind: 'reference'; reference: VerseRef }
	| { kind: 'search'; query: string; page: number; book: number | null }
	| { kind: 'lookup'; lookup: string | null; studyContext?: ReaderStudyContext | null };

type Entry = { location: TabHistoryLocation; scroll: boolean };
export type TabHistory = { entries: Entry[]; index: number };
const MAX_ENTRIES = 100;

function sameReference(left: VerseRef, right: VerseRef): boolean {
	return (
		left.book === right.book &&
		left.chapter === right.chapter &&
		left.verse === right.verse &&
		left.verseEnd === right.verseEnd
	);
}

function sameStudyContext(
	left: ReaderStudyContext | null | undefined,
	right: ReaderStudyContext | null | undefined
): boolean {
	if (!left || !right) return !left && !right;
	return (
		left.sourceResourceId === right.sourceResourceId &&
		sameReference(left.reference, right.reference) &&
		left.word === right.word &&
		left.wordPosition === right.wordPosition
	);
}

/** A later workspace mutation must not rewrite a previously visited word or verse. */
function copyLocation(location: TabHistoryLocation): TabHistoryLocation {
	if (location.kind === 'reference') return { ...location, reference: { ...location.reference } };
	if (location.kind === 'lookup' && location.studyContext) {
		return {
			...location,
			studyContext: { ...location.studyContext, reference: { ...location.studyContext.reference } }
		};
	}
	return { ...location };
}

function sameLocation(left: TabHistoryLocation, right: TabHistoryLocation): boolean {
	if (left.kind !== right.kind) return false;
	if (left.kind === 'reference' && right.kind === 'reference') {
		return sameReference(left.reference, right.reference);
	}
	if (left.kind === 'search' && right.kind === 'search')
		return left.query === right.query && left.page === right.page && left.book === right.book;
	return (
		left.kind === 'lookup' &&
		right.kind === 'lookup' &&
		left.lookup === right.lookup &&
		sameStudyContext(left.studyContext, right.studyContext)
	);
}

export function createTabHistory(location: TabHistoryLocation): TabHistory {
	return { entries: [{ location: copyLocation(location), scroll: false }], index: 0 };
}

/** Explicit visits branch at the cursor; a continuous scroll has only one mutable endpoint. */
export function visitTabHistory(
	history: TabHistory,
	location: TabHistoryLocation,
	scroll = false
): TabHistory {
	const current = history.entries[history.index]!;
	if (sameLocation(current.location, location)) {
		if (scroll || !current.scroll) return history;
		return {
			entries: [
				...history.entries.slice(0, history.index),
				{ location: copyLocation(location), scroll: false }
			],
			index: history.index
		};
	}
	if (scroll && current.location.kind !== 'reference') return history;
	const entries = history.entries.slice(0, history.index + 1);
	if (scroll && current.scroll) {
		entries.pop();
		if (entries.length && sameLocation(entries.at(-1)!.location, location))
			return { entries, index: entries.length - 1 };
	}
	entries.push({ location: copyLocation(location), scroll });
	if (entries.length > MAX_ENTRIES) entries.shift();
	return { entries, index: entries.length - 1 };
}

export function moveTabHistory(history: TabHistory, direction: -1 | 1): TabHistory | null {
	const index = history.index + direction;
	return index >= 0 && index < history.entries.length ? { ...history, index } : null;
}
