import { describe, expect, it } from 'vitest';
import { STRONG_ASSIGNMENT_NOTE_TEXT, strongAssignmentStatus } from '$lib/bible/strong-assignment';
import type { VerseSegment } from '$lib/bible/segments';
import { fingerprint, overlayApprovedReviews } from './repository';

const original: VerseSegment[] = [
	{ kind: 'w', text: 'Wort', strong: 'G1', strongs: ['G1', 'G2'] },
	{ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT },
	' ',
	{ kind: 'w', text: 'Wort', strong: 'G1' },
	{ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT }
];
const review = {
	word: 'Wort',
	wordPosition: 0,
	verseFingerprint: fingerprint(original),
	decision: 'confirmed' as const
};
describe('approved Strong reviews', () => {
	it('changes only the reviewed occurrence and never mutates the stored verse', () => {
		const result = overlayApprovedReviews(original, 'G1', [review]);
		expect(strongAssignmentStatus(result, 'G1', 'Wort', 0)).toBeNull();
		expect(strongAssignmentStatus(result, 'G1', 'Wort', 1)).toBe('unconfirmed');
		expect(strongAssignmentStatus(original, 'G1', 'Wort', 0)).toBe('unconfirmed');
	});
	it('rejects reviews for a changed verse or a different spelling', () => {
		const changed = [...original, '!'];
		expect(overlayApprovedReviews(changed, 'G1', [review])).toEqual(changed);
		expect(overlayApprovedReviews(original, 'G1', [{ ...review, word: 'Anders' }])).toEqual(
			original
		);
	});
	it('preserves the signal for a different Strong assignment', () => {
		expect(overlayApprovedReviews(original, 'G3', [review])).toEqual(original);
	});
	it('marks faulty assignments instead of claiming that they were confirmed', () => {
		const result = overlayApprovedReviews(original, 'G1', [{ ...review, decision: 'incorrect' }]);
		expect(result).toContainEqual({
			kind: 'note',
			marker: '',
			text: 'Die Strong-Zuordnung zu G1 wurde fachlich als fehlerhaft markiert.'
		});
	});
});
