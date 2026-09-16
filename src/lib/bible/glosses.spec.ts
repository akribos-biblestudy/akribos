import { describe, expect, it } from 'vitest';
import {
	groupStrongGlosses,
	type LemmaCandidate,
	type LemmaLookup,
	type RawStrongGloss
} from './glosses.ts';

const dictionary: Record<string, readonly LemmaCandidate[]> = {
	Reich: [['Reich', 'Noun']],
	Reiches: [['Reich', 'Noun']],
	Reiche: [
		['Reich', 'Noun'],
		['Reiche', 'AdjectivalDeclension'],
		['Reicher', 'AdjectivalDeclension']
	],
	Reicher: [['Reicher', 'AdjectivalDeclension']],
	geliebt: [['lieben', 'Verb']],
	liebe: [
		['lieben', 'Verb'],
		['lieb', 'Adjective']
	],
	Liebe: [['Liebe', 'Noun']],
	das: [['der', 'Pronoun']],
	gegangen: [['gehen', 'Verb']],
	Häuser: [['Haus', 'Noun']]
};
const lookup: LemmaLookup = (word) => dictionary[word] ?? [];

function rows(...words: string[]): RawStrongGloss[] {
	return words.map((display, index) => ({
		display,
		gloss: display.toLowerCase(),
		occurrences: index + 1
	}));
}

describe('conservative translation lemma grouping', () => {
	it('uses independent unambiguous forms of the same Strong to resolve a homograph', () => {
		expect(groupStrongGlosses(rows('Reiche'), lookup).map((g) => g.display)).toEqual(['Reiche']);
		const grouped = groupStrongGlosses(rows('Reiche', 'Reiches'), lookup);
		expect(grouped).toHaveLength(1);
		expect(grouped[0]).toMatchObject({ display: 'Reich', occurrences: 3 });
		expect(grouped[0]?.forms.map((f) => f.display)).toEqual(['Reiches', 'Reiche']);
		// Conflicting independent evidence must not make an arbitrary noun win.
		expect(
			groupStrongGlosses(rows('Reiche', 'Reich', 'Reicher'), lookup).map((g) => g.display)
		).toEqual(['Reicher', 'Reich', 'Reiche']);
	});

	it('retains noun case, function words, unknown words and whole multiword tags', () => {
		const grouped = groupStrongGlosses(
			rows('Liebe', 'geliebt', 'das', 'in dem Reich', 'Thränen'),
			lookup
		);
		expect(grouped.map((g) => g.display)).toEqual([
			'Thränen',
			'in dem Reich',
			'das',
			'lieben',
			'Liebe'
		]);
		expect(grouped.reduce((n, g) => n + g.occurrences, 0)).toBe(15);
		expect(groupStrongGlosses(rows('Häuser', 'Gegangen'), lookup).map((g) => g.display)).toEqual([
			'gehen',
			'Haus'
		]);
	});

	it('keeps original groups without a supported dictionary and does not mutate input', () => {
		const original = rows('Reich', 'Reiches');
		const before = structuredClone(original);
		expect(groupStrongGlosses(original).map((g) => g.display)).toEqual(['Reiches', 'Reich']);
		groupStrongGlosses(original, lookup);
		expect(original).toEqual(before);
	});

	it('does not merge unresolved homographs through a label collision or fold noun and verb lemmas', () => {
		const cases: Record<string, readonly LemmaCandidate[]> = {
			Aa: [['Aa', 'Noun']],
			Aas: [
				['Aa', 'Noun'],
				['Aas', 'Noun']
			],
			Aase: [['Aas', 'Noun']],
			Aasen: [['Aase', 'Noun']],
			Lebens: [['Leben', 'Noun']],
			lebt: [['leben', 'Verb']]
		};
		const lookup: LemmaLookup = (word) => cases[word] ?? [];
		const original = rows('Aa', 'Aas', 'Aase', 'Aasen');
		expect(groupStrongGlosses(original, lookup).map((g) => g.display)).toEqual([
			'Aasen',
			'Aase',
			'Aas',
			'Aa'
		]);
		expect(groupStrongGlosses(rows('Lebens', 'lebt'), lookup).map((g) => g.display)).toEqual([
			'leben',
			'Leben'
		]);
	});
});
