import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../routes/layout.css';
import DocumentEditor from './DocumentEditor.svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function firstGlyph(element: HTMLElement): DOMRect {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	let text: Node | null;
	while ((text = walker.nextNode())) {
		if (!text.textContent?.trim()) continue;
		const range = document.createRange();
		range.setStart(text, 0);
		range.setEnd(text, 1);
		return range.getBoundingClientRect();
	}
	throw new Error('Expected visible text.');
}

function visibility(element: HTMLElement, host: HTMLElement) {
	const glyph = firstGlyph(element);
	const viewport = host.getBoundingClientRect();
	return {
		top: Math.round(glyph.top),
		bottom: Math.round(glyph.bottom),
		hostTop: Math.round(viewport.top),
		hostBottom: Math.round(viewport.bottom)
	};
}

function fullyVisible(element: HTMLElement, host: HTMLElement): boolean {
	const box = visibility(element, host);
	return box.top >= box.hostTop && box.bottom <= Math.min(box.hostBottom, window.innerHeight);
}

describe('DocumentEditor footnote navigation', () => {
	it('reveals the editable definition and the exact return reference after layout settles in mobile Zen', async () => {
		await page.viewport(390, 844);
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				new Response(JSON.stringify({ incoming: [], outgoing: [] }), {
					headers: { 'content-type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const bodyMarkdown =
			'## Gemeinsam Verantwortung tragen\n\nDie Hauptaufgaben der Ältesten umfassen Fürsorge, Lehre und geistliche Begleitung.[^quelle] Entscheidend bleibt, dass Menschen in der Gemeinschaft Jesus nachfolgen.[^juenger]\n\nEine zweite Bezugnahme verwendet dieselbe Quellenangabe.[^quelle]\n\n[^quelle]: Nach William MacDonald: **Christus und die Gemeinde**. Die Verantwortung wird gemeinsam getragen.\n\n    Die Anmerkung kann mehrere Absätze enthalten und ebenso auf Joh 3,16 verweisen.\n\n[^juenger]: Vgl. *Johannes 8,31*. Eine ergänzende Bemerkung.\n';
		const screen = await render(DocumentEditor, {
			document: {
				id: 'a8b566fb-77c4-4b4a-ae67-8e019282dbec',
				title: 'Die Hauptaufgaben der Ältesten',
				bodyMarkdown,
				revision: 1
			},
			compact: true
		});
		screen.container.classList.add('reading-preferences');
		screen.container.style.cssText = '--reader-font-scale:1.4;height:844px;width:390px';
		await page.getByRole('button', { name: 'Zen-Modus', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Zen-Modus', exact: true }).element();
		const host = dialog.querySelector<HTMLElement>('.editor-host')!;
		const references = dialog.querySelectorAll<HTMLElement>('sup[data-footnote-ref]');
		expect(references).toHaveLength(3);
		expect(dialog.querySelectorAll('li[data-footnote-id]')).toHaveLength(2);
		references[0]!.click();
		const definition = dialog.querySelector<HTMLElement>('li[data-footnote-id="quelle"] p')!;
		await expect
			.poll(
				() => ({
					visible: fullyVisible(definition, host),
					...visibility(definition, host),
					scrollTop: host.scrollTop,
					scrollHeight: host.scrollHeight,
					clientHeight: host.clientHeight
				}),
				{
					message: 'Definition first line must be visible after the contextual toolbar appears.'
				}
			)
			.toMatchObject({ visible: true });
		expect(getComputedStyle(dialog.querySelector('.document-prose')!).fontSize).toBe('23.8px');
		await page.getByRole('button', { name: 'Zur Textstelle', exact: true }).click();
		await expect
			.poll(() => fullyVisible(references[0]!, host), {
				message: 'The chosen repeated reference must be visible after its toolbar disappears.'
			})
			.toBe(true);
		await expect
			.poll(() => references[0]!.closest('p')!.contains(window.getSelection()?.anchorNode ?? null))
			.toBe(true);
		expect(
			fetchMock.mock.calls.every(
				(call) => call.length < 2 || (call[1] as RequestInit)?.method !== 'PATCH'
			)
		).toBe(true);
	});
});
