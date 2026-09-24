import { describe, expect, it } from 'vitest';
import { segmentsToText } from '../segments.ts';
import type { ParseEvent } from './types.ts';
import { parseUsx } from './usx.ts';

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
