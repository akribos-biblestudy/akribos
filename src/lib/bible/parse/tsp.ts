/**
 * Parser for the Robinson/Tischendorf morphology files in `data/books/*.TSP`.
 *
 * One line per word of the Greek New Testament, whitespace separated:
 *
 *   MT 1:1.1 C *BI/BLOS *BI/BLOS N-NSF 976 BI/BLOS ! BI/BLOS
 *   │  │     │ │        │        │      │   │        │
 *   │  │     │ │        │        │      │   │        └ lemma, second analysis
 *   │  │     │ │        │        │      │   └ lemma in Beta Code
 *   │  │     │ │        │        │      └ Strong's number
 *   │  │     │ │        │        └ Robinson morphology code
 *   │  │     │ │        └ normalised form
 *   │  │     │ └ inflected form in Beta Code
 *   │  │     └ punctuation marker
 *   │  └ chapter:verse.word, the word index being 1-based
 *   └ book code in the OLB abbreviation scheme
 *
 * This is an overlay rather than a text: it annotates an existing Greek resource with the dictionary
 * form of each word, which is what lets the word study show "ἀγαπάω" for an inflected ἠγάπησεν.
 * The morphology code and Strong's number are already present in the Textus Receptus source, so they
 * are used here only to align the two.
 */

import { bookByOsisId } from '../books.ts';
import { betaCodeToGreek } from '../betacode.ts';
import { strongIdFromSource } from '../strong.ts';
import type { ParseStream, SourceInput } from './types.ts';
import { readLines } from './usfm.ts';

/**
 * Book codes used by these files, which follow the Online Bible abbreviations rather than USFM or
 * OSIS. Spelled out because the mismatch is exactly the kind of thing that silently drops a book.
 */
const TSP_BOOK_CODES: Record<string, string> = {
	MT: 'Matt',
	MR: 'Mark',
	LU: 'Luke',
	JOH: 'John',
	AC: 'Acts',
	RO: 'Rom',
	'1CO': '1Cor',
	'2CO': '2Cor',
	GA: 'Gal',
	EPH: 'Eph',
	PHP: 'Phil',
	COL: 'Col',
	'1TH': '1Thess',
	'2TH': '2Thess',
	'1TI': '1Tim',
	'2TI': '2Tim',
	TIT: 'Titus',
	PHM: 'Phlm',
	HEB: 'Heb',
	JAS: 'Jas',
	'1PE': '1Pet',
	'2PE': '2Pet',
	'1JO': '1John',
	'2JO': '2John',
	'3JO': '3John',
	JUDE: 'Jude',
	RE: 'Rev'
};

export function bookFromTspCode(code: string): number | undefined {
	const osisId = TSP_BOOK_CODES[code.trim().toUpperCase()];
	return osisId ? bookByOsisId(osisId)?.id : undefined;
}

export async function* parseTsp(input: SourceInput): ParseStream {
	let annotations = 0;
	let unknownBooks = 0;
	let malformed = 0;

	yield {
		type: 'metadata',
		metadata: {
			id: 'ROBINSON_MORPH',
			name: 'Robinson Morphology (Tischendorf)',
			abbrev: 'Robinson',
			language: 'grc'
		}
	};

	for await (const rawLine of readLines(input)) {
		const line = rawLine.trim();
		if (!line) continue;

		const fields = line.split(/\s+/);
		if (fields.length < 8) {
			malformed += 1;
			if (malformed <= 5) {
				yield {
					type: 'warning',
					message: `skipped a malformed morphology line: ${line.slice(0, 60)}`
				};
			}
			continue;
		}

		const book = bookFromTspCode(fields[0]!);
		if (book === undefined) {
			unknownBooks += 1;
			if (unknownBooks <= 3) {
				yield { type: 'warning', message: `unknown morphology book code "${fields[0]}"` };
			}
			continue;
		}

		// "1:1.1" — chapter, verse and the 1-based word index.
		const reference = /^(\d+):(\d+)\.(\d+)$/.exec(fields[1]!);
		if (!reference) {
			malformed += 1;
			continue;
		}

		const strong = strongIdFromSource(fields[6] ?? '', book);
		if (!strong) {
			malformed += 1;
			continue;
		}

		annotations += 1;
		yield {
			type: 'wordAnnotation',
			annotation: {
				book,
				chapter: Number.parseInt(reference[1]!, 10),
				verse: Number.parseInt(reference[2]!, 10),
				position: Number.parseInt(reference[3]!, 10),
				strong,
				morph: fields[5]!.toUpperCase(),
				lemma: betaCodeToGreek(fields[7]!),
				surface: betaCodeToGreek(fields[3]!)
			}
		};

		if (annotations % 2000 === 0) yield { type: 'progress', done: annotations };
	}

	if (malformed > 5) {
		yield { type: 'warning', message: `${malformed} morphology lines in total could not be read` };
	}
	yield { type: 'progress', done: annotations, total: annotations };
}
