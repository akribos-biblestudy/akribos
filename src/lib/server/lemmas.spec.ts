import { describe, expect, it } from 'vitest';
import { lemmaLanguage, loadLemmaLookup, parseLemmaDictionary } from './lemmas.ts';

describe('offline lemma dictionaries', () => {
	it('finds exact UTF-8 words and preserves distinct candidates without parsing the full dictionary', async () => {
		const records = [
			['Häuser', [['Haus', 'Noun']]],
			[
				'Reiche',
				[
					['Reich', 'Noun'],
					['Reicher', 'AdjectivalDeclension']
				]
			],
			['ähnelt', [['ähneln', 'Verb']]]
		] as const;
		const data = Buffer.from(
			records.map(([form, values]) => `${form}\t${JSON.stringify(values)}\n`).join('')
		);
		const lookup = await parseLemmaDictionary(data);
		for (const [form, values] of records) expect(lookup(form)).toEqual(values);
		for (const missing of ['A', 'Häuse', 'Häusern', 'reiche', 'Ω'])
			expect(lookup(missing)).toEqual([]);
		expect((await parseLemmaDictionary(Buffer.alloc(0)))('word')).toEqual([]);
		await expect(parseLemmaDictionary(Buffer.from('truncated'))).rejects.toThrow('newline');
	});

	it('normalizes language codes without allowing file paths or using another language', async () => {
		expect(['de-CH', 'de_AT', 'DE', 'deu', 'ger'].map(lemmaLanguage)).toEqual(Array(5).fill('de'));
		expect(lemmaLanguage('eng')).toBe('en');
		expect(lemmaLanguage('../../de')).toBeUndefined();
		expect(lemmaLanguage('german')).toBeUndefined();
		expect((await loadLemmaLookup('en'))('Reiches')).toEqual([]);
	});

	it('ships real German analyses with ambiguous nouns and irregular forms intact', async () => {
		const lookup = await loadLemmaLookup('de-CH');
		expect(lookup('Reiches')).toContainEqual(['Reich', 'Noun']);
		expect(lookup('Reiche')).toEqual(
			expect.arrayContaining([
				['Reich', 'Noun'],
				['Reicher', 'AdjectivalDeclension']
			])
		);
		expect(lookup('Häuser')).toContainEqual(['Haus', 'Noun']);
		expect(lookup('gegangen')).toContainEqual(['gehen', 'Verb']);
		expect(lookup('Neulichtwort')).toEqual([]);
	});
});
