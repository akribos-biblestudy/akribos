import { describe, expect, it } from 'vitest';
import { decodeReaderUrlState } from '$lib/reader/url-state';
import type { ReaderWorkspace } from '$lib/reader/workspace';
import { feedbackLocationLinks } from './location-links';

describe('feedback location links', () => {
	it('finds scripture and Strong references in free text and preserves their order', () => {
		const text = 'Johannes 3,16, Wort 2; Strong G0025, Abschnitt 1';
		expect(feedbackLocationLinks(text)).toEqual([
			{ label: 'Johannes 3,16', href: '/Joh3,16', from: 0, to: 13 },
			{ label: 'G0025', href: '/G25', from: text.indexOf('G0025'), to: text.indexOf('G0025') + 5 }
		]);
	});

	it('opens an exact Bible or commentary in the Reader', () => {
		const links = feedbackLocationLinks('Joh 3,16', { id: 'SEEDDE', kind: 'bible' });
		const url = new URL(links[0]!.href, 'https://akribos.invalid');
		expect(url.pathname).toBe('/Joh3,16');
		const decoded = decodeReaderUrlState(url)!.workspace as ReaderWorkspace;
		expect(decoded.tiles[0]!.tabs[0]).toMatchObject({
			resourceId: 'SEEDDE',
			reference: { book: 43, chapter: 3, verse: 16 }
		});
	});

	it('opens Strong entries in the reported lexicon and retains any Bible context', () => {
		const links = feedbackLocationLinks('Joh 3,16, Strong G25', { id: 'KAUTZ', kind: 'lexicon' });
		const url = new URL(links[1]!.href, 'https://akribos.invalid');
		const decoded = decodeReaderUrlState(url)!.workspace as ReaderWorkspace;
		expect(decoded.tiles[0]!.tabs[0]).toMatchObject({
			resourceId: 'KAUTZ',
			lookup: 'G25',
			reference: { book: 43, chapter: 3, verse: 16 }
		});
	});

	it('recognises an explicitly identified bare Strong number only with a known dictionary language', () => {
		const links = feedbackLocationLinks('Strong-Nummer 25, Abschnitt 1', {
			id: 'KAUTZ',
			kind: 'lexicon',
			language: 'grc'
		});
		const url = new URL(links[0]!.href, 'https://akribos.invalid');
		const decoded = decodeReaderUrlState(url)!.workspace as ReaderWorkspace;
		expect(decoded.tiles[0]!.tabs[0]).toMatchObject({ resourceId: 'KAUTZ', lookup: 'G25' });
		expect(feedbackLocationLinks('Strong 25', { id: 'OTHER', kind: 'lexicon' })).toEqual([]);
		expect(
			feedbackLocationLinks('Eintrag 25', { id: 'KAUTZ', kind: 'lexicon', language: 'grc' })
		).toEqual([]);
	});

	it('never treats unrelated text or an invalid Strong number as a destination', () => {
		expect(feedbackLocationLinks('Abschnitt zwei, <script> G99999 H0 xyzG25')).toEqual([]);
	});

	it('preserves repeated matches and exact UTF-16 positions including emoji and HTML-like text', () => {
		const text = '📖 <script> Joh 3,16; Joh 3,16 & Strong G25, G25 </script>';
		const matches = feedbackLocationLinks(text);
		expect(matches.map((match) => match.label)).toEqual(['Joh 3,16', 'Joh 3,16', 'G25', 'G25']);
		let lastEnd = 0;
		let reconstructed = '';
		for (const match of matches) {
			expect(match.from).toBeGreaterThanOrEqual(lastEnd);
			expect(text.slice(match.from, match.to)).toBe(match.label);
			expect(match.href.startsWith('/')).toBe(true);
			reconstructed += text.slice(lastEnd, match.from) + match.label;
			lastEnd = match.to;
		}
		expect(reconstructed + text.slice(lastEnd)).toBe(text);
	});
});
