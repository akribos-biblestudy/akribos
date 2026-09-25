import { describe, expect, it } from 'vitest';
import { segmentsToText, wordsFromSegments } from '../segments.ts';
import { isStrongAssignmentNote, strongAssignmentNotes } from '../strong-assignment.ts';
import type { ParseEvent } from './types.ts';
import { parseUsfx, parseUsx } from './usx.ts';

async function parse(xml: string) {
	const events: ParseEvent[] = [];
	for await (const event of parseUsx(xml)) events.push(event);
	return {
		verses: events.filter((event) => event.type === 'verse').map((event) => event.verse),
		warnings: events.filter((event) => event.type === 'warning')
	};
}
const source = (body: string) =>
	`<usx version="3.0"><book code="JHN"/><chapter number="3"/>${body}<chapter eid="JHN 3"/></usx>`;

describe('USX publisher exports', () => {
	it('preserves unreviewed Strong words without changing text, word positions or confirmed words', async () => {
		const { verses, warnings } = await parse(
			source(
				'<para style="p"><verse number="1"/><char style="w" strong="G25" x-akribos-status="unreviewed"> Probe </char><char style="w" strong="G25" x-akribos-status="confirmed">Probe</char> <char style="w" strong="G25">Probe</char> <char style="w" strong="G25 G3056" x-akribos-status=" UNREVIEWED ">Ende</char>.<verse eid="JHN 3:1"/></para>'
			)
		);
		const segments = verses[0]!.segments;
		expect(warnings).toEqual([]);
		expect(segmentsToText(segments)).toBe('Probe Probe Probe Ende.');
		expect(wordsFromSegments(segments).map(({ position, strong }) => [position, strong])).toEqual([
			[0, 'G25'],
			[1, 'G25'],
			[2, 'G25'],
			[3, 'G25'],
			[3, 'G3056']
		]);
		expect(strongAssignmentNotes(segments).map(({ word }) => word.text)).toEqual(['Probe', 'Ende']);
		expect(segments.filter(isStrongAssignmentNote)).toHaveLength(2);
	});

	it('does not duplicate an existing assignment note and preserves ordinary source notes', async () => {
		const { verses } = await parse(
			source(
				'<para style="p"><verse number="1"/><char style="w" strong="G25" x-akribos-status="unreviewed">Probe</char> <note style="f" caller="+"><char style="ft"> Automatische Wortzuordnung;\n fachlich noch nicht bestätigt. </char></note><char style="w" strong="G3056" x-akribos-status="unreviewed">bleibt</char><note style="f" caller="a"><char style="ft">Normale Quellenanmerkung.</char></note>.<verse eid="JHN 3:1"/></para>'
			)
		);
		const segments = verses[0]!.segments;
		expect(segmentsToText(segments)).toBe('Probe bleibt.');
		expect(segments.filter(isStrongAssignmentNote)).toHaveLength(2);
		expect(strongAssignmentNotes(segments).map(({ word }) => word.text)).toEqual([
			'Probe',
			'bleibt'
		]);
		expect(segments).toContainEqual({
			kind: 'note',
			marker: 'a',
			text: 'Normale Quellenanmerkung.'
		});
	});

	it('does not create orphan warnings from unusable Strong values or note and heading contents', async () => {
		const { verses } = await parse(
			source(
				'<para style="s1"><char style="w" strong="G25" x-akribos-status="unreviewed">Titel</char></para><para style="p"><verse number="1"/><char style="w" x-akribos-status="unreviewed">Ohne</char> <char style="w" strong="invalid" x-akribos-status="unreviewed">Nummer</char><note style="f" caller="a"><char style="w" strong="G25" x-akribos-status="unreviewed">Notizwort</char></note>.<verse eid="JHN 3:1"/><verse number="2"/><char style="w" strong="G25" x-akribos-status="unknown">Text</char>.</para>'
			)
		);
		expect(verses.map((v) => segmentsToText(v.segments))).toEqual(['Ohne Nummer.', 'Text.']);
		expect(verses[0]!.heading).toBe('Titel');
		expect(verses.flatMap((v) => strongAssignmentNotes(v.segments))).toEqual([]);
		expect(verses[0]!.segments).toContainEqual({ kind: 'note', marker: 'a', text: 'Notizwort' });
	});

	it('keeps status scoped to its word across Hebrew USFX verses and book boundaries', async () => {
		const verses = [];
		for await (const event of parseUsfx(
			'<usfx><book id="GEN"><c id="1"/><p><v id="1"/><w s="430" x-akribos-status="unreviewed">Probe</w><ve/><v id="2"/><w s="430" x-akribos-status="confirmed">Probe</w></p></book><book id="EXO"><c id="1"/><p><v id="1"/><w s="430">Probe</w></p></book></usfx>'
		)) {
			if (event.type === 'verse') verses.push(event.verse);
		}
		expect(verses.map((v) => [v.book, v.verse])).toEqual([
			[1, 1],
			[1, 2],
			[2, 1]
		]);
		expect(verses.map((v) => strongAssignmentNotes(v.segments).length)).toEqual([1, 0, 0]);
		expect(strongAssignmentNotes(verses[0]!.segments)[0]!.word.strong).toBe('H430');
	});

	it('keeps footnotes and cross references out of scripture and preserves punctuation and nested note text', async () => {
		const { verses, warnings } = await parse(
			source(
				`<para style="p"><verse number="16" sid="JHN 3:16"/>Ein <char style="em">gutes<note style="f" caller="+"><char style="fr">3,16 </char><char style="ft">Siehe <char style="tl">auch</char> <ref loc="GEN 1:1">1Mo 1,1</ref>.</char></note> Wort</char><note style="x" caller="-"><char style="xt"><ref loc="JHN 1:1">Joh 1,1</ref></char></note>.<verse eid="JHN 3:16"/></para>`
			)
		);
		expect(warnings).toEqual([]);
		expect(segmentsToText(verses[0]!.segments)).toBe('Ein gutes Wort.');
		expect(verses[0]!.segments).toContainEqual({
			kind: 'note',
			marker: '',
			text: '3,16 Siehe auch 1Mo 1,1.'
		});
		expect(verses[0]!.segments).toContainEqual({ kind: 'note', marker: '', text: 'Joh 1,1' });
		expect(verses[0]!.segments).toContainEqual({ kind: 'em', text: ' Wort' });
	});

	it('preserves bridges, poetry across paragraphs, and numbered Psalm superscriptions', async () => {
		const { verses, warnings } = await parse(
			source(
				`<para style="d"><verse number="1"/>Ein Psalm.<verse eid="JHN 3:1"/></para><para style="s1">Überschrift</para><para style="r">(Joh 1,1)</para><para style="q1"><verse number="2-3"/>Erste Zeile</para><para style="q2" vid="JHN 3:2-3">zweite Zeile<verse eid="JHN 3:2-3"/></para><para style="p"><verse number="4"/>Ende.<verse eid="JHN 3:4"/></para>`
			)
		);
		expect(warnings).toEqual([]);
		expect(verses.map((v) => [v.verse, v.verseEnd])).toEqual([
			[1, undefined],
			[2, 3],
			[4, undefined]
		]);
		expect(verses[1]).toMatchObject({ heading: 'Überschrift — (Joh 1,1)' });
		expect(verses[1]!.segments).toContainEqual({ kind: 'br' });
		expect(verses.map((v) => segmentsToText(v.segments))).toEqual([
			'Ein Psalm.',
			'Erste Zeile zweite Zeile',
			'Ende.'
		]);
	});

	it('ignores metadata and alternate numbering, without leaking nested Strong words or formatting', async () => {
		const { verses } = await parse(
			source(
				`<para style="p"><verse number="1"/><char style="em">Ein <char style="nd">Wort</char> mehr</char><char style="va">9</char><note style="f" caller="a"><char style="w" strong="G1">Notiz</char></note><verse eid="JHN 3:1"/></para><para style="rem">Interne Bemerkung</para><para style="cl">Kapitel</para><para style="p"><verse number="2"/>Zweiter Vers.</para>`
			)
		);
		expect(verses.map((v) => segmentsToText(v.segments))).toEqual([
			'Ein Wort mehr',
			'Zweiter Vers.'
		]);
		expect(verses[0]!.segments).toContainEqual({ kind: 'em', text: ' mehr' });
		expect(verses[0]!.segments).toContainEqual({ kind: 'note', marker: 'a', text: 'Notiz' });
		expect(verses[0]!.segments.some((s) => typeof s !== 'string' && s.kind === 'w')).toBe(false);
	});

	it('keeps a heading footnote with the following verse, outside its search text', async () => {
		const { verses } = await parse(
			source(
				'<para style="s1">Titel<note style="f" caller="+"><char style="ft">Erklärung zum Titel.</char></note></para><para style="p"><verse number="1"/>Text.</para>'
			)
		);
		expect(verses[0]).toMatchObject({ heading: 'Titel' });
		expect(verses[0]!.segments).toContainEqual({
			kind: 'note',
			marker: '',
			text: 'Erklärung zum Titel.'
		});
		expect(segmentsToText(verses[0]!.segments)).toBe('Text.');
	});

	it('does not lose a verse continuation after a section heading inside that verse', async () => {
		const { verses } = await parse(
			source(
				'<para style="p"><verse number="1"/>Erster Teil.</para><para style="s1">Neuer Abschnitt</para><para style="p">Fortsetzung desselben Verses.<verse eid="JHN 3:1"/><verse number="2"/>Nächster Vers.</para>'
			)
		);
		expect(verses.map((v) => segmentsToText(v.segments))).toEqual([
			'Erster Teil. Fortsetzung desselben Verses.',
			'Nächster Vers.'
		]);
		expect(verses.map((v) => v.heading)).toEqual([undefined, 'Neuer Abschnitt']);
	});

	it.each(['251', '4-2', '1a', '1,3'])(
		'rejects unsupported numbering %s instead of truncating it',
		async (number) => {
			await expect(
				parse(source(`<para style="p"><verse number="${number}"/>Text</para>`))
			).rejects.toThrow('unsupported verse number');
		}
	);

	it('does not attach an unknown book to its predecessor', async () => {
		const { verses, warnings } = await parse(
			'<usx><book code="GEN"/><chapter number="1"/><para style="p"><verse number="1"/>Anfang.</para><book code="ZZZ"/><chapter number="1"/><para style="p"><verse number="1"/>Unbekannt.</para><book code="EXO"/><chapter number="1"/><para style="p"><verse number="1"/>Auszug.</para></usx>'
		);
		expect(verses.map((v) => v.book)).toEqual([1, 2]);
		expect(warnings).toHaveLength(1);
	});
});
