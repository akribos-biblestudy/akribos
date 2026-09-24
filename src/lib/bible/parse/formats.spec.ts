import { describe, expect, it } from 'vitest';
import { segmentsToText } from '../segments.ts';
import { detectFormat } from './detect.ts';
import { parseOsis, parseOsisId } from './osis.ts';
import { parseUsfm } from './usfm.ts';
import { parseUsfx, parseUsx } from './usx.ts';
import { parseVpl } from './vpl.ts';
import { parseTsk } from './tsk.ts';
import { parseTsp } from './tsp.ts';
import {
	parseCommentaryCsv,
	parseCommentaryThml,
	parseZefaniaCommentary,
	sanitizeHtml
} from './commentary.ts';
import type {
	ParsedCommentaryEntry,
	ParsedCrossReference,
	ParsedVerse,
	ParsedWordAnnotation,
	ParseEvent,
	ParseStream,
	ResourceMetadata
} from './types.ts';

async function drain(stream: ParseStream) {
	const verses: ParsedVerse[] = [];
	const warnings: string[] = [];
	const crossReferences: ParsedCrossReference[] = [];
	const commentary: ParsedCommentaryEntry[] = [];
	const annotations: ParsedWordAnnotation[] = [];
	let metadata: ResourceMetadata | undefined;

	for await (const event of stream as AsyncGenerator<ParseEvent>) {
		switch (event.type) {
			case 'verse':
				verses.push(event.verse);
				break;
			case 'warning':
				warnings.push(event.message);
				break;
			case 'metadata':
				metadata = event.metadata;
				break;
			case 'crossReference':
				crossReferences.push(event.crossReference);
				break;
			case 'commentaryEntry':
				commentary.push(event.entry);
				break;
			case 'wordAnnotation':
				annotations.push(event.annotation);
				break;
			default:
				break;
		}
	}

	return { verses, warnings, metadata, crossReferences, commentary, annotations };
}

const text = (verse: ParsedVerse | undefined) =>
	verse ? segmentsToText(verse.segments) : undefined;

