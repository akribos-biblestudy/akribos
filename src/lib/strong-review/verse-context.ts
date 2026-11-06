import { isContainerSegment, type VerseSegment } from '$lib/bible/segments';

export type ReviewVerseChunk = { text: string; target: boolean };

/** Uses the stored Strong-word index, so repeated identical words stay distinguishable. */
export function reviewVerseChunks(
	segments: readonly VerseSegment[],
	wordPosition: number
): ReviewVerseChunk[] {
	const chunks: ReviewVerseChunk[] = [];
	let position = 0;
	function append(text: string, target = false) {
		if (!text) return;
		const previous = chunks.at(-1);
		if (!target && previous && !previous.target) previous.text += text;
		else chunks.push({ text, target });
	}
	function visit(items: readonly VerseSegment[]) {
		for (const segment of items) {
			if (typeof segment === 'string') append(segment);
			else if (segment.kind === 'w') append(segment.text, position++ === wordPosition);
			else if (segment.kind === 'em') append(segment.text);
			else if (segment.kind === 'br') append('\n');
			else if (isContainerSegment(segment)) visit(segment.children);
		}
	}
	visit(segments);
	return chunks;
}
