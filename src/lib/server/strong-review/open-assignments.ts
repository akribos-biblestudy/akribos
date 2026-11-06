import { strongAssignmentNotes } from '$lib/bible/strong-assignment';
import { segmentsToText, taggedWordSegments, type VerseSegment } from '$lib/bible/segments';
import { fingerprint } from './repository';

export type AssignmentVerse = {
	bookId: number;
	chapter: number;
	verse: number;
	segments: VerseSegment[];
};
export type AssignmentReview = {
	bookId: number;
	chapter: number;
	verse: number;
	wordPosition: number;
	strong: string;
	word: string;
	verseFingerprint: string;
	approvedAt: Date | null;
	authorId: string | null;
	decision: 'confirmed' | 'incorrect';
};

const occurrenceKey = (
	book: number,
	chapter: number,
	verse: number,
	position: number,
	strong: string
) => `${book}:${chapter}:${verse}:${position}:${strong}`;

/** Find reviewable assignments in a bounded batch, using the same parser as the Reader. */
export function openAssignments(
	resourceId: string,
	viewerId: string,
	verses: AssignmentVerse[],
	reviews: AssignmentReview[]
) {
	const byOccurrence = new Map(
		reviews.map((review) => [
			occurrenceKey(
				review.bookId,
				review.chapter,
				review.verse,
				review.wordPosition,
				review.strong
			),
			review
		])
	);
	return verses.flatMap((row) => {
		const notes = strongAssignmentNotes(row.segments);
		if (!notes.length) return [];
		const words = taggedWordSegments(row.segments);
		const hash = fingerprint(row.segments);
		const context = segmentsToText(row.segments);
		return notes.flatMap(({ word }) => {
			const wordPosition = words.indexOf(word);
			if (wordPosition < 0) return [];
			return [...new Set(word.strongs ?? [word.strong])].flatMap((strong) => {
				const review = byOccurrence.get(
					occurrenceKey(row.bookId, row.chapter, row.verse, wordPosition, strong)
				);
				const current =
					review?.verseFingerprint === hash && review.word === word.text ? review : undefined;
				if (current?.approvedAt) return [];
				return [
					{
						resourceId,
						bookId: row.bookId,
						chapter: row.chapter,
						verse: row.verse,
						context,
						segments: row.segments,
						word: word.text,
						wordPosition,
						strong,
						pending: current?.authorId === viewerId ? current.decision : null,
						pendingByOther: !!current && current.authorId !== viewerId
					}
				];
			});
		});
	});
}

/** Count all open assignments while retaining only the requested page and a fallback last page. */
export function assignmentPage(requestedPage: number, pageSize = 25) {
	type Item = ReturnType<typeof openAssignments>[number];
	let total = 0;
	const selected: Item[] = [];
	const tail: Item[] = [];
	return {
		add(items: Item[]) {
			for (const item of items) {
				if (total >= (requestedPage - 1) * pageSize && total < requestedPage * pageSize)
					selected.push(item);
				tail.push(item);
				if (tail.length > pageSize) tail.shift();
				total++;
			}
		},
		result() {
			const pages = Math.max(1, Math.ceil(total / pageSize));
			const page = Math.min(requestedPage, pages);
			const lastPageCount = total - (pages - 1) * pageSize;
			return {
				total,
				pages,
				page,
				items: page === requestedPage ? selected : lastPageCount ? tail.slice(-lastPageCount) : []
			};
		}
	};
}
