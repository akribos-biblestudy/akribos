import { isContainerSegment, type NoteSegment, type VerseSegment } from './segments';
import { isStrongAssignmentNote } from './strong-assignment';

/**
 * Display-only note placement. A source note before any scripture word has no
 * word anchor, so it belongs to the verse end. End notes share one popup while
 * retaining every source marker and body. Stored segments and word objects stay
 * untouched; in particular Strong assignment warnings never move or merge.
 */
export function placeVerseNotes(segments: readonly VerseSegment[]): VerseSegment[] {
	const leaves: VerseSegment[] = [];
	function flatten(items: readonly VerseSegment[]) {
		for (const item of items) {
			if (isContainerSegment(item)) flatten(item.children);
			else leaves.push(item);
		}
	}
	flatten(segments);
	const hasWord = (item: VerseSegment) =>
		/\p{L}|\p{N}/u.test(
			typeof item === 'string' ? item : item.kind === 'w' || item.kind === 'em' ? item.text : ''
		);
	const first = leaves.findIndex(hasWord);
	const last = leaves.findLastIndex(hasWord);
	const endNotes = leaves.filter(
		(item, index): item is NoteSegment =>
			typeof item !== 'string' &&
			item.kind === 'note' &&
			!isStrongAssignmentNote(item) &&
			(index < first || index > last)
	);
	const removed = new Set(endNotes);
	function remaining(items: readonly VerseSegment[]): VerseSegment[] {
		return items.flatMap((item): VerseSegment[] => {
			if (typeof item !== 'string' && item.kind === 'note' && removed.has(item)) return [];
			if (isContainerSegment(item)) return [{ ...item, children: remaining(item.children) }];
			return [item];
		});
	}
	const result = remaining(segments);
	if (endNotes.length) {
		const markers = [...new Set(endNotes.map((note) => note.marker.trim() || '*'))];
		const combined: NoteSegment = {
			kind: 'note',
			marker: markers.join(', '),
			text:
				endNotes.length === 1
					? endNotes[0]!.text
					: endNotes.map((note) => `${note.marker.trim() || '*'}: ${note.text}`).join('\n\n')
		};
		let insert = result.length;
		while (insert > 0) {
			const previous = result[insert - 1]!;
			if (
				(typeof previous === 'string' && !previous.trim()) ||
				(typeof previous !== 'string' && previous.kind === 'br')
			)
				insert--;
			else break;
		}
		result.splice(insert, 0, combined);
	}
	return attachMarkers(result);
}

/** Keep imported whitespace as scripture, but put it after its word's marker. */
function attachMarkers(segments: readonly VerseSegment[]): VerseSegment[] {
	const result: VerseSegment[] = [];
	for (const original of segments) {
		const segment = isContainerSegment(original)
			? { ...original, children: attachMarkers(original.children) }
			: original;
		const previous = result.at(-1);
		if (
			typeof segment !== 'string' &&
			segment.kind === 'note' &&
			!isStrongAssignmentNote(segment) &&
			typeof previous === 'string'
		) {
			const gap = /\s+$/u.exec(previous)?.[0];
			if (gap) {
				result.pop();
				const text = previous.slice(0, -gap.length);
				if (text) result.push(text);
				result.push(segment, gap);
				continue;
			}
		}
		result.push(segment);
	}
	return result;
}