describe('OSIS', () => {
	it('parses the container style', async () => {
		const { verses, metadata } = await drain(
			parseOsis(`<osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace">
				<osisText osisIDWork="ELB" xml:lang="de">
					<header><work osisWork="ELB"><title>Elberfelder</title><rights>Public Domain</rights></work></header>
					<div type="book" osisID="Gen">
						<chapter osisID="Gen.1">
							<verse osisID="Gen.1.1">Im Anfang schuf <w lemma="strong:H430">Gott</w> die Himmel.</verse>
						</chapter>
					</div>
				</osisText>
			</osis>`)
		);

		expect(metadata).toMatchObject({
			name: 'Elberfelder',
			language: 'de',
			licenseHtml: 'Public Domain'
		});
		expect(verses).toHaveLength(1);
		expect(verses[0]).toMatchObject({ book: 1, chapter: 1, verse: 1 });
		expect(text(verses[0])).toBe('Im Anfang schuf Gott die Himmel.');
		expect(verses[0]?.segments).toContainEqual({ kind: 'w', text: 'Gott', strong: 'H430' });
	});

	it('parses the milestone style, where text is a sibling of the marker', async () => {
		// The style the Django importer could not read (add_bible.py on the main branch).
		const { verses } = await drain(
			parseOsis(`<osis><osisText osisIDWork="X" xml:lang="de"><div type="book" osisID="John">
				<chapter sID="John.3" osisID="John.3"/>
				<verse sID="John.3.16" osisID="John.3.16"/>Denn also hat Gott die Welt geliebt<verse eID="John.3.16"/>
				<verse sID="John.3.17" osisID="John.3.17"/>Denn Gott hat seinen Sohn nicht gesandt<verse eID="John.3.17"/>
				<chapter eID="John.3"/></div></osisText></osis>`)
		);

		expect(verses.map((verse) => verse.verse)).toEqual([16, 17]);
		expect(text(verses[0])).toBe('Denn also hat Gott die Welt geliebt');
		expect(text(verses[1])).toBe('Denn Gott hat seinen Sohn nicht gesandt');
	});

	it('keeps morphology and multiple Strong numbers from a w element', async () => {
		const { verses } = await drain(
			parseOsis(`<osis><osisText osisIDWork="X" xml:lang="grc"><div type="book" osisID="Matt">
				<chapter osisID="Matt.1"><verse osisID="Matt.1.1">
					<w lemma="strong:G976" morph="robinson:N-NSF">βιβλος</w>
					<w lemma="strong:G1078 strong:G2424">γενεσεως</w>
				</verse></chapter></div></osisText></osis>`)
		);

		expect(verses[0]?.segments[0]).toEqual({
			kind: 'w',
			text: 'βιβλος',
			strong: 'G976',
			morph: 'N-NSF'
		});
		expect(verses[0]?.segments[2]).toMatchObject({ strong: 'G1078', strongs: ['G1078', 'G2424'] });
	});

	it('keeps notes out of the verse text and takes headings from titles', async () => {
		const { verses } = await drain(
			parseOsis(`<osis><osisText osisIDWork="X" xml:lang="de"><div type="book" osisID="Ps">
				<chapter osisID="Ps.23"><title>Der gute Hirte</title>
				<verse osisID="Ps.23.1">Der HERR ist mein Hirte<note type="study">Hebr. roi</note>.</verse>
			</chapter></div></osisText></osis>`)
		);

		expect(verses[0]?.heading).toBe('Der gute Hirte');
		expect(text(verses[0])).toBe('Der HERR ist mein Hirte.');
		expect(verses[0]?.segments).toContainEqual({ kind: 'note', marker: '', text: 'Hebr. roi' });
	});

	it('drops cross-reference apparatus', async () => {
		const { verses } = await drain(
			parseOsis(`<osis><osisText osisIDWork="X" xml:lang="de"><div type="book" osisID="Gen">
				<chapter osisID="Gen.1"><verse osisID="Gen.1.1">Im Anfang<note type="crossReference">Joh 1,1</note> schuf Gott.</verse>
			</chapter></div></osisText></osis>`)
		);

		expect(text(verses[0])).toBe('Im Anfang schuf Gott.');
	});

	it('recovers footnotes flattened at the end of older OSIS verses', async () => {
		const { verses } = await drain(
			parseOsis(`<osis><osisText osisIDWork="X" xml:lang="de"><div type="book" osisID="Rom">
				<chapter osisID="Rom.6">
					<verse osisID="Rom.6.11">Leben in Christus.   (1) V. 4 8</verse>
					<verse osisID="Rom.6.12">Die Sünde herrsche nicht.   (a) 1Mo 4:7</verse>
					<verse osisID="Rom.6.13">Gebt euch Gott hin.   (1) V. 19 (a) Rö 12:1; Eph 2:5</verse>
				</chapter></div></osisText></osis>`)
		);

		expect(text(verses[0])).toBe('Leben in Christus.');
		expect(verses[0]?.segments).toContainEqual({ kind: 'note', marker: '1', text: 'V. 4 8' });
		expect(verses[1]?.segments).toContainEqual({ kind: 'note', marker: 'a', text: '1Mo 4:7' });
		expect(verses[2]?.segments).toEqual([
			'Gebt euch Gott hin.',
			{ kind: 'note', marker: '1', text: 'V. 19' },
			{ kind: 'note', marker: 'a', text: 'Rö 12:1; Eph 2:5' }
		]);
	});
});

describe('parseOsisId', () => {
	it('reads plain, ranged and sub-verse ids', () => {
		expect(parseOsisId('Gen.1.1')).toEqual({ book: 1, chapter: 1, verse: 1 });
		expect(parseOsisId('John.3.16')).toEqual({ book: 43, chapter: 3, verse: 16 });
		expect(parseOsisId('Gen.1.1!a')).toEqual({ book: 1, chapter: 1, verse: 1 });
		expect(parseOsisId('Ps.16.16-17')).toEqual({ book: 19, chapter: 16, verse: 16, verseEnd: 17 });
	});

	it('reads the non-breaking hyphen the Genfer files use for ranges', () => {
		// U+2011, which the old importer detected by looking for the string "8209" in a number.
		expect(parseOsisId('Ps.16.16‑17')).toEqual({
			book: 19,
			chapter: 16,
			verse: 16,
			verseEnd: 17
		});
	});

	it('rejects unusable ids', () => {
		expect(parseOsisId('Gen.1')).toBeUndefined();
		expect(parseOsisId('Nope.1.1')).toBeUndefined();
		expect(parseOsisId(undefined)).toBeUndefined();
	});
});

