import {
	taggedWordSegments,
	type NoteSegment,
	type VerseSegment,
	type WordSegment
} from './segments.ts';

/** Shared import signal; older stored notes retain this text without the source's XML metadata. */
export const STRONG_ASSIGNMENT_NOTE_TEXT =
	'Automatische Wortzuordnung; fachlich noch nicht bestätigt.';

export function isStrongAssignmentNote(segment: VerseSegment): segment is NoteSegment {
	return (
		typeof segment !== 'string' &&
		segment.kind === 'note' &&
		segment.marker.trim() === '' &&
		segment.text.trim().replace(/\s+/gu, ' ') === STRONG_ASSIGNMENT_NOTE_TEXT
	);
}

export type StrongAssignmentNote = { note: NoteSegment; word: WordSegment };

/**
 * The source puts this note directly after the affected word. Do not promote it to a property of
 * the Strong number: another word carrying that number in the same verse can be well established.
 * Only insignificant whitespace may separate the word and note; never cross ordinary prose.
 */
export function strongAssignmentNotes(segments: readonly VerseSegment[]): StrongAssignmentNote[] {
	const result: StrongAssignmentNote[] = [];
	let precedingWord: WordSegment | null = null;
	for (const segment of segments) {
		if (typeof segment === 'string') {
			if (segment.trim()) precedingWord = null;
		} else if (segment.kind === 'w') {
			precedingWord = segment;
		} else {
			if (isStrongAssignmentNote(segment) && precedingWord) {
				result.push({ note: segment, word: precedingWord });
			} else if (segment.kind === 'wj') {
				result.push(...strongAssignmentNotes(segment.children));
			}
			precedingWord = null;
		}
	}
	return result;
}

export function wordHasStrong(word: WordSegment, strong: string): boolean {
	return word.strong === strong || (word.strongs?.includes(strong) ?? false);
}

export function strongAssignmentMessage(word: WordSegment, strong?: string | null): string {
	const ids = strong && wordHasStrong(word, strong) ? [strong] : (word.strongs ?? [word.strong]);
	return `Die Strong-Zuordnung von „${word.text}“ zu ${ids.join(', ')} ist fachlich noch nicht bestätigt.`;
}

export function normalizeWordPosition(value: unknown): number | undefined {
	if (typeof value === 'string' && /^\d+$/u.test(value)) value = Number(value);
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000
		? value
		: undefined;
}

/** An absent marker is unmarked, never evidence of a completed scholarly review. */
export function strongAssignmentStatus(
	segments: readonly VerseSegment[],
	strong: string,
	word: string,
	position?: number
): 'unconfirmed' | 'ambiguous' | null {
	if (!word) return null;
	const words = taggedWordSegments(segments);
	const uncertain = new Set(strongAssignmentNotes(segments).map((entry) => entry.word));
	const matches = (candidate: WordSegment) =>
		candidate.text === word && wordHasStrong(candidate, strong);
	if (position !== undefined) {
		const selected = words[position];
		return selected && matches(selected) && uncertain.has(selected) ? 'unconfirmed' : null;
	}
	const candidates = words.filter(matches);
	const unconfirmed = candidates.filter((candidate) => uncertain.has(candidate));
	if (!unconfirmed.length) return null;
	return unconfirmed.length === candidates.length ? 'unconfirmed' : 'ambiguous';
}
