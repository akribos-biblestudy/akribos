import { describe, expect, it } from 'vitest';
import {
	countVerseWords,
	finalizeSegments,
	highlightSegments,
	initHighlightCursor,
	splitVerseLead,
	segmentsToText,
	tidySegmentSpacing,
	wordRangeForCharSpan,
	wordsFromSegments,
	type HighlightRange,
	type VerseSegment
} from './segments.ts';

describe('segmentsToText', () => {
	it('flattens words and plain runs', () => {
		expect(
			segmentsToText(['Im ', { kind: 'w', text: 'Anfang', strong: 'H7225' }, ' schuf Gott.'])
		).toBe('Im Anfang schuf Gott.');
	});

	it('leaves notes out, so a search cannot match editorial text', () => {
		expect(
			segmentsToText([
				'Und Adam erkannte sein Weib Eva',
				{ kind: 'note', marker: '', text: 'Hebr. Chawwa' }
			])
		).toBe('Und Adam erkannte sein Weib Eva');
	});

	it('includes emphasis and words of Jesus', () => {
		expect(
			segmentsToText([
				{ kind: 'em', text: 'ist' },
				' ',
				{ kind: 'wj', children: ['Ich bin ', { kind: 'em', text: 'der' }, ' Weg'] }
			])
		).toBe('ist Ich bin der Weg');
	});

	it('turns a line break into a space', () => {
		expect(segmentsToText(['Zeile eins', { kind: 'br' }, 'Zeile zwei'])).toBe(
			'Zeile eins Zeile zwei'
		);
	});
});

describe('splitVerseLead', () => {
	it('keeps the first word and its punctuation together', () => {
		expect(splitVerseLead(['Jesus, antwortete ihnen.'])).toEqual([
			['Jesus,'],
			[' antwortete ihnen.']
		]);
	});

	it('attaches punctuation from the next segment to a tagged word', () => {
		const word = { kind: 'w', text: 'Jesus', strong: 'G2424' } as const;
		expect(splitVerseLead([word, '? Danach'])).toEqual([[word, '?'], [' Danach']]);
	});
});

describe('tidySegmentSpacing', () => {
	it('removes the space that tagged-word markup leaves before punctuation', () => {
		// What Zefania produces: every tagged word ends with a space, including before a comma.
		const segments: VerseSegment[] = [
			{ kind: 'w', text: 'Christi', strong: 'G5547' },
			' , des ',
			{ kind: 'w', text: 'Sohnes', strong: 'G5207' },
			' .'
		];
		expect(segmentsToText(tidySegmentSpacing(segments))).toBe('Christi, des Sohnes.');
	});

	it('removes the space after an opening bracket', () => {
		expect(
			segmentsToText(tidySegmentSpacing(['( ', { kind: 'w', text: 'so', strong: 'G3779' }]))
		).toBe('(so');
	});

	it('never eats the single space that separates two words', () => {
		const segments: VerseSegment[] = [
			{ kind: 'w', text: 'schuf', strong: 'H1254' },
			' ',
			{ kind: 'w', text: 'Gott', strong: 'H430' }
		];
		expect(segmentsToText(tidySegmentSpacing(segments))).toBe('schuf Gott');
	});

	it('does not touch the words themselves', () => {
		const word = { kind: 'w', text: ' Gott ', strong: 'H430' } as const;
		expect(tidySegmentSpacing([word])[0]).toBe(word);
	});
});

describe('finalizeSegments', () => {
	it('trims the outer edges of a verse', () => {
		expect(finalizeSegments(['  Im Anfang', ' '])).toEqual(['Im Anfang']);
	});

	it('keeps interior separators', () => {
		expect(
			finalizeSegments([
				' ',
				{ kind: 'w', text: 'a', strong: 'G1' },
				' ',
				{ kind: 'w', text: 'b', strong: 'G2' },
				' '
			])
		).toEqual([
			{ kind: 'w', text: 'a', strong: 'G1' },
			' ',
			{ kind: 'w', text: 'b', strong: 'G2' }
		]);
	});
});