describe('USFM', () => {
	it('parses markers, word attributes and merged verse ranges', async () => {
		const { verses, metadata } = await drain(
			parseUsfm(`\\id GEN
\\h 1. Mose
\\c 1
\\s Die Schöpfung
\\p
\\v 1 Im Anfang \\w schuf|strong="H1254"\\w* \\w Gott|strong="H430"\\w* Himmel und Erde.
\\v 2-3 Und die Erde war wüst und leer.
`)
		);

		expect(metadata?.name).toBe('1. Mose');
		expect(verses).toHaveLength(2);
		expect(verses[0]).toMatchObject({ book: 1, chapter: 1, verse: 1, heading: 'Die Schöpfung' });
		expect(text(verses[0])).toBe('Im Anfang schuf Gott Himmel und Erde.');
		expect(verses[0]?.segments).toContainEqual({ kind: 'w', text: 'schuf', strong: 'H1254' });
		expect(verses[1]).toMatchObject({ verse: 2, verseEnd: 3 });
	});

	it('removes footnotes and cross references', async () => {
		const { verses } = await drain(
			parseUsfm(`\\id JHN
\\c 3
\\v 16 Denn also hat Gott\\f + \\fr 3:16 \\ft Oder: so sehr\\f* die Welt geliebt.\\x - \\xt 1Joh 4,9\\x*
`)
		);

		expect(text(verses[0])).toBe('Denn also hat Gott die Welt geliebt.');
	});

	it('marks translator additions as emphasis and words of Jesus as such', async () => {
		const { verses } = await drain(
			parseUsfm(`\\id JHN
\\c 14
\\v 6 \\wj Ich bin \\add der\\add* Weg\\wj*
`)
		);

		const segments = verses[0]?.segments ?? [];
		expect(segments[0]).toMatchObject({ kind: 'wj' });
		expect(text(verses[0])).toBe('Ich bin der Weg');
	});

	it('continues a verse across following lines', async () => {
		const { verses } = await drain(
			parseUsfm(`\\id PSA
\\c 23
\\v 1 Der HERR ist mein Hirte,
\\q1 mir wird nichts mangeln.
`)
		);

		expect(text(verses[0])).toBe('Der HERR ist mein Hirte, mir wird nichts mangeln.');
	});

	it('reports an unknown book code instead of guessing', async () => {
		const { warnings } = await drain(parseUsfm(`\\id ZZZ\n\\c 1\n\\v 1 Text\n`));
		expect(warnings.join(' ')).toContain('ZZZ');
	});
});

describe('USX and USFX', () => {
	it('parses USX milestone verses inside paragraphs', async () => {
		const { verses } = await drain(
			parseUsx(`<usx version="3.0"><book code="GEN"/><para style="h">1. Mose</para>
				<chapter number="1" sid="GEN 1"/>
				<para style="p"><verse number="1" sid="GEN 1:1"/>Im Anfang schuf <char style="w" strong="H430">Gott</char> die Erde.<verse eid="GEN 1:1"/></para>
			</usx>`)
		);

		expect(verses[0]).toMatchObject({ book: 1, chapter: 1, verse: 1 });
		expect(text(verses[0])).toBe('Im Anfang schuf Gott die Erde.');
		expect(verses[0]?.segments).toContainEqual({ kind: 'w', text: 'Gott', strong: 'H430' });
	});

	it('excludes USX notes from searchable verse text', async () => {
		const { verses } = await drain(
			parseUsx(`<usx><book code="JHN"/><chapter number="3"/>
				<para style="p"><verse number="16"/>Denn also hat Gott<note caller="+" style="f"><char style="ft">Oder: so sehr</char></note> die Welt geliebt.</para>
			</usx>`)
		);

		expect(text(verses[0])).toBe('Denn also hat Gott die Welt geliebt.');
	});

	it('parses USFX with end-of-verse milestones', async () => {
		const { verses } = await drain(
			parseUsfx(`<usfx><book id="JHN"><h>Johannes</h><c id="3"/>
				<p><v id="16"/>Denn also hat Gott die Welt geliebt<ve/><v id="17"/>Denn Gott sandte<ve/></p>
			</book></usfx>`)
		);

		expect(verses.map((verse) => verse.verse)).toEqual([16, 17]);
		expect(text(verses[1])).toBe('Denn Gott sandte');
	});
});

