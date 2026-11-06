import { describe, expect, it } from 'vitest';
import type { VerseSegment } from '$lib/bible/segments';
import { STRONG_ASSIGNMENT_NOTE_TEXT } from '$lib/bible/strong-assignment';
import { fingerprint } from './repository';
import {
	assignmentPage,
	openAssignments,
	type AssignmentReview,
	type AssignmentVerse
} from './open-assignments';

const segments: VerseSegment[] = [
	{ kind: 'w', text: 'Wort', strong: 'G1', strongs: ['G1', 'G2'] },
	{ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT },
	' und ',
	{
		kind: 'wj',
		children: [
			{ kind: 'w', text: 'Wort', strong: 'G1' },
			' ',
			{
				kind: 'note',
				marker: '',
				text: `  Automatische Wortzuordnung;\n fachlich noch nicht bestätigt. `
			}
		]
	}
];
const verse: AssignmentVerse = { bookId: 43, chapter: 3, verse: 16, segments };
const hash = fingerprint(segments);
const makeReview = (changes: Partial<AssignmentReview> = {}): AssignmentReview => ({
	bookId: 43,
	chapter: 3,
	verse: 16,
	wordPosition: 0,
	strong: 'G1',
	word: 'Wort',
	verseFingerprint: hash,
	approvedAt: null,
	authorId: 'user-a',
	decision: 'confirmed',
	...changes
});

describe('open Strong assignments', () => {
	it('distinguishes repeated words and multiple Strong IDs, retaining exact positions', () => {
		const items = openAssignments('BIBLE', 'user-a', [verse], []);
		expect(items.map(({ wordPosition, strong }) => [wordPosition, strong])).toEqual([
			[0, 'G1'],
			[0, 'G2'],
			[1, 'G1']
		]);
		expect(items.every((item) => item.segments === segments)).toBe(true);
	});
	it('excludes only current approvals and marks only another person’s current pending decision', () => {
		const items = openAssignments(
			'BIBLE',
			'user-a',
			[verse],
			[
				makeReview({ approvedAt: new Date() }),
				makeReview({ strong: 'G2', authorId: 'user-b', decision: 'incorrect' }),
				makeReview({ wordPosition: 1, verseFingerprint: 'old', approvedAt: new Date() })
			]
		);
		expect(
			items.map(({ wordPosition, strong, pending, pendingByOther }) => ({
				wordPosition,
				strong,
				pending,
				pendingByOther
			}))
		).toEqual([
			{ wordPosition: 0, strong: 'G2', pending: null, pendingByOther: true },
			{ wordPosition: 1, strong: 'G1', pending: null, pendingByOther: false }
		]);
		const own = openAssignments('BIBLE', 'user-a', [verse], [makeReview()]);
		expect(own[0]).toMatchObject({ pending: 'confirmed', pendingByOther: false });
	});
	it('counts and pages assignments rather than verses even across batch boundaries', () => {
		const verses = Array.from({ length: 30 }, (_, i) => ({ ...verse, verse: i + 1 }));
		const approved = verses
			.slice(0, 10)
			.flatMap((row) => [
				makeReview({ verse: row.verse, strong: 'G1', approvedAt: new Date() }),
				makeReview({ verse: row.verse, strong: 'G2', approvedAt: new Date() }),
				makeReview({ verse: row.verse, wordPosition: 1, approvedAt: new Date() })
			]);
		const page = assignmentPage(2);
		page.add(openAssignments('BIBLE', 'user-a', verses.slice(0, 15), approved));
		page.add(openAssignments('BIBLE', 'user-a', verses.slice(15), approved));
		const result = page.result();
		expect(result).toMatchObject({ page: 2, pages: 3, total: 60 });
		expect(result.items).toHaveLength(25);
		expect(result.items[0]).toMatchObject({ verse: 19, wordPosition: 0, strong: 'G2' });
		const beyond = assignmentPage(100);
		beyond.add(openAssignments('BIBLE', 'user-a', verses, approved));
		expect(beyond.result()).toMatchObject({ page: 3, pages: 3, total: 60 });
		expect(beyond.result().items).toHaveLength(10);
	});
	it('returns an empty first page when every assignment is approved', () => {
		const reviews = [
			makeReview({ approvedAt: new Date() }),
			makeReview({ strong: 'G2', approvedAt: new Date() }),
			makeReview({ wordPosition: 1, approvedAt: new Date() })
		];
		const page = assignmentPage(3);
		page.add(openAssignments('BIBLE', 'user-a', [verse], reviews));
		expect(page.result()).toEqual({ total: 0, pages: 1, page: 1, items: [] });
	});
});
