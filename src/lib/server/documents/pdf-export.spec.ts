import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createPdfExport, type OwnedDocumentExport } from './export';
import { createPdfModel, pdfInlineRuns } from './pdf-model';

const exec = promisify(execFile);
const fixture = {
	document: {
		id: '5eed0000-0000-4000-8000-000000000004',
		kind: 'sermon',
		title: 'Geliebt & gesandt – für Ähren',
		bodyMarkdown: '',
		sermonDate: new Date('2026-09-06T00:00:00.000Z'),
		sermonSeries: 'Johannes',
		sermonFormat: 'home-group'
	},
	tags: ['Ausarbeitung/Johannes'],
	passages: [{ reference: 'Joh 3,16-17' }],
	deliveries: [{ date: new Date('2026-09-13T00:00:00.000Z'), location: 'Gemeinde Nord' }]
} as OwnedDocumentExport;

async function inspectPdf(markdown: string, title = fixture.document.title) {
	const result = await createPdfExport(
		{ ...fixture, document: { ...fixture.document, title, bodyMarkdown: markdown } },
		{ baseUrl: 'https://reader.example.test' }
	);
	const directory = await mkdtemp(join(tmpdir(), 'akribos-pdf-test-'));
	try {
		const path = join(directory, 'export.pdf');
		await writeFile(path, result.buffer);
		const [text, bbox, info, fonts, links] = await Promise.all([
			exec('pdftotext', ['-layout', path, '-']),
			exec('pdftotext', ['-bbox', path, '-']),
			exec('pdfinfo', [path]),
			exec('pdffonts', [path]),
			exec('pdfinfo', ['-url', path])
		]);
		return {
			...result,
			text: text.stdout,
			bbox: bbox.stdout,
			info: info.stdout,
			fonts: fonts.stdout,
			links: links.stdout,
			pages: text.stdout.split('\f').filter((page) => page.trim())
		};
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

describe('PDF document model', () => {
	it('preserves nested emphasis, strike, safe links and Hebrew while keeping code literal', () => {
		const runs = pdfInlineRuns(
			'**fett *beides*** ~~weg~~ שָׁלוֹם Joh 3,16 `Mt 5,3` [intern](/notes/example) [unsicher](javascript:alert)',
			[],
			'https://reader.example.test'
		);
		expect(runs).toContainEqual({ text: 'beides', bold: true, italic: true });
		expect(runs).toContainEqual({ text: 'weg', strike: true });
		expect(runs).toContainEqual({ text: 'שָׁלוֹם', language: 'he' });
		expect(runs).toContainEqual({ text: 'Mt 5,3', code: true });
		expect(runs).toContainEqual({
			text: 'Joh 3,16',
			bibleReference: true,
			href: 'https://reader.example.test/Joh3,16'
		});
		expect(runs).toContainEqual({
			text: 'intern',
			href: 'https://reader.example.test/notes/example'
		});
		expect(runs.find((run) => run.text === 'unsicher')?.href).toBeUndefined();
	});

	it('resolves reference links and preserves structured quotes, tasks, lists and table alignment', () => {
		const model = createPdfModel(
			'Titel',
			'> Ein **Zitat** mit [Quelle][quelle].\n\n3. Dritter\n4. Vierter\n\n- [x] Erledigt\n- [ ] Offen\n\n| Links | Rechts |\n| :--- | ---: |\n| *A* | B |\n\n[quelle]: /about',
			[],
			'https://reader.example.test'
		);
		expect(model.blocks[0]).toMatchObject({
			kind: 'quote',
			blocks: [
				{
					kind: 'paragraph',
					runs: expect.arrayContaining([
						{ text: 'Quelle', href: 'https://reader.example.test/about' }
					])
				}
			]
		});
		expect(model.blocks[1]).toMatchObject({ kind: 'list', ordered: true, start: 3 });
		expect(model.blocks[2]).toMatchObject({
			kind: 'list',
			items: [{ checked: true }, { checked: false }]
		});
		expect(model.blocks[3]).toMatchObject({ kind: 'table', align: ['left', 'right'] });
	});

	it('numbers notes by first use, retains repeat anchors and keeps orphaned definitions', () => {
		const model = createPdfModel(
			'Titel',
			'Text[^b] und[^a] erneut[^b]. `[^a]` \\[^a]\n\n[^a]: Erste\n[^b]: Zweite\n[^leer]:',
			[]
		);
		expect(model.footnotes.map((note) => note.number)).toEqual([1, 2]);
		expect(model.orphans).toMatchObject([{ number: 3 }]);
		const first = model.blocks[0];
		if (!first || first.kind !== 'paragraph') throw new Error('expected paragraph');
		expect(first.runs.filter((run) => run.footnoteId)).toEqual([
			{ text: '[1]', footnoteNumber: 1, footnoteId: 'b' },
			{ text: '[2]', footnoteNumber: 2, footnoteId: 'a' },
			{ text: '[1]', footnoteNumber: 1, footnoteId: 'b', repeat: true }
		]);
		expect(first.runs).toContainEqual({ text: '[^a]', code: true });
	});

	it('rejects oversize Markdown before parsing', () => {
		expect(() => createPdfModel('Titel', 'ä'.repeat(524_289), [])).toThrow(/zu groß/);
	});

	it('retains the editor’s portable underline/highlight without accepting attributed HTML', () => {
		const runs = pdfInlineRuns(
			'<u>unter <mark>**beides**</mark></u> normal <u onclick="evil()">untrusted</u>'
		);
		expect(runs).toContainEqual({ text: 'unter ', underline: true });
		expect(runs).toContainEqual({ text: 'beides', bold: true, underline: true, highlight: true });
		expect(runs).toContainEqual({ text: 'untrusted' });
	});
});

describe('production Typst PDF export', () => {
	it('embeds genuine font faces, rich content, metadata, safe annotations and portable filenames', async () => {
		const pdf = await inspectPdf(
			'# Hoffnung\n\nNormal **fett** *kursiv* ***beides*** ~~gestrichen~~ χάρις שָׁלוֹם.\n\n> Ein hervorgehobenes Zitat.\n\n[Notiz](/notes/example) [Quelle](https://example.test/source) [unsicher](javascript:alert)\n\n- Erster Punkt\n- Zweiter Punkt\n\n| Begriff | Erklärung |\n| --- | --- |\n| Liebe | Annahme |\n\n`x_y *= 2`'
		);
		expect(pdf.filename).toBe('Geliebt & gesandt – für Ähren.pdf');
		expect(pdf.contentDisposition).toContain("filename*=UTF-8''Geliebt%20%26%20gesandt");
		for (const text of [
			'Hoffnung',
			'hervorgehobenes Zitat',
			'Erster Punkt',
			'Annahme',
			'χάρις',
			'Gemeinde Nord',
			'Ausarbeitung/Johannes',
			'06.09.2026',
			'13.09.2026'
		])
			expect(pdf.text).toContain(text);
		for (const face of [
			'AkribosText-Regular',
			'AkribosText-Bold',
			'AkribosText-Italic',
			'AkribosText-BoldItalic',
			'AkribosText-SemiBold',
			'NotoSansHebrew',
			'DejaVuSansMono'
		])
			expect(pdf.fonts).toContain(face);
		for (const row of pdf.fonts.split('\n').slice(2).filter(Boolean))
			expect(row).toMatch(/yes\s+yes\s+yes/);
		expect(pdf.links).toContain('https://reader.example.test/notes/example');
		expect(pdf.links).toContain('https://example.test/source');
		expect(pdf.links).not.toContain('javascript:');
		expect(pdf.info).toContain(fixture.document.title);
		expect(pdf.info).not.toContain(fixture.document.id);
	});

	it('places first-use notes at the page foot with repeated links and visible unreferenced notes', async () => {
		const pdf = await inspectPdf(
			'AnkerA[^a], AnkerB[^b], wieder[^a].\n\n[^a]: FussnotentextA mit **Fettdruck**.\n\n[^b]: FussnotentextB [Quelle](https://example.test/footnote).\n\n[^c]: VerwaisterText bleibt erhalten.'
		);
		expect(pdf.pages[0]).toContain('AnkerA');
		expect(pdf.pages[0]).toContain('FussnotentextA');
		expect(pdf.pages[0]).toContain('FussnotentextB');
		expect(pdf.text.match(/FussnotentextA/g)).toHaveLength(1);
		expect(pdf.text).toContain('Fußnoten ohne Verweis');
		expect(pdf.text).toContain('VerwaisterText');
		const note = /<word xMin="[^"]+" yMin="([^"]+)"[^>]*>[^<]*FussnotentextA[^<]*<\/word>/.exec(
			pdf.bbox
		);
		expect(Number(note?.[1])).toBeGreaterThan(650);
		expect(pdf.links).toContain('https://example.test/footnote');
	});

	it('flows long notes across pages and repeats the header and numbered footer everywhere', async () => {
		const note = Array.from(
			{ length: 9 },
			(_, i) => `Abschnitt${i} ` + 'Eine ausführliche Erklärung mit lesbarem Inhalt. '.repeat(26)
		).join('\n\n    ');
		const pdf = await inspectPdf(`Anker[^lang].\n\n[^lang]: ${note}\n\nSchlussabsatz.`);
		expect(pdf.pages.length).toBeGreaterThan(1);
		for (let i = 0; i < 9; i++) expect(pdf.text).toContain(`Abschnitt${i}`);
		for (const [index, page] of pdf.pages.entries()) {
			expect(page).toContain('AKRIBOS');
			expect(page).toContain('akribos.de');
			expect(page).toMatch(new RegExp(`Seite ${index + 1} / ${pdf.pages.length}`));
		}
	});

	it('preserves long unbroken prose, code, URLs and narrow table cells without clipping', async () => {
		const pdf = await inspectPdf(
			`Beginn ${'a'.repeat(250)} Ende\n\n~~~\n${'b'.repeat(250)}\n~~~\n\n[https://example.test/${'c'.repeat(250)}](https://example.test/source)\n\n| Lang | Kurz |\n| --- | --- |\n| ${'d'.repeat(250)} | Ende |`
		);
		// Line wrapping may introduce extraction whitespace, but every original character must survive.
		const compact = pdf.text.replace(/\s/g, '');
		for (const character of ['a', 'b', 'c']) expect(compact).toContain(character.repeat(250));
		// The short neighbor cell is interleaved by pdftotext's row-wise reading order.
		expect((pdf.text.match(/d{5,}/g) ?? []).join('')).toBe('d'.repeat(250));
		expect(pdf.text).not.toContain('\u200b');
	});

	it('renders executable-looking input and code literally without executing or linking it', async () => {
		const literal =
			'#read("/etc/passwd")\n#import "@preview/evil:1.0.0"\n[link](https://example.test/code) Joh 3,16 &amp;\n  x_y *= 2';
		const pdf = await inspectPdf(
			`~~~text\n${literal}\n~~~\n\n    # Keine Überschrift\n    a_b * c\n\nCode \`#eval("secret")\`.`
		);
		expect(pdf.text).toContain('#read("/etc/passwd")');
		expect(pdf.text).toContain('#import "@preview/evil:1.0.0"');
		expect(pdf.text).toContain('&amp;');
		expect(pdf.text).toContain('a_b * c');
		expect(pdf.text).not.toContain('root:x:');
		expect(pdf.links).not.toContain('https://example.test/code');
		expect(pdf.links).not.toMatch(/\/Joh3,16(?:\s|$)/);
	});

	it('keeps long words across style changes and combining Greek graphemes complete', async () => {
		const greek = 'α\u0313\u0301';
		const pdf = await inspectPdf(
			`${'a'.repeat(70)}**${'b'.repeat(70)}**\n\n${greek.repeat(120)}\n\n<u>Unterstrichen</u> und <mark>Markiert</mark>.`,
			't'.repeat(150)
		);
		const compact = pdf.text.replace(/\s/g, '');
		for (const character of ['a', 'b']) expect(compact).toContain(character.repeat(70));
		expect(compact).toContain('t'.repeat(150));
		expect(compact.normalize('NFC')).toContain(greek.normalize('NFC').repeat(120));
		expect(pdf.text).toContain('Unterstrichen');
		expect(pdf.text).toContain('Markiert');
	});

	it('keeps mixed Hebrew and subsequent German words in their proper visual reading order', async () => {
		const pdf = await inspectPdf('Vorwort ראשון שני שלישי erstes zweites drittes.');
		const words = [
			...pdf.bbox.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)"[^>]*>([^<]+)<\/word>/g)
		];
		const coordinate = (word: string) => {
			const match = words.find((entry) => entry[3] === word);
			expect(match, `missing PDF word ${word}`).toBeDefined();
			return { x: Number(match![1]), y: Number(match![2]) };
		};
		const first = coordinate('erstes');
		const second = coordinate('zweites');
		const third = coordinate('drittes.');
		expect(first.y).toBe(second.y);
		expect(second.y).toBe(third.y);
		expect(first.x).toBeLessThan(second.x);
		expect(second.x).toBeLessThan(third.x);
	});

	it('fails explicitly for an overwide styled Hebrew word while preserving normal formatted Hebrew', async () => {
		const bodyMarkdown = `${'א'.repeat(40)}**${'ב'.repeat(40)}**`;
		await expect(
			createPdfExport({ ...fixture, document: { ...fixture.document, bodyMarkdown } })
		).rejects.toMatchObject({ status: 422 });
		const pdf = await inspectPdf(`ש**לום** ${'א'.repeat(40)} **${'ב'.repeat(40)}**`);
		expect(pdf.text.match(/א/g)).toHaveLength(40);
		expect(pdf.text.match(/ב/g)).toHaveLength(40);
		for (const character of ['ש', 'ל', 'ו', 'ם']) expect(pdf.text).toContain(character);
		for (const mixedWord of ['a'.repeat(70) + 'א'.repeat(40), 'א'.repeat(40) + 'a'.repeat(70)]) {
			await expect(
				createPdfExport({ ...fixture, document: { ...fixture.document, bodyMarkdown: mixedWord } })
			).rejects.toMatchObject({ status: 422 });
		}
	});

	it('wraps pure and mixed Hebrew code without clipping', async () => {
		const alphabet = 'אבגדהוזחטיכלמנסעפצקרשת';
		const pdf = await inspectPdf(`~~~\n${alphabet.repeat(15)}\n~~~`);
		for (const character of alphabet) expect(pdf.text.split(character)).toHaveLength(16);
		const mixed = await inspectPdf(`~~~\nconst="${alphabet.repeat(15)}"\n~~~`);
		for (const character of alphabet) expect(mixed.text.split(character)).toHaveLength(16);
		// Poppler emits bidi controls and can extract the punctuation in visual order.
		expect(mixed.text).toContain('const');
		expect(mixed.text.match(/=/g)).toHaveLength(1);
		expect(mixed.text.match(/"/g)).toHaveLength(2);
	});

	it('does not duplicate a footnote definition when a table header spans pages', async () => {
		const rows = Array.from({ length: 80 }, (_, i) => `| Zeile ${i} | Inhalt ${i} |`).join('\n');
		const pdf = await inspectPdf(
			`| Kopf[^quelle] | Spalte |\n| --- | --- |\n${rows}\n\nDanach wieder[^quelle].\n\n[^quelle]: EinmaligeQuellennote.`
		);
		expect(pdf.pages.length).toBeGreaterThan(1);
		expect(pdf.text.match(/EinmaligeQuellennote/g)).toHaveLength(1);
		expect(pdf.text).toContain('Zeile 79');
		expect(pdf.text).toContain('Danach wieder');
	});

	it('keeps large ordinary paragraphs and table cells complete without excessive context nesting', async () => {
		const sentence = 'Ein langer Absatz mit gewöhnlichen Wörtern und unveränderten Zeichen. ';
		const pdf = await inspectPdf(
			`${sentence.repeat(600)} ABSATZENDE\n\n| Inhalt |\n| --- |\n| ${sentence.repeat(200)} TABELLENENDE |`
		);
		expect(pdf.text).toContain('ABSATZENDE');
		expect(pdf.text).toContain('TABELLENENDE');
	});
});
