import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GlossChart from './GlossChart.svelte';

it.each([390, 1440])(
	'keeps long accessible gloss rows without widening the document at %ipx',
	async (width) => {
		await page.viewport(width, 900);
		const longGloss = 'außerordentlichlangezusammengesetzteWiedergabe'.repeat(4);
		const longForm = 'außerordentlichlangeursprünglicheWortform'.repeat(4);
		const screen = await render(GlossChart, {
			glosses: [
				{
					display: longGloss,
					occurrences: 8,
					forms: [
						{ display: longForm, occurrences: 7 },
						{ display: 'weitere Form', occurrences: 1 }
					]
				},
				{ display: 'Gott', occurrences: 4 }
			],
			occurrenceTotal: 13
		});
		// Reproduce the right-hand statistics panel: a table's intrinsic width used
		// to escape the one-pixel clip when the clip was applied to the table itself.
		screen.container.style.cssText =
			'position:absolute;top:16px;right:16px;width:min(460px,calc(100vw - 32px))';
		await expect
			.poll(() => screen.container.querySelector('canvas')!.clientWidth)
			.toBeLessThanOrEqual(screen.container.clientWidth);
		await expect
			.poll(() => document.documentElement.scrollWidth)
			.toBeLessThanOrEqual(window.innerWidth);

		const table = screen.getByRole('table', { name: 'Übersetzt als' });
		await expect.element(table).toBeInTheDocument();
		const nativeTable = table.element() as HTMLTableElement;
		expect([...nativeTable.tHead!.rows[0]!.cells].map((cell) => cell.textContent)).toEqual([
			'Übersetzt als',
			'Vorkommen',
			'Wortformen im Bibeltext'
		]);
		expect(
			[...nativeTable.tBodies[0]!.rows].map((row) => [...row.cells].map((cell) => cell.textContent))
		).toEqual([
			[longGloss, '8', `${longForm} (7), weitere Form (1)`],
			['Gott', '4', 'Gott (4)'],
			['weitere Wiedergaben', '1', '']
		]);
	}
);
