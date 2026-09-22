import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { documentHtmlToMarkdown, documentMarkdownToHtml } from '$lib/notes/document-markdown';
import { StarterKit } from '@tiptap/starter-kit';
import {
	DocumentFootnotes,
	editorFootnotes,
	footnoteClipboardHtml,
	prepareFootnotePasteHtml
} from './document-footnotes';

const instances: Editor[] = [];
const hosts: HTMLElement[] = [];
function editor(content = '<p>Ein Gedanke.</p>') {
	const host = document.createElement('div');
	document.body.append(host);
	hosts.push(host);
	const instance = new Editor({
		element: host,
		extensions: [
			...DocumentFootnotes,
			StarterKit.configure({ trailingNode: { node: 'paragraph', notAfter: ['footnoteList'] } })
		],
		content
	});
	instances.push(instance);
	return instance;
}

const noteHtml =
	'<p>Ein Gedanke<sup data-footnote-ref="quelle">1</sup>, nochmals<sup data-footnote-ref="quelle">1</sup>.</p><ol data-footnotes="true"><li data-footnote-id="quelle"><p>Eine <strong>Quelle</strong>.</p><p>Joh 3,16</p></li></ol>';

afterEach(() => {
	for (const instance of instances.splice(0)) instance.destroy();
	for (const host of hosts.splice(0)) host.remove();
});

