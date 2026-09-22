import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BibleReferenceProse from './BibleReferenceProse.svelte';
import '../../../routes/layout.css';

describe('BibleReferenceProse', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('lets keyboard readers scroll a wide table without links on a narrow screen', async () => {
		await page.viewport(390, 700);
		const screen = await render(BibleReferenceProse, {
			html: '<table><thead><tr><th>Älteste</th><th>Männer</th><th>Frauen</th></tr></thead><tbody><tr><td>Untadelig</td><td>Treu</td><td>Nüchtern</td></tr></tbody></table>',
			bibleId: null,
			tooltipId: 'table-only-prose'
		});
		screen.container.style.width = '300px';
		const table = screen.getByRole('table').element() as HTMLElement;
		expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
		screen.container.tabIndex = -1;
		screen.container.focus();
		await userEvent.tab();
		expect(document.activeElement).toBe(table);
		await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
		await expect.poll(() => table.scrollLeft).toBeGreaterThan(0);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
	});

	it('links safe prose and exposes its verse preview on hover and keyboard focus', async () => {
		const bibleId = `PREVIEW-${Date.now()}`;
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === `/api/v1/bibles/${bibleId}/40/3`) {
				return new Response(
					JSON.stringify({
						verses: [
							{
								verse: 12,
								segments: ['Er hat die Worfschaufel in seiner Hand.']
							}
						]
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			if (url === '/api/v1/resources') {
				return new Response(
					JSON.stringify({ resources: [{ id: bibleId, tabTitle: 'Testbibel' }] }),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}
			return new Response(null, { status: 404 });
		});
		vi.stubGlobal('fetch', fetchMock);

		const screen = await render(BibleReferenceProse, {
			html: '<p>Siehe Mt 3,12.</p><code>Joh 3,16</code>',
			bibleId,
			tooltipId: 'component-bible-reference-preview'
		});
		const link = screen.getByRole('link', { name: 'Mt 3,12' });
		const linkElement = link.element() as HTMLAnchorElement;

		await expect.element(link).toHaveAttribute('href', '/Mt3,12');
		await expect.element(link).toHaveAttribute('data-reference', 'Mt3,12');
		expect(screen.getByRole('link', { name: 'Joh 3,16' }).query()).toBeNull();

		linkElement.focus();
		const tooltip = page.getByTestId('bible-reference-preview');
		await expect.element(tooltip).toBeVisible();
		await expect
			.element(tooltip)
			.toHaveTextContent('Matthäus 3,12 · TestbibelEr hat die Worfschaufel in seiner Hand.');
		expect(linkElement.getAttribute('aria-describedby')).toBe(tooltip.element().id);

		await userEvent.keyboard('{Escape}');
		await expect.element(tooltip).not.toBeVisible();
		expect(linkElement.getAttribute('aria-describedby')).toBe(tooltip.element().id);
		expect(document.activeElement).toBe(linkElement);

		linkElement.blur();
		await link.hover();
		await expect.element(tooltip).toBeVisible();
		await link.unhover();
		await expect.element(tooltip).not.toBeVisible();
	});
	it('keeps repeated footnote links and keyboard return targets inside each rendered instance', async () => {
		const html =
			'<p>Text<sup data-footnote-ref="same">1</sup>, nochmals<sup data-footnote-ref="same">1</sup>.</p><ol data-footnotes="true"><li data-footnote-id="same"><p>Eine formatierte <strong>Fußnote</strong>.</p></li></ol>';
		const first = await render(BibleReferenceProse, {
			html,
			bibleId: null,
			tooltipId: 'first-footnote-preview',
			testId: 'first-footnotes'
		});
		const second = await render(BibleReferenceProse, {
			html,
			bibleId: null,
			tooltipId: 'second-footnote-preview',
			testId: 'second-footnotes'
		});
		const firstRoot = first.getByTestId('first-footnotes').element();
		const secondRoot = second.getByTestId('second-footnotes').element();
		const references = Array.from(
			firstRoot.querySelectorAll<HTMLAnchorElement>('[role="doc-noteref"]')
		);
		const firstTarget = document.getElementById(decodeURIComponent(references[1]!.hash.slice(1)))!;
		expect(firstRoot.contains(firstTarget)).toBe(true);
		expect(secondRoot.contains(firstTarget)).toBe(false);
		expect(firstRoot.querySelector('li')!.id).not.toBe(secondRoot.querySelector('li')!.id);
		references[1]!.focus();
		await userEvent.keyboard('{Enter}');
		expect(document.activeElement).toBe(firstTarget);
		const backlink = first
			.getByTestId('first-footnotes')
			.getByRole('link', { name: 'Zurück zu Fußnote 1, Verweis 2' });
		await backlink.click();
		expect(document.activeElement).toBe(references[1]);
		expect(firstRoot.querySelectorAll('[role="doc-backlink"]')).toHaveLength(2);
	});
});
