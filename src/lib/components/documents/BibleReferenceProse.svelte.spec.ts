import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BibleReferenceProse from './BibleReferenceProse.svelte';

describe('BibleReferenceProse', () => {
	afterEach(() => vi.unstubAllGlobals());

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
});