describe('document footnotes in the real Tiptap editor', () => {
	it('parses editable definitions before normal list items and preserves repeated references', () => {
		const current = editor(noteHtml + '<ol><li><p>Normale Liste</p></li></ol>');
		const notes = editorFootnotes(current.state.doc);
		expect(notes).toHaveLength(1);
		expect(notes[0]!.references).toHaveLength(2);
		expect(notes[0]!.definition.childCount).toBe(2);
		expect(notes[0]!.definition.firstChild!.child(1).marks[0]!.type.name).toBe('bold');
		expect(current.getJSON().content?.some((node) => node.type === 'orderedList')).toBe(true);
		expect(current.getHTML()).toContain('data-footnote-ref="quelle"');
		expect(current.getHTML()).not.toMatch(/tabindex|role=|value=|aria-/);
	});

	it('inserts a reference and definition in one undo step without replacing selected text', () => {
		const current = editor();
		current.commands.setTextSelection({ from: 1, to: 4 });
		expect(current.commands.insertDocumentFootnote()).toBe(true);
		const note = editorFootnotes(current.state.doc)[0]!;
		expect(note.id).toMatch(/^fn_[a-f0-9-]+$/);
		expect(current.state.doc.textContent).toBe('Ein Gedanke.');
		expect(current.state.selection.$from.parent.type.name).toBe('paragraph');
		expect(current.state.selection.$from.node(-1).type.name).toBe('footnoteDefinition');
		expect(current.commands.undo()).toBe(true);
		expect(current.getHTML()).toBe('<p>Ein Gedanke.</p>');
		expect(current.commands.redo()).toBe(true);
		expect(editorFootnotes(current.state.doc)[0]!.id).toBe(note.id);
	});

	it('renumbers by first reference while keeping IDs and rich definition text', () => {
		const current = editor(noteHtml);
		current.commands.setTextSelection(1);
		current.commands.insertDocumentFootnote();
		let notes = editorFootnotes(current.state.doc);
		expect(notes.map((note) => note.number)).toEqual([1, 2]);
		expect(notes[1]!.id).toBe('quelle');
		expect(current.view.dom.querySelector('sup[data-footnote-ref="quelle"]')?.textContent).toBe(
			'2'
		);
		expect(
			current.view.dom.querySelector<HTMLLIElement>('li[data-footnote-id="quelle"]')?.value
		).toBe(2);
		current.commands.undo();
		notes = editorFootnotes(current.state.doc);
		expect(notes[0]!.id).toBe('quelle');
		expect(notes[0]!.number).toBe(1);
		expect(notes[0]!.definition.textContent).toBe('Eine Quelle.Joh 3,16');
	});

	it('removes only the selected repeated reference, and removes the definition with the final reference', () => {
		const current = editor(noteHtml);
		const second = editorFootnotes(current.state.doc)[0]!.references[1]!;
		current.commands.focusDocumentFootnote('quelle', second);
		current.commands.removeDocumentFootnoteReference('quelle');
		expect(editorFootnotes(current.state.doc)[0]!.references).toHaveLength(1);
		expect(current.state.doc.textContent).toContain('Eine Quelle.');
		current.commands.removeDocumentFootnoteReference('quelle');
		expect(editorFootnotes(current.state.doc)).toHaveLength(0);
		expect(current.getHTML()).not.toContain('data-footnote');
		current.commands.undo();
		expect(editorFootnotes(current.state.doc)[0]!.references).toHaveLength(1);
		expect(current.getHTML()).toContain('<strong>Quelle</strong>');
	});

	it('maps the return position through edits and preserves orphan definitions after ordinary deletion', () => {
		const current = editor(noteHtml);
		const second = editorFootnotes(current.state.doc)[0]!.references[1]!;
		current.commands.focusDocumentFootnote('quelle', second);
		current.view.dispatch(current.state.tr.insertText('Vorsatz: ', 1));
		current.commands.returnFromDocumentFootnote('quelle');
		expect(current.state.selection.from).toBe(second + 10);
		const positions = editorFootnotes(current.state.doc)[0]!.references;
		const tr = current.state.tr;
		for (const position of [...positions].reverse()) tr.delete(position, position + 1);
		current.view.dispatch(tr);
		expect(editorFootnotes(current.state.doc)[0]!.references).toHaveLength(0);
		expect(current.getHTML()).toContain('<strong>Quelle</strong>');
		current.commands.setTextSelection(1);
		current.commands.insertDocumentFootnote('quelle');
		expect(editorFootnotes(current.state.doc)[0]!.references).toHaveLength(1);
	});

	it('prevents nested footnotes and code references while keeping the definition editable', () => {
		const current = editor(noteHtml);
		current.commands.focusDocumentFootnote('quelle');
		expect(current.can().insertDocumentFootnote()).toBe(false);
		current.commands.insertContent('Ergänzung ');
		expect(current.getHTML()).toContain('Ergänzung Eine');
		current.commands.setContent('<pre><code>Code</code></pre>');
		current.commands.setTextSelection(2);
		expect(current.can().insertDocumentFootnote()).toBe(false);
	});

	it('copies needed definitions and remaps conflicting IDs as one incoming group', () => {
		const source = editor(noteHtml);
		const reference = editorFootnotes(source.state.doc)[0]!.references[0]!;
		source.commands.setTextSelection({ from: 1, to: reference + 1 });
		const html = footnoteClipboardHtml(source, source.state.selection.content())!;
		expect(html).toContain('data-footnote-ref="quelle"');
		expect(html).toContain('<strong>Quelle</strong>');
		const target = editor(noteHtml.replace('Eine <strong>Quelle</strong>.', 'Andere Quelle.'));
		const prepared = prepareFootnotePasteHtml(target, html);
		const holder = document.createElement('div');
		holder.innerHTML = prepared;
		const newId = holder.querySelector('sup')!.getAttribute('data-footnote-ref');
		expect(newId).not.toBe('quelle');
		expect(holder.querySelector('li')!.getAttribute('data-footnote-id')).toBe(newId);
		target.commands.setTextSelection(1);
		target.commands.insertContent(prepared);
		expect(editorFootnotes(target.state.doc)).toHaveLength(2);
		expect(target.view.dom.querySelectorAll('ol[data-footnotes]')).toHaveLength(1);
		expect(target.state.doc.textContent).toContain('Andere Quelle.');
		expect(target.state.doc.textContent).toContain('Eine Quelle.');
		target.commands.undo();
		expect(editorFootnotes(target.state.doc)).toHaveLength(1);
		expect(target.state.doc.textContent).not.toContain('Eine Quelle.');
		expect(target.state.doc.textContent).toContain('Andere Quelle.');
	});

	it('reuses a matching copied definition without duplicating it', () => {
		const current = editor(noteHtml);
		const prepared = prepareFootnotePasteHtml(current, noteHtml);
		expect(prepared).not.toContain('data-footnote-id');
		expect(prepared).toContain('data-footnote-ref="quelle"');
		current.commands.setTextSelection(1);
		current.commands.insertContent(prepared);
		expect(editorFootnotes(current.state.doc)).toHaveLength(1);
		expect(editorFootnotes(current.state.doc)[0]!.references).toHaveLength(4);
	});
	it('preserves a copied definition without a reference as its own unreferenced note', () => {
		const current = editor(noteHtml);
		const definitionOnly = noteHtml.slice(noteHtml.indexOf('<ol'));
		const prepared = prepareFootnotePasteHtml(current, definitionOnly);
		expect(prepared).toContain('<strong>Quelle</strong>');
		expect(prepared).not.toContain('data-footnote-id="quelle"');
		current.commands.setTextSelection(1);
		current.commands.insertContent(prepared);
		const notes = editorFootnotes(current.state.doc);
		expect(notes).toHaveLength(2);
		expect(notes[0]!.references).toHaveLength(2);
		expect(notes[1]!.references).toHaveLength(0);
		expect(notes[1]!.definition.textContent).toBe('Eine Quelle.Joh 3,16');
		current.commands.undo();
		expect(editorFootnotes(current.state.doc)).toHaveLength(1);
	});

	it('round-trips rich, repeated and empty footnotes through the actual Markdown pipeline', () => {
		const markdown =
			'Text[^quelle] und nochmals[^quelle].\n\n[^quelle]: Eine **Quelle**.\n\n    Zweiter Absatz zu Joh 3,16.\n';
		const current = editor(documentMarkdownToHtml(markdown).html);
		const stable = documentHtmlToMarkdown(current.getHTML());
		current.commands.setContent(documentMarkdownToHtml(stable).html);
		expect(editorFootnotes(current.state.doc)[0]!.id).toBe('quelle');
		expect(editorFootnotes(current.state.doc)[0]!.references).toHaveLength(2);
		expect(current.getHTML()).toContain('<strong>Quelle</strong>');
		expect(documentHtmlToMarkdown(current.getHTML())).toBe(stable);
		current.commands.setTextSelection(1);
		current.commands.insertDocumentFootnote();
		const emptyId = editorFootnotes(current.state.doc)[0]!.id;
		const withEmpty = documentHtmlToMarkdown(current.getHTML());
		expect(withEmpty).toContain(`[^${emptyId}]:`);
		current.commands.setContent(documentMarkdownToHtml(withEmpty).html);
		expect(
			editorFootnotes(current.state.doc).find((note) => note.id === emptyId)?.references
		).toHaveLength(1);
	});
});
