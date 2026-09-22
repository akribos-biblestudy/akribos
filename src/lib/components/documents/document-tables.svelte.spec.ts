import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { addColumnAfter, addRowBefore, deleteRow, deleteColumn } from '@tiptap/pm/tables';
import { documentHtmlToMarkdown, documentMarkdownToHtml } from '$lib/notes/document-markdown';
import { DocumentTables, alignDocumentTableColumn } from './document-tables';
import { DocumentFootnotes, editorFootnotes } from './document-footnotes';

const instances: Editor[] = [];
function editor(markdown = '') {
	const host = document.createElement('div');
	document.body.append(host);
	const current = new Editor({
		element: host,
		extensions: [
			...DocumentFootnotes,
			...DocumentTables,
			StarterKit.configure({ trailingNode: { node: 'paragraph', notAfter: ['footnoteList'] } })
		],
		content: documentMarkdownToHtml(markdown).html
	});
	instances.push(current);
	return current;
}
afterEach(() => {
	for (const current of instances.splice(0)) {
		const host = current.options.element as HTMLElement;
		current.destroy();
		host.remove();
	}
});
function selectCell(current: Editor, index: number) {
	const cells: number[] = [];
	current.state.doc.descendants((node, position) => {
		if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cells.push(position);
	});
	current.commands.setTextSelection(cells[index]! + 2);
}
function key(current: Editor, name: string, shiftKey = false) {
	current.view.dom.dispatchEvent(
		new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true })
	);
}
const source =
	'| Älteste | Diakone | Diakoninnen |\n| :--- | :---: | ---: |\n| **Untadelig**[^a] | Treu | |\n| Gastfrei | | Nüchtern[^b] |\n\n[^a]: Erste Erklärung.\n\n[^b]: Zweite Erklärung.\n';

describe('editable portable tables', () => {
	it('inserts an empty 3 by 3 table in one undo step and keeps every empty cell on reload', () => {
		const current = editor();
		expect(current.commands.insertDocumentTable()).toBe(true);
		expect(current.view.dom.querySelectorAll('th')).toHaveLength(3);
		expect(current.view.dom.querySelectorAll('td')).toHaveLength(6);
		// Its structure must survive serialization even though Tiptap considers the text empty.
		expect(current.isEmpty).toBe(true);
		expect(current.state.selection.$from.node(-1).type.name).toBe('tableHeader');
		const markdown = documentHtmlToMarkdown(current.getHTML());
		expect(editor(markdown).view.dom.querySelectorAll('th,td')).toHaveLength(9);
		expect(current.commands.undo()).toBe(true);
		expect(current.view.dom.querySelector('table')).toBeNull();
		expect(current.commands.redo()).toBe(true);
		expect(current.view.dom.querySelectorAll('th,td')).toHaveLength(9);
	});

	it('edits cells, rows and columns while preserving two footnotes and GFM alignment', () => {
		const current = editor(source);
		selectCell(current, 4);
		current.commands.insertContent('Sehr ');
		expect(addColumnAfter(current.state, current.view.dispatch)).toBe(true);
		expect(current.view.dom.querySelectorAll('th')).toHaveLength(4);
		expect(deleteColumn(current.state, current.view.dispatch)).toBe(true);
		expect(current.view.dom.querySelectorAll('th')).toHaveLength(3);
		selectCell(current, 0);
		expect(addRowBefore(current.state, current.view.dispatch)).toBe(true);
		expect(current.view.dom.querySelectorAll('th')).toHaveLength(3);
		expect(deleteRow(current.state, current.view.dispatch)).toBe(true);
		expect(current.view.dom.querySelectorAll('th')).toHaveLength(3);
		selectCell(current, 0);
		expect(alignDocumentTableColumn('right')(current.state, current.view.dispatch)).toBe(true);
		expect(current.view.dom.querySelectorAll('tr > :first-child[align="right"]')).toHaveLength(3);
		const markdown = documentHtmlToMarkdown(current.getHTML());
		const reloaded = editor(markdown);
		expect(reloaded.view.dom.querySelectorAll('th,td')).toHaveLength(9);
		expect(editorFootnotes(reloaded.state.doc)).toHaveLength(2);
		expect(reloaded.state.doc.textContent).toContain('Erste Erklärung.');
		expect(reloaded.state.doc.textContent).toContain('Zweite Erklärung.');
	});

	it('uses Enter for cell line breaks and Tab/Shift-Tab for navigation, extending at the last cell', () => {
		const current = editor('| A | B |\n| --- | --- |\n| Eins | Zwei |');
		selectCell(current, 2);
		current.commands.insertContent('Vor');
		key(current, 'Enter');
		expect(current.view.dom.querySelector('td br')).not.toBeNull();
		const markdown = documentHtmlToMarkdown(current.getHTML());
		expect(markdown).toContain('Vor<br>Eins');
		key(current, 'Tab');
		expect(current.state.selection.$from.parent.textContent).toBe('Zwei');
		key(current, 'Tab');
		expect(current.view.dom.querySelectorAll('tr')).toHaveLength(3);
		key(current, 'Tab', true);
		expect(current.state.selection.$from.parent.textContent).toBe('Zwei');
	});
});
