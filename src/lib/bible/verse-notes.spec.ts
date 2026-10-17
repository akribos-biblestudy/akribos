import { describe, expect, it } from 'vitest';
import {
	countVerseWords,
	segmentsToText,
	splitVerseLead,
	taggedWordSegments,
	type VerseSegment
} from './segments';
import { STRONG_ASSIGNMENT_NOTE_TEXT, strongAssignmentNotes } from './strong-assignment';
import { placeVerseNotes } from './verse-notes';

describe('verse note presentation', () => {
	it('moves a verse introduction to the end and combines its marker with a final-word note', () => {
		const word = { kind: 'w', text: 'Wort', strong: 'G3056' } as const;
		const segments: VerseSegment[] = [
			{ kind: 'note', marker: '', text: '1,1: Siehe auch 1Mo 1,1.' },
			'Im Anfang war das ',
			{ kind: 'nd', children: [word, { kind: 'note', marker: '17', text: 'Griechisch: Logos.' }] },
			'.',
			' '
		];
		const before = structuredClone(segments);
		const displayed = placeVerseNotes(segments);
		expect(displayed.at(-2)).toEqual({
			kind: 'note',
			marker: '*, 17',
			text: '*: 1,1: Siehe auch 1Mo 1,1.\n\n17: Griechisch: Logos.'
		});
		expect(displayed[0]).toBe('Im Anfang war das ');
		expect(segmentsToText(displayed)).toBe(segmentsToText(segments));
		expect(countVerseWords(displayed)).toBe(countVerseWords(segments));
		expect(taggedWordSegments(displayed)).toEqual([word]);
		expect(taggedWordSegments(displayed)[0]).toBe(word);
		expect(segments).toEqual(before);
	});

	it('retains mid-verse word notes and combines repeated generic end markers once', () => {
		const middle = { kind: 'note', marker: '4', text: 'Zum Wort.' } as const;
		const displayed = placeVerseNotes([
			'Ein Wort',
			middle,
			' bleibt.',
			{ kind: 'note', marker: '', text: 'Erste Erklärung.' },
			{ kind: 'note', marker: '', text: 'Zweite Erklärung.' }
		]);
		expect(displayed[1]).toBe(middle);
		expect(displayed.at(-1)).toEqual({
			kind: 'note',
			marker: '*',
			text: '*: Erste Erklärung.\n\n*: Zweite Erklärung.'
		});
	});

	it('never detaches automatic assignment notes from their exact word', () => {
		const word = { kind: 'w', text: 'Wort', strong: 'G3056' } as const;
		const note = { kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT } as const;
		const displayed = placeVerseNotes([
			{ kind: 'note', marker: '', text: 'Vershinweis' },
			word,
			note,
			'.'
		]);
		expect(strongAssignmentNotes(displayed)).toEqual([{ word, note }]);
		expect(displayed.at(-1)).toEqual({ kind: 'note', marker: '*', text: 'Vershinweis' });
	});

	it('places whole-verse notes before splitting the lead without detaching first-word notes', () => {
		const wordNote = { kind: 'note', marker: '1', text: 'Zum Anfang.' } as const;
		const [lead, rest] = splitVerseLead(
			placeVerseNotes([
				{ kind: 'note', marker: '', text: 'Vershinweis' },
				{ kind: 'w', text: 'Anfang', strong: 'G746' },
				wordNote,
				' und Ende.'
			])
		);
		expect(lead).toEqual([{ kind: 'w', text: 'Anfang', strong: 'G746' }]);
		expect(rest[0]).toBe(wordNote);
		expect(rest.at(-1)).toEqual({ kind: 'note', marker: '*', text: 'Vershinweis' });
	});
	it('attaches imported markers without deleting or duplicating scripture whitespace', () => {
		const source: VerseSegment[] = [
			'Ein Wort ',
			{ kind: 'note', marker: '3', text: 'Worterklärung' },
			'bleibt hier. ',
			{ kind: 'note', marker: '', text: 'Vershinweis' }
		];
		const displayed = placeVerseNotes(source);
		expect(displayed).toEqual([
			'Ein Wort',
			{ kind: 'note', marker: '3', text: 'Worterklärung' },
			' ',
			'bleibt hier.',
			{ kind: 'note', marker: '*', text: 'Vershinweis' },
			' '
		]);
		expect(segmentsToText(displayed)).toBe(segmentsToText(source));
		expect(countVerseWords(displayed)).toBe(countVerseWords(source));
	});

	it('keeps notes on an otherwise empty verse accessible', () => {
		expect(placeVerseNotes([{ kind: 'note', marker: '2', text: 'Erklärung' }])).toEqual([
			{ kind: 'note', marker: '2', text: 'Erklärung' }
		]);
	});
});
