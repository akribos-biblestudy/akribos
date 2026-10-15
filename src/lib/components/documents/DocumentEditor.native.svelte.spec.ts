import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../routes/layout.css';
import DocumentEditor from './DocumentEditor.svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
const original = {
	id: 'c37e5bab-2992-4ef7-a935-ec1bf8358c37',
	title: 'Original',
	bodyMarkdown: '* Erster\n\n    * Zweiter\n\n> Ein Zitat\n>\n> Zwei Absätze\n',
	revision: 5
};
function fetchStub(conflict = false) {
	const patches: Record<string, unknown>[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn<typeof fetch>(async (_input, init) => {
			if (init?.method !== 'PATCH') return Response.json({ incoming: [], outgoing: [] });
			const body = JSON.parse(String(init.body));
			patches.push(body);
			return conflict
				? Response.json({ error: 'conflict' }, { status: 409 })
				: Response.json({
						document: {
							...original,
							title: body.title,
							bodyMarkdown: body.markdown,
							revision: Number(body.revision) + 1
						}
					});
		})
	);
	return patches;
}
describe('actual web editor inside the native host', () => {
	it('emits dirty and acknowledged autosave snapshots without the optional web onState callback', async () => {
		fetchStub();
		const onAppSnapshot = vi.fn();
		await render(DocumentEditor, {
			document: { ...original, bodyMarkdown: 'Start' },
			appEmbedded: true,
			compact: true,
			onAppSnapshot
		});
		await page.getByTestId('reader-notes-sidecar-body').click();
		await userEvent.keyboard('{Control>}{End}{/Control} neu');
		await expect
			.poll(() =>
				onAppSnapshot.mock.calls.some(
					([state]) => state.snapshot.status === 'dirty' && state.snapshot.markdown.includes('neu')
				)
			)
			.toBe(true);
		await expect
			.poll(() =>
				onAppSnapshot.mock.calls.some(
					([state]) =>
						state.snapshot.status === 'saved' &&
						state.savedSnapshot.revision === 6 &&
						state.savedSnapshot.markdown.includes('neu')
				)
			)
			.toBe(true);
	});
	it('keeps original Markdown and the same editing DOM on read toggles without PATCH or duplicate tools', async () => {
		const patches = fetchStub();
		const screen = await render(DocumentEditor, {
			document: original,
			appEmbedded: true,
			compact: true,
			readOnly: true
		});
		const editable = screen.container.querySelector<HTMLElement>('.tiptap')!;
		expect(editable.contentEditable).toBe('false');
		expect(screen.container.querySelector('input#document-title')).toBeNull();
		expect(screen.container.querySelector('.editor-toolbar')).toBeNull();
		expect(screen.container.querySelector('[role=tablist]')).toBeNull();
		await screen.rerender({ readOnly: false });
		expect(editable.contentEditable).toBe('true');
		await screen.rerender({ readOnly: true });
		expect(screen.container.querySelector('.tiptap')).toBe(editable);
		expect(screen.component.appSnapshot().snapshot).toMatchObject({
			markdown: original.bodyMarkdown,
			revision: 5,
			status: 'saved'
		});
		expect(screen.component.appInsert('table')).toBe(false);
		expect(await screen.component.flush()).toBe(true);
		expect(patches).toHaveLength(0);
	});
	it('flush captures the latest actual keystroke and metadata acknowledgements retain editor undo', async () => {
		const patches = fetchStub();
		const screen = await render(DocumentEditor, {
			document: { ...original, bodyMarkdown: 'Anfang' },
			appEmbedded: true,
			compact: true
		});
		const editable = screen.container.querySelector<HTMLElement>('.tiptap')!;
		await page.getByTestId('reader-notes-sidecar-body').click();
		await userEvent.keyboard('{Control>}{End}{/Control} aktuell');
		expect(screen.component.appSnapshot().snapshot.markdown).toContain('aktuell');
		expect(await screen.component.flush()).toBe(true);
		expect(patches.at(-1)?.markdown).toContain('aktuell');
		const current = screen.component.appSnapshot().snapshot;
		screen.component.appAcknowledge({
			title: current.title,
			markdown: current.markdown,
			revision: current.revision + 1
		});
		await screen.rerender({ readOnly: true });
		await screen.rerender({ readOnly: false });
		expect(screen.container.querySelector('.tiptap')).toBe(editable);
		expect(screen.component.appCommand('undo')).toBe(true);
		expect(screen.component.appSnapshot().snapshot.markdown).not.toContain('aktuell');
	});
	it('restores stale drafts without autosave or revision rebasing and preserves them after 409', async () => {
		await page.viewport(390, 844);
		const patches = fetchStub(true);
		const screen = await render(DocumentEditor, {
			document: original,
			appEmbedded: true,
			compact: true,
			readOnly: true
		});
		const draft = { title: 'Lokal', markdown: 'Nicht gespeicherter Entwurf\r\n', revision: 2 };
		screen.component.appRestore(draft);
		expect(screen.component.appSnapshot()).toMatchObject({
			snapshot: { ...draft, status: 'dirty' },
			savedSnapshot: { revision: 5, markdown: original.bodyMarkdown }
		});
		expect(patches).toHaveLength(0);
		await screen.rerender({ readOnly: false });
		expect(await screen.component.flush()).toBe(false);
		expect(patches).toEqual([{ title: draft.title, markdown: draft.markdown, revision: 2 }]);
		expect(screen.component.appSnapshot().snapshot).toMatchObject({ ...draft, status: 'conflict' });
		screen.component.appPause(true);
		screen.component.appPause(false);
		expect(patches).toHaveLength(1);
	});
});