describe('countVerseWords', () => {
	it('counts plain runs and tagged words as separate words', () => {
		expect(
			countVerseWords(['Im ', { kind: 'w', text: 'Anfang', strong: 'H7225' }, ' schuf Gott.'])
		).toBe(4);
	});

	it('keeps punctuation glued with no separating space as part of the same word', () => {
		expect(countVerseWords([{ kind: 'w', text: 'Jesus', strong: 'G2424' }, '?'])).toBe(1);
	});

	it('splits an emphasis run into its own words', () => {
		expect(countVerseWords([{ kind: 'em', text: 'ist der Weg' }])).toBe(3);
	});

	it('excludes footnotes and treats a line break like whitespace', () => {
		expect(
			countVerseWords([
				'eins',
				{ kind: 'note', marker: '1', text: 'a note' },
				{ kind: 'br' },
				'zwei'
			])
		).toBe(2);
	});

	it('descends into words of Jesus, continuing the same count', () => {
		expect(countVerseWords(['Er sagte: ', { kind: 'wj', children: ['Ich bin ', 'der Weg'] }])).toBe(
			6
		);
	});
});

describe('highlightSegments', () => {
	it('colours only the words inside range, leaving the rest uncoloured', () => {
		const ranges: HighlightRange[] = [{ start: 1, end: 1, color: '#ff0' }];
		const cursor = initHighlightCursor();
		const chunks = highlightSegments(
			['Im ', { kind: 'w', text: 'Anfang', strong: 'H7225' }, ' schuf'],
			ranges,
			cursor
		);
		expect(chunks).toEqual([
			{ kind: 'text', text: 'Im', color: null },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'w', segment: { kind: 'w', text: 'Anfang', strong: 'H7225' }, color: '#ff0' },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'text', text: 'schuf', color: null }
		]);
	});

	it('splits a plain run at the word boundary instead of colouring the whole segment', () => {
		const ranges: HighlightRange[] = [{ start: 1, end: 1, color: '#ff0' }];
		const cursor = initHighlightCursor();
		const chunks = highlightSegments(['eins zwei drei'], ranges, cursor);
		expect(chunks).toEqual([
			{ kind: 'text', text: 'eins', color: null },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'text', text: 'zwei', color: '#ff0' },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'text', text: 'drei', color: null }
		]);
	});

	it('colours the whitespace between two adjacent words of the same highlight', () => {
		const ranges: HighlightRange[] = [{ start: 1, end: 2, color: '#ff0' }];
		const cursor = initHighlightCursor();
		const chunks = highlightSegments(['eins zwei drei vier'], ranges, cursor);
		expect(chunks).toEqual([
			{ kind: 'text', text: 'eins', color: null },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'text', text: 'zwei', color: '#ff0' },
			{ kind: 'text', text: ' ', color: '#ff0' },
			{ kind: 'text', text: 'drei', color: '#ff0' },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'text', text: 'vier', color: null }
		]);
	});

	it('does not bridge whitespace between two differently-coloured highlights', () => {
		const ranges: HighlightRange[] = [
			{ start: 0, end: 0, color: '#ff0' },
			{ start: 1, end: 1, color: '#0f0' }
		];
		const cursor = initHighlightCursor();
		const chunks = highlightSegments(['eins zwei'], ranges, cursor);
		expect(chunks).toEqual([
			{ kind: 'text', text: 'eins', color: '#ff0' },
			{ kind: 'text', text: ' ', color: null },
			{ kind: 'text', text: 'zwei', color: '#0f0' }
		]);
	});

	it('keeps a word and its glued punctuation the same colour', () => {
		const ranges: HighlightRange[] = [{ start: 0, end: 0, color: '#ff0' }];
		const cursor = initHighlightCursor();
		const chunks = highlightSegments(
			[{ kind: 'w', text: 'Jesus', strong: 'G2424' }, '?'],
			ranges,
			cursor
		);
		expect(chunks).toEqual([
			{ kind: 'w', segment: { kind: 'w', text: 'Jesus', strong: 'G2424' }, color: '#ff0' },
			{ kind: 'text', text: '?', color: '#ff0' }
		]);
	});

	it('continues the word index across a wordOffset, for a verse split into lead and remainder', () => {
		const ranges: HighlightRange[] = [{ start: 1, end: 1, color: '#ff0' }];
		const cursor = initHighlightCursor(1);
		const chunks = highlightSegments(['schuf'], ranges, cursor);
		expect(chunks).toEqual([{ kind: 'text', text: 'schuf', color: '#ff0' }]);
	});

	it('never colours a footnote or a line break', () => {
		const ranges: HighlightRange[] = [{ start: 0, end: 5, color: '#ff0' }];
		const cursor = initHighlightCursor();
		const chunks = highlightSegments(
			['eins', { kind: 'note', marker: '1', text: 'x' }, { kind: 'br' }, 'zwei'],
			ranges,
			cursor
		);
		expect(chunks).toEqual([
			{ kind: 'text', text: 'eins', color: '#ff0' },
			{ kind: 'note', segment: { kind: 'note', marker: '1', text: 'x' } },
			{ kind: 'br' },
			{ kind: 'text', text: 'zwei', color: '#ff0' }
		]);
	});
});