describe('verse per line', () => {
	it('reads a reference and text, in several layouts', async () => {
		const { verses } = await drain(
			parseVpl(`# a comment
Gen 1:1\tIm Anfang schuf Gott Himmel und Erde.
1.Mose 1,2|Und die Erde war wüst und leer.
"Joh 3:16","Denn also hat Gott die Welt geliebt."
43\t3\t17\tDenn Gott hat seinen Sohn nicht gesandt.
`)
		);

		expect(verses).toHaveLength(4);
		expect(verses[0]).toMatchObject({ book: 1, chapter: 1, verse: 1 });
		expect(text(verses[1])).toBe('Und die Erde war wüst und leer.');
		expect(verses[2]).toMatchObject({ book: 43, chapter: 3, verse: 16 });
		expect(verses[3]).toMatchObject({ book: 43, chapter: 3, verse: 17 });
		expect(text(verses[3])).toBe('Denn Gott hat seinen Sohn nicht gesandt.');
	});

	it('reports lines it cannot read', async () => {
		const { verses, warnings } = await drain(parseVpl(`Not a verse at all\nGen 1:1\tIm Anfang\n`));
		expect(verses).toHaveLength(1);
		expect(warnings).toHaveLength(1);
	});
});

describe('cross references', () => {
	it('reads reference pairs with an optional score', async () => {
		const { crossReferences } = await drain(
			parseTsk(`Gen 1:1\tJoh 1:1\t23
Gen 1:1\tHeb 11:3
"1.Mose 1,1","Kol 1,16-17",8
`)
		);

		expect(crossReferences).toEqual([
			{
				fromBook: 1,
				fromChapter: 1,
				fromVerse: 1,
				toBook: 43,
				toChapter: 1,
				toVerse: 1,
				toVerseEnd: 1,
				votes: 23
			},
			{
				fromBook: 1,
				fromChapter: 1,
				fromVerse: 1,
				toBook: 58,
				toChapter: 11,
				toVerse: 3,
				toVerseEnd: 3,
				votes: 0
			},
			{
				fromBook: 1,
				fromChapter: 1,
				fromVerse: 1,
				toBook: 51,
				toChapter: 1,
				toVerse: 16,
				toVerseEnd: 17,
				votes: 8
			}
		]);
	});
});

describe('morphology overlay', () => {
	it('parses TSP lines into annotations with Unicode lemmas', async () => {
		// Copied from data/books/01_MT.TSP.
		const { annotations } = await drain(
			parseTsp(`MT 1:1.1 C *BI/BLOS *BI/BLOS N-NSF 976 BI/BLOS ! BI/BLOS
MT 1:2.2 . E)GE/NNHSEN E)GE/NNHSEN V-AAI-3S 1080 GENNA/W ! GENNA/W
`)
		);

		expect(annotations).toEqual([
			{
				book: 40,
				chapter: 1,
				verse: 1,
				position: 1,
				strong: 'G976',
				morph: 'N-NSF',
				lemma: 'βίβλος',
				surface: 'Βίβλος'
			},
			{
				book: 40,
				chapter: 1,
				verse: 2,
				position: 2,
				strong: 'G1080',
				morph: 'V-AAI-3S',
				lemma: 'γεννάω',
				surface: 'ἐγέννησεν'
			}
		]);
	});

	it('maps the Online Bible book codes these files use', async () => {
		const { annotations, warnings } = await drain(
			parseTsp(`RE 22:21.1 C H( H( T-NSF 3588 O( ! O(\nZZ 1:1.1 C A A N-NSF 1 A ! A\n`)
		);

		expect(annotations[0]).toMatchObject({ book: 66, chapter: 22, verse: 21 });
		expect(warnings.join(' ')).toContain('ZZ');
	});
});

describe('commentary', () => {
	it('reads a reference and body per row', async () => {
		const { commentary } = await drain(
			parseCommentaryCsv(`"Joh 3,16","Der bekannteste Vers. **Also** meint: auf diese Weise."
Röm 8,28-30\tNicht alles ist gut, aber Gott wirkt in allem.
`)
		);

		expect(commentary[0]).toMatchObject({
			book: 43,
			chapter: 3,
			verseStart: 16,
			bodyHtml: 'Der bekannteste Vers. <strong>Also</strong> meint: auf diese Weise.'
		});
		expect(commentary[1]).toMatchObject({ book: 45, chapter: 8, verseStart: 28, verseEnd: 30 });
	});

	it('reads a per-section heading from a ThML section div', async () => {
		const { commentary, metadata } = await drain(
			parseCommentaryThml(`<ThML>
				<ThML.head><title>Ausgewählte Kommentare</title></ThML.head>
				<ThML.body>
					<div class="Section" title="Kommentar zu Johannes 3:16">
						<scripRef passage="John 3:16"/>Der bekannteste Vers der Bibel.
					</div>
					<div class="Section" title="Kommentar zu Römer 8:28-30">
						<scripCom passage="Romans 8:28-30"/>Alles wirkt zum Guten.
					</div>
				</ThML.body>
			</ThML>`)
		);

		expect(metadata).toMatchObject({ name: 'Ausgewählte Kommentare' });
		expect(commentary).toMatchObject([
			{
				book: 43,
				chapter: 3,
				verseStart: 16,
				title: 'Kommentar zu Johannes 3:16',
				bodyHtml: 'Der bekannteste Vers der Bibel.'
			},
			{
				book: 45,
				chapter: 8,
				verseStart: 28,
				verseEnd: 30,
				title: 'Kommentar zu Römer 8:28-30',
				bodyHtml: 'Alles wirkt zum Guten.'
			}
		]);
	});
});

