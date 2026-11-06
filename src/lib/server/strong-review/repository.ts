import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
	strongAssignmentNotes,
	strongAssignmentStatus,
	wordHasStrong
} from '../../bible/strong-assignment.ts';
import {
	isContainerSegment,
	taggedWordSegments,
	type NoteSegment,
	type VerseSegment
} from '../../bible/segments.ts';
import type { Database } from '../db/client.ts';
import { strongAssignmentReviews, strongReviewGrants } from '../db/strong-review-schema.ts';
import { verses } from '../db/schema.ts';

export type ReviewLocation = {
	resourceId: string;
	bookId: number;
	chapter: number;
	verse: number;
	wordPosition: number;
	strong: string;
	word: string;
};
export const fingerprint = (segments: readonly VerseSegment[]) =>
	createHash('sha256').update(JSON.stringify(segments)).digest('hex');
export const occurrenceCondition = (location: ReviewLocation) =>
	and(
		eq(strongAssignmentReviews.resourceId, location.resourceId),
		eq(strongAssignmentReviews.bookId, location.bookId),
		eq(strongAssignmentReviews.chapter, location.chapter),
		eq(strongAssignmentReviews.verse, location.verse),
		eq(strongAssignmentReviews.wordPosition, location.wordPosition),
		eq(strongAssignmentReviews.strong, location.strong)
	);
export async function canReview(
	db: Database,
	user: { id: string; role: string } | null | undefined
) {
	if (!user) return false;
	if (user.role === 'admin') return true;
	const [grant] = await db
		.select({ id: strongReviewGrants.userId })
		.from(strongReviewGrants)
		.where(eq(strongReviewGrants.userId, user.id))
		.limit(1);
	return !!grant;
}
export async function currentVerse(db: Database, location: ReviewLocation) {
	const [row] = await db
		.select({ segments: verses.segments })
		.from(verses)
		.where(
			and(
				eq(verses.resourceId, location.resourceId),
				eq(verses.bookId, location.bookId),
				eq(verses.chapter, location.chapter),
				eq(verses.verse, location.verse)
			)
		)
		.limit(1);
	return row;
}
export function matchesCurrentVerse(location: ReviewLocation, segments: VerseSegment[]) {
	return (
		strongAssignmentStatus(segments, location.strong, location.word, location.wordPosition) ===
		'unconfirmed'
	);
}
export async function readReview(db: Database, location: ReviewLocation, segments: VerseSegment[]) {
	const [review] = await db
		.select()
		.from(strongAssignmentReviews)
		.where(occurrenceCondition(location))
		.limit(1);
	return review &&
		review.verseFingerprint === fingerprint(segments) &&
		review.word === location.word
		? review
		: undefined;
}
export async function deleteOwnPending(db: Database, id: string, userId: string) {
	return db
		.delete(strongAssignmentReviews)
		.where(
			and(
				eq(strongAssignmentReviews.id, id),
				eq(strongAssignmentReviews.authorId, userId),
				isNull(strongAssignmentReviews.approvedAt)
			)
		)
		.returning({ id: strongAssignmentReviews.id });
}

/** Only changes the returned display copy, never source segments. A changed verse invalidates the
 * review; a multi-Strong word's other assignments remain independently reviewable. */
export function overlayApprovedReviews(
	segments: VerseSegment[],
	strong: string,
	reviews: {
		wordPosition: number;
		word: string;
		verseFingerprint: string;
		decision: 'confirmed' | 'incorrect';
	}[]
): VerseSegment[] {
	const words = taggedWordSegments(segments);
	const notesByWord = new Map(
		strongAssignmentNotes(segments).map(({ note, word }) => [word, note])
	);
	const changes = new Map<NoteSegment, 'confirmed' | 'incorrect'>();
	const hash = fingerprint(segments);
	for (const review of reviews) {
		const word = words[review.wordPosition];
		if (
			review.verseFingerprint !== hash ||
			!word ||
			word.text !== review.word ||
			!wordHasStrong(word, strong)
		)
			continue;
		const note = notesByWord.get(word);
		if (note) changes.set(note, review.decision);
	}
	const transform = (input: readonly VerseSegment[]): VerseSegment[] =>
		input.flatMap((segment): VerseSegment[] => {
			if (typeof segment !== 'string' && segment.kind === 'note' && changes.has(segment)) {
				return changes.get(segment) === 'confirmed'
					? []
					: [
							{
								...segment,
								text: `Die Strong-Zuordnung zu ${strong} wurde fachlich als fehlerhaft markiert.`
							}
						];
			}
			if (isContainerSegment(segment))
				return [{ ...segment, children: transform(segment.children) }];
			return [segment];
		});
	return changes.size ? transform(segments) : segments;
}
