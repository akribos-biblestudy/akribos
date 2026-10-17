import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import VerseText from './VerseText.svelte';
import { placeVerseNotes } from '$lib/bible/verse-notes';
import { splitVerseLead, taggedWordSegments } from '$lib/bible/segments';

it('renders one superscript end marker with all bodies while keeping middle notes at their word', async () => {
	const click = vi.fn();
	const screen = await render(VerseText, {
		segments: [
			{ kind: 'note', marker: '', text: 'Vershinweis' },
			{ kind: 'w', text: 'Anfang', strong: 'G746' },
			{ kind: 'note', marker: '1', text: 'Wortanfang' },
			' und ',
			{ kind: 'w', text: 'Ende', strong: 'G5056' },
			{ kind: 'note', marker: '2', text: 'Wortende' },
			'.'
		],
		onStrongClick: click
	});
	const markers = screen.container.querySelectorAll<HTMLButtonElement>('.footnote-marker');
	expect(markers).toHaveLength(2);
	expect(markers[0]!.textContent?.trim()).toBe('1');
	expect(markers[1]!.textContent?.trim()).toBe('*, 2');
	expect(
		screen.container.textContent
			?.replace(/\u2060/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	).toBe('Anfang1 und Ende.*, 2');
	expect(getComputedStyle(markers[1]!).verticalAlign).toBe('super');
	markers[1]!.click();
	await expect.element(screen.getByRole('note')).toHaveTextContent('*: Vershinweis');
	await expect.element(screen.getByRole('note')).toHaveTextContent('2: Wortende');
	await screen.getByRole('button', { name: 'Ende', exact: true }).click();
	expect(click).toHaveBeenCalledWith('G5056', 'Ende', 1);
});

it('does not reinterpret first-word notes as verse notes after splitting the lead', async () => {
	const [lead, rest] = splitVerseLead(
		placeVerseNotes([
			{ kind: 'note', marker: '', text: 'Vershinweis' },
			{ kind: 'w', text: 'Anfang', strong: 'G746' },
			{ kind: 'note', marker: '7', text: 'Wortanfang' },
			' und Ende.'
		])
	);
	await render(VerseText, { segments: lead, completeVerse: false });
	const remainder = await render(VerseText, {
		segments: rest,
		completeVerse: false,
		wordPositionOffset: taggedWordSegments(lead).length,
		wordOffset: 1
	});
	expect(
		remainder.container.textContent
			?.replace(/\u2060/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	).toBe('7 und Ende.*');
	await remainder.getByRole('button', { name: 'Hinweis 7 öffnen' }).click();
	await expect.element(remainder.getByRole('note')).toHaveTextContent('Wortanfang');
});

it('renders a source word marker before existing whitespace', async () => {
	const screen = await render(VerseText, {
		segments: ['Wort ', { kind: 'note', marker: '4', text: 'Worterklärung' }, 'und weiter.']
	});
	expect(
		screen.container.textContent
			?.replace(/\u2060/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	).toBe('Wort4 und weiter.');
});