describe('sanitizeHtml', () => {
	it('keeps simple formatting', () => {
		expect(sanitizeHtml('<p>Ein <em>Wort</em> und <strong>noch eins</strong></p>')).toBe(
			'<p>Ein <em>Wort</em> und <strong>noch eins</strong></p>'
		);
	});

	it('removes scripts, event handlers and every attribute', () => {
		expect(sanitizeHtml('<script>alert(1)</script>Text')).toBe('alert(1) Text');
		expect(sanitizeHtml('<p onclick="alert(1)">Text</p>')).toBe('<p>Text</p>');
		expect(sanitizeHtml('<a href="javascript:alert(1)">Klick</a>')).toBe('Klick');
		expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('');
	});

	it('escapes text that looks like markup', () => {
		expect(sanitizeHtml('5 &lt; 7 &amp; 8 &gt; 6')).toBe('5 &lt; 7 &amp; 8 &gt; 6');
	});

	it('reads Zefania dictionary commentaries with numeric scopes', async () => {
		const { commentary, metadata, warnings } = await drain(
			parseZefaniaCommentary(`<?xml version="1.0"?>
				<dictionary type="x-commentary">
					<INFORMATION>
						<title>Carl Heinrich Riegers Kommentar</title>
						<identifier>RIEG</identifier>
						<language>GER</language>
					</INFORMATION>
					<item id="Psalms 1:1" target="19;1;1">
						<reflink mscope="19;1;1-6"/>
						<description>Der erste Psalm.</description>
						<description>Ausführliche &amp; sichere Erklärung.</description>
					</item>
				</dictionary>`)
		);

		expect(warnings).toEqual([]);
		expect(metadata).toMatchObject({
			id: 'RIEG',
			name: 'Carl Heinrich Riegers Kommentar',
			language: 'de'
		});
		expect(commentary).toEqual([
			{
				book: 19,
				chapter: 1,
				verseStart: 1,
				verseEnd: 6,
				bodyHtml: '<p>Der erste Psalm.</p><p>Ausführliche &amp; sichere Erklärung.</p>'
			}
		]);
	});
});

describe('detectFormat', () => {
	const cases: [label: string, sample: string, format: string][] = [
		['Zefania', '<?xml version="1.0"?><XMLBIBLE biblename="X">', 'zefania'],
		[
			'Zefania commentary',
			'<!-- Zefania XML --><dictionary type="x-commentary"><item target="19;1;1"><description>Text</description></item></dictionary>',
			'zefania-commentary'
		],
		[
			'OSIS',
			'<?xml version="1.0"?><osis xmlns="http://www.bibletechnologies.net/2003/OSIS/namespace">',
			'osis'
		],
		['USX', '<usx version="3.0"><book code="GEN"/>', 'usx'],
		['USFX', '<usfx><book id="GEN">', 'usfx'],
		["Strong's dictionary", '<strongsdictionary><prologue>', 'strongs-xml'],
		['USFM', '\\id GEN\n\\c 1\n\\v 1 Im Anfang', 'usfm'],
		['TSP', 'MT 1:1.1 C *BI/BLOS *BI/BLOS N-NSF 976 BI/BLOS ! BI/BLOS', 'tsp'],
		['cross references', 'Gen 1:1\tJoh 1:1\t23\nGen 1:2\tPs 33:6\t12\n', 'tsk'],
		['verse per line', 'Gen 1:1\tIm Anfang schuf Gott\nGen 1:2\tUnd die Erde war\n', 'vpl']
	];

	it.each(cases)('recognises %s', (_label, sample, format) => {
		expect(detectFormat(sample)?.format).toBe(format);
	});

	it('returns null for something it does not know', () => {
		expect(detectFormat('just some prose, nothing structured here')).toBeNull();
	});
});
