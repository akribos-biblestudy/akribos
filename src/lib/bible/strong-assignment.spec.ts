import { describe, expect, it } from 'vitest';
import {
	splitVerseLead,
	taggedWordSegments,
	wordsFromSegments,
	type VerseSegment
} from './segments';
import {
	isStrongAssignmentNote,
	normalizeWordPosition,
	strongAssignmentNotes,
	strongAssignmentStatus
} from './strong-assignment';
import { parseZefania } from './parse/zefania';

const note = () =>
	({
		kind: 'note',
		marker: '',
		text: 'Automatische Wortzuordnung; fachlich noch nicht bestätigt.'
	}) as const;
const word = (text: string, strong: string) => ({ kind: 'w', text, strong }) as const;

describe('source-bound Strong assignment uncertainty', () => {
	it('keeps an unmarked God occurrence distinct from uncertain conjunctions with the same Strong', () => {
		const segments = [
			word('Gott', 'H430'),
			' sprach ',
			word('und', 'H430'),
			note(),
			' ',
			word('und', 'H430'),
			note()
		];
		expect(strongAssignmentStatus(segments, 'H430', 'Gott', 0)).toBeNull();
		expect(strongAssignmentStatus(segments, 'H430', 'Gott')).toBeNull();
		expect(strongAssignmentStatus(segments, 'H430', 'und', 1)).toBe('unconfirmed');
		expect(strongAssignmentStatus(segments, 'H430', 'und', 2)).toBe('unconfirmed');
		expect(strongAssignmentStatus(segments, 'H431', 'und', 1)).toBeNull();
		expect(strongAssignmentStatus(segments, 'H430', 'Gott', 1)).toBeNull();
		expect(strongAssignmentStatus(segments, 'H430', 'und', 99)).toBeNull();
	});

	it.each([
		['H6213', 'hatte', [false, false, true]],
		['G2193', 'bis', [true, false, true]]
	] as const)(
		'distinguishes repeated %s %s words by their actual tagged-word position',
		(strong, text, flags) => {
			const segments: VerseSegment[] = [];
			flags.forEach((uncertain) => {
				segments.push(word(text, strong));
				if (uncertain) segments.push(note());
				segments.push(' ');
			});
			flags.forEach((uncertain, position) =>
				expect(strongAssignmentStatus(segments, strong, text, position)).toBe(
					uncertain ? 'unconfirmed' : null
				)
			);
			expect(strongAssignmentStatus(segments, strong, text)).toBe('ambiguous');
		}
	);

	it('binds only the exact unmarked source note to its immediately preceding word', () => {
		const marked = { ...note(), marker: 'a' };
		const different = { ...note(), text: 'Eine andere automatische Wortzuordnung.' };
		const normalized = {
			...note(),
			text: '  Automatische Wortzuordnung;\n fachlich noch nicht bestätigt. '
		};
		expect(isStrongAssignmentNote(marked)).toBe(false);
		expect(isStrongAssignmentNote(different)).toBe(false);
		expect(strongAssignmentNotes([word('Gott', 'H430'), ' \n', normalized])).toHaveLength(1);
		expect(strongAssignmentNotes([word('Gott', 'H430'), ' anderer Text ', note()])).toEqual([]);
		expect(strongAssignmentNotes([word('Gott', 'H430'), marked, note()])).toEqual([]);
	});

	it('shares index semantics with imported verse_words, including split leads, red letters and multiple Strongs', () => {
		const segments: VerseSegment[] = [
			word('Jesus', 'G2424'),
			', ',
			{
				kind: 'wj',
				children: ['ich sage ', { ...word('Worte', 'G3056'), strongs: ['G3056', 'G4487'] }, note()]
			},
			' ',
			word('heute', 'G4594')
		];
		const [lead, rest] = splitVerseLead(segments);
		expect(taggedWordSegments(lead).length).toBe(1);
		expect(taggedWordSegments(rest).map((entry) => entry.text)).toEqual(['Worte', 'heute']);
		expect(wordsFromSegments(segments).map(({ position, strong }) => [position, strong])).toEqual([
			[0, 'G2424'],
			[1, 'G3056'],
			[1, 'G4487'],
			[2, 'G4594']
		]);
		expect(strongAssignmentStatus(segments, 'G4487', 'Worte', 1)).toBe('unconfirmed');
	});

	it.each([1, 40])('uses the same real XML note signal in canonical book %i', async (book) => {
		const xml = `<XMLBIBLE biblename="Test"><INFORMATION><identifier>TEST</identifier></INFORMATION><BIBLEBOOK bnumber="${book}"><CHAPTER cnumber="1"><VERS vnumber="1"><gr str="430">Wort</gr><NOTE type="x-explanation" ex="nl:akribosStrongUncertainty">${note().text}</NOTE></VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
		for await (const event of parseZefania(xml))
			if (event.type === 'verse')
				expect(
					strongAssignmentStatus(event.verse.segments, `${book < 40 ? 'H' : 'G'}430`, 'Wort', 0)
				).toBe('unconfirmed');
	});

	it('accepts only bounded nonnegative tagged-word indices', () => {
		expect(normalizeWordPosition('0')).toBe(0);
		expect(normalizeWordPosition(13)).toBe(13);
		for (const invalid of [null, '', '-1', '1.5', 'Infinity', 100001, NaN, {}])
			expect(normalizeWordPosition(invalid)).toBeUndefined();
	});
});
