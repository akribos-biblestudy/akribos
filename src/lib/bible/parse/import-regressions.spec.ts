import { describe, expect, it } from 'vitest';
import { segmentsToText } from '../segments.ts';
import { detectFormat } from './detect.ts';
import type { ParsedVerse, ParseStream } from './types.ts';
import { parseUsfm } from './usfm.ts';
import { parseUsx } from './usx.ts';
import { parseLine } from './vpl.ts';

async function collect(stream: ParseStream) {
	const verses: ParsedVerse[] = [];
	for await (const event of stream) if (event.type === 'verse') verses.push(event.verse);
	return verses;
}

describe('VPL reference and punctuation boundaries', () => {
	it.each([
		'Joh 3:16 Denn Gott liebt, und er gibt; seinen Sohn.',
		'Joh 3,16 Denn Gott liebt, und er gibt; seinen Sohn.',
		'Joh 3,16|Denn Gott liebt, und er gibt; seinen Sohn.',
		'Joh 3:16\tDenn Gott liebt, und er gibt; seinen Sohn.',
		'"Joh 3:16","Denn Gott liebt, und er gibt; seinen Sohn."',
		'43\t3\t16\tDenn Gott liebt, und er gibt; seinen Sohn.'
	])('preserves the complete text: %s', (line) => {
		expect(parseLine(line)).toMatchObject({
			book: 43,
			chapter: 3,
			verse: 16,
			text: 'Denn Gott liebt, und er gibt; seinen Sohn.'
		});
	});

	it('detects prose with German verse commas and punctuation', () => {
		expect(
			detectFormat('Joh 3,16 Denn Gott liebt, und gibt.\nJoh 3,17 Er sandte; seinen Sohn.')
		).toMatchObject({ format: 'vpl' });
	});
});

describe('USFM structural boundaries', () => {
	it('flushes the previous book and clears an unknown book instead of reusing its predecessor', async () => {
		const verses = await collect(
			parseUsfm(String.raw`\id GEN
\c 50
\v 26 Ende Genesis.
\id ZZZ
\c 1
\v 1 Nicht dem vorherigen Buch zuordnen.
\id EXO
\c 1
\v 1 Anfang Exodus.`)
		);
		expect(verses.map(({ book, chapter, verse }) => [book, chapter, verse])).toEqual([
			[1, 50, 26],
			[2, 1, 1]
		]);
		expect(verses.map(({ segments }) => segmentsToText(segments))).toEqual([
			'Ende Genesis.',
			'Anfang Exodus.'
		]);
	});

	it('assigns headings to the next verse and recognizes several markers on one line', async () => {
		const verses = await collect(
			parseUsfm(String.raw`\id JHN
\c 3
\p \v 15 Alter Abschnitt. \s1 Neuer Abschnitt
\q1 \v 16 Denn \w Gott|strong="G2316"\w* liebt. \v 17 Er sandte. \p \v 18 Wer glaubt.`)
		);
		expect(verses.map((verse) => verse.verse)).toEqual([15, 16, 17, 18]);
		expect(verses.map((verse) => verse.heading)).toEqual([
			undefined,
			'Neuer Abschnitt',
			undefined,
			undefined
		]);
		expect(verses.map(({ segments }) => segmentsToText(segments))).toEqual([
			'Alter Abschnitt.',
			'Denn Gott liebt.',
			'Er sandte.',
			'Wer glaubt.'
		]);
		expect(verses[1]?.segments).toContainEqual({ kind: 'w', text: 'Gott', strong: 'G2316' });
	});
});

it.each(['', '<verse eid="JHN 3:15"/>'])(
	'USX headings belong to the following verse (end marker: %s)',
	async (end) => {
		const verses = await collect(
			parseUsx(
				`<usx version="2.5"><book code="JHN"/><chapter number="3"/><para style="p"><verse number="15"/>Alter Abschnitt.${end}</para><para style="s1">Neue Überschrift</para><para style="p"><verse number="16"/>Neuer Abschnitt.</para></usx>`
			)
		);
		expect(verses.map((verse) => [verse.verse, verse.heading])).toEqual([
			[15, undefined],
			[16, 'Neue Überschrift']
		]);
		expect(verses.map(({ segments }) => segmentsToText(segments))).toEqual([
			'Alter Abschnitt.',
			'Neuer Abschnitt.'
		]);
	}
);
