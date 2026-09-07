import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseHebrewLexiconXml } from './hebrew-lexicon-xml.ts';
import type { ParsedLexiconEntry, ParseEvent } from './types.ts';

async function collect(xml: string) {
	const entries: ParsedLexiconEntry[] = [];
	const warnings: string[] = [];

	for await (const event of parseHebrewLexiconXml(xml) as AsyncGenerator<ParseEvent>) {
		if (event.type === 'lexiconEntry') entries.push(event.entry);
		else if (event.type === 'warning') warnings.push(event.message);
	}

	return { entries, warnings };
}

function wrap(entries: string): string {
	return `<?xml version="1.0" encoding="utf-8"?>
<lexicon xmlns="http://openscriptures.github.com/morphhb/namespace">${entries}</lexicon>`;
}

describe('parseHebrewLexiconXml', () => {
	it('keeps translated prose separate and renders links and escaped text in both editions', async () => {
		const { entries, warnings } = await collect(
			wrap(`<entry id="H2">
			<w xml:lang="arc">אַב</w><source>from <w src="H1">1</w></source><usage>father.</usage>
			<translation xml:lang="de" method="machine">
				<source>von <w src="H1">1</w> &lt;script&gt;</source><usage>Vater.</usage>
			</translation>
		</entry>`)
		);
		expect(warnings).toEqual([]);
		expect(entries[0]).toMatchObject({
			lemma: 'אַב',
			kjvDefinitionHtml: 'father.',
			germanTranslation: {
				definitionHtml: null,
				kjvDefinitionHtml: 'Vater.',
				machineTranslated: true
			}
		});
		expect(entries[0]?.derivationHtml).toBe('from <a class="strong-link" href="/H1">H1</a>');
		expect(entries[0]?.germanTranslation?.derivationHtml).toBe(
			'von <a class="strong-link" href="/H1">H1</a> &lt;script&gt;'
		);
	});

	it('ignores unsupported translations without leaking their prose or headword into the original', async () => {
		const { entries } = await collect(
			wrap(`<entry id="H1"><w>אָב</w>
			<translation xml:lang="fr"><w>wrong</w><meaning>père</meaning></translation>
			<meaning>father</meaning></entry>`)
		);
		expect(entries[0]).toMatchObject({ lemma: 'אָב', definitionHtml: 'father' });
		expect(entries[0]?.germanTranslation).toBeUndefined();
	});

	it('warns and retains the whole original when a German edition is incomplete', async () => {
		const { entries, warnings } = await collect(
			wrap(`<entry id="H1"><w>אָב</w>
			<meaning>father</meaning><usage>father.</usage>
			<translation xml:lang="de"><meaning>Vater</meaning></translation></entry>`)
		);
		expect(warnings).toHaveLength(1);
		expect(entries[0]?.definitionHtml).toBe('father');
		expect(entries[0]?.germanTranslation).toBeUndefined();
	});

	it('contains a complete German draft for every bundled entry and preserves every original field', async () => {
		const { entries, warnings } = await collect(await readFile('data/hebrewstrong.xml', 'utf8'));
		expect(warnings).toEqual([]);
		expect(entries).toHaveLength(8674);
		expect(entries.every((entry) => entry.germanTranslation?.machineTranslated)).toBe(true);
		const links = (value: string | null | undefined) =>
			[...(value ?? '').matchAll(/href="\/(H\d+)"/g)].map((match) => match[1]).sort();
		for (const entry of entries) {
			for (const field of ['definitionHtml', 'derivationHtml', 'kjvDefinitionHtml'] as const) {
				expect(links(entry.germanTranslation?.[field]), `${entry.strong}.${field}`).toEqual(
					links(entry[field])
				);
			}
		}
		// Regression examples: articles and inflection need the whole lexical phrase as context.
		for (const strong of ['H6183', 'H8064']) {
			expect(
				entries.find((entry) => entry.strong === strong)?.germanTranslation?.definitionHtml
			).toContain('der <strong>Himmel</strong>');
		}
		expect(
			entries.find((entry) => entry.strong === 'H7225')?.germanTranslation?.definitionHtml
		).toContain('das <strong>Erste</strong>');
		const original = entries.map((entry) => {
			const copy = { ...entry };
			delete copy.germanTranslation;
			return copy;
		});
		// Fingerprint of all parsed original fields before the bilingual extension, including headwords.
		expect(createHash('sha256').update(JSON.stringify(original)).digest('hex')).toBe(
			'47d0fcd2484c535b9884ca864f09ff837e7cb3281c09cbe888e8d904d5300da8'
		);
	});

	it('parses an entry copied from HebrewStrong.xml', async () => {
		const { entries } = await collect(
			wrap(`<entry id="H100">
				<w pos="n-m" pron="ag-mone'" xlit="ʼagmôwn" xml:lang="heb">אַגְמוֹן</w>
				<source>from the same as <w src="H98">98</w>; a marshy <def>pool</def> (others from a different root, a <def>kettle</def>); by implication</source>
				<meaning>a <def>rush</def> (as growing there); collectively a <def>rope</def> of rushes</meaning>
				<usage>bulrush, caldron, hook, rush.</usage>
			</entry>`)
		);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			strong: 'H100',
			language: 'hbo',
			lemma: 'אַגְמוֹן',
			transliteration: 'ʼagmôwn',
			pronunciation: "ag-mone'",
			definitionHtml:
				'a <strong>rush</strong> (as growing there); collectively a <strong>rope</strong> of rushes',
			derivationHtml:
				'from the same as <a class="strong-link" href="/H98">H98</a>; a marshy <strong>pool</strong> (others from a different root, a <strong>kettle</strong>); by implication',
			kjvDefinitionHtml: 'bulrush, caldron, hook, rush.'
		});
	});

	it('recognises the entry id as the Strong number without a language prefix on the wire', async () => {
		const { entries } = await collect(
			wrap(`<entry id="H1"><w pos="n-m" pron="awb" xlit="ʼâb" xml:lang="heb">אָב</w></entry>`)
		);
		expect(entries[0]?.strong).toBe('H1');
	});

	it('handles an entry with no <meaning>, just a cross-reference and a usage', async () => {
		// Aramaic entries that merely point back to their Hebrew counterpart, like H2 -> H1.
		const { entries } = await collect(
			wrap(`<entry id="H2">
				<w pos="n-m" pron="ab" xlit="ʼab" xml:lang="arc">אַב</w>
				<source>(Aramaic) corresponding to <w src="H1">1</w></source>
				<usage>father.</usage>
			</entry>`)
		);

		expect(entries[0]).toMatchObject({ strong: 'H2', lemma: 'אַב', kjvDefinitionHtml: 'father.' });
		expect(entries[0]?.definitionHtml).toBeUndefined();
		expect(entries[0]?.derivationHtml).toContain('href="/H1"');
	});

	it('keeps an editorial note that sits inside a field, but drops one that annotates the entry itself', async () => {
		const { entries } = await collect(
			wrap(`<entry id="H269">
				<w pos="n-f" pron="aw-khoth'" xlit="ʼâchôwth" xml:lang="heb">אָחוֹת</w>
				<note>xlit correction irrelevant to the reader</note>
				<source>irregular feminine of <w src="H251">251</w>;</source>
				<meaning>a <def>sister</def> (used very widely [like <w src="H251">251</w><note>number 250, corrected to 251</note>], literally and figuratively)</meaning>
				<usage>(an-) other, sister, together.</usage>
			</entry>`)
		);

		expect(entries[0]?.definitionHtml).toContain('number 250, corrected to 251');
		expect(entries[0]?.definitionHtml).not.toContain('xlit correction irrelevant');
	});

	it('escapes text from the source', async () => {
		const { entries } = await collect(
			wrap(`<entry id="H1">
				<w pos="n-m" pron="awb" xlit="ʼâb" xml:lang="heb">אָב</w>
				<meaning>a &lt;script&gt; &amp; more</meaning>
			</entry>`)
		);

		expect(entries[0]?.definitionHtml).toBe('a &lt;script&gt; &amp; more');
	});

	it('warns about an entry without a headword instead of silently dropping it', async () => {
		const { entries, warnings } = await collect(
			wrap(`<entry id="H1"><meaning>orphaned</meaning></entry>`)
		);

		expect(entries).toEqual([]);
		expect(warnings).toHaveLength(1);
	});
});