describe('wordRangeForCharSpan', () => {
	const text = 'Im Anfang schuf Gott Himmel und Erde.';

	it('maps a single selected word to its own index', () => {
		const start = text.indexOf('Anfang');
		expect(wordRangeForCharSpan(text, start, start + 'Anfang'.length)).toEqual({
			start: 1,
			end: 1
		});
	});

	it('expands to every word the character span touches', () => {
		const start = text.indexOf('schuf');
		const end = text.indexOf('Himmel') + 'Himmel'.length;
		expect(wordRangeForCharSpan(text, start, end)).toEqual({ start: 2, end: 4 });
	});

	it('returns null for a span that only covers whitespace', () => {
		const start = text.indexOf('Im') + 'Im'.length;
		expect(wordRangeForCharSpan(text, start, start + 1)).toBeNull();
	});

	it('covers the whole verse when the span is the full text', () => {
		expect(wordRangeForCharSpan(text, 0, text.length)).toEqual({
			start: 0,
			end: countVerseWords([text]) - 1
		});
	});
});

describe('wordsFromSegments', () => {
	it('numbers words in reading order and ignores plain text', () => {
		expect(
			wordsFromSegments([
				'Im ',
				{ kind: 'w', text: 'Anfang', strong: 'H7225' },
				' ',
				{ kind: 'w', text: 'schuf', strong: 'H1254', morph: 'V-QAL' }
			])
		).toEqual([
			{ position: 0, text: 'Anfang', strong: 'H7225' },
			{ position: 1, text: 'schuf', strong: 'H1254', morph: 'V-QAL' }
		]);
	});

	it('emits one row per number for a word carrying several, sharing the position', () => {
		expect(
			wordsFromSegments([
				{ kind: 'w', text: 'sechshundert', strong: 'H8337', strongs: ['H8337', 'H3967'] },
				' ',
				{ kind: 'w', text: 'Mann', strong: 'H376' }
			])
		).toEqual([
			{ position: 0, text: 'sechshundert', strong: 'H8337' },
			{ position: 0, text: 'sechshundert', strong: 'H3967' },
			{ position: 1, text: 'Mann', strong: 'H376' }
		]);
	});

	it('descends into words of Jesus', () => {
		expect(
			wordsFromSegments([{ kind: 'wj', children: [{ kind: 'w', text: 'εγω', strong: 'G1473' }] }])
		).toEqual([{ position: 0, text: 'εγω', strong: 'G1473' }]);
	});
});
