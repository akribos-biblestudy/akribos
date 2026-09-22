import { Extension, Node, type Editor } from '@tiptap/core';
import { Plugin, TextSelection, type Command } from '@tiptap/pm/state';
import { addRowAfter, goToNextCell, tableEditing, TableMap } from '@tiptap/pm/tables';

export type TableAlignment = 'left' | 'center' | 'right';
const roles: Record<string, string> = {
	table: 'table',
	tableRow: 'row',
	tableCell: 'cell',
	tableHeader: 'header_cell'
};

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		documentTables: { insertDocumentTable: () => ReturnType };
	}
}

const Table = Node.create({
	name: 'table',
	group: 'block',
	content: 'tableRow+',
	isolating: true,
	parseHTML: () => [{ tag: 'table' }],
	renderHTML: () => ['table', ['tbody', 0]],
	extendNodeSchema: (extension) =>
		roles[extension.name] ? { tableRole: roles[extension.name] } : {},
	addCommands() {
		return {
			insertDocumentTable:
				() =>
				({ state, tr, dispatch }) => {
					if (insideTable(state.selection.$from)) return false;
					const { table, tableRow, tableHeader, tableCell, paragraph } = state.schema.nodes;
					if (!table || !tableRow || !tableHeader || !tableCell || !paragraph) return false;
					if (dispatch) {
						const node = table.create(
							null,
							Array.from({ length: 3 }, (_, row) =>
								tableRow.create(
									null,
									Array.from({ length: 3 }, () =>
										(row === 0 ? tableHeader : tableCell).create(null, paragraph.create())
									)
								)
							)
						);
						tr.replaceSelectionWith(node);
						const end = tr.selection.from;
						// Locate the inserted table, including insertion into a non-empty paragraph.
						let start: number | undefined;
						tr.doc.nodesBetween(Math.max(0, end - node.nodeSize - 2), end, (child, position) => {
							if (child.type === table && position + child.nodeSize >= end - 1) start = position;
						});
						if (start !== undefined) tr.setSelection(TextSelection.near(tr.doc.resolve(start + 3)));
						tr.scrollIntoView();
					}
					return true;
				}
		};
	}
});

const TableRow = Node.create({
	name: 'tableRow',
	content: '(tableCell | tableHeader)+',
	parseHTML: () => [{ tag: 'tr' }],
	renderHTML: () => ['tr', 0]
});

const TableCell = Node.create({
	name: 'tableCell',
	// One inline paragraph maps losslessly to a GFM cell. Enter inserts a portable hard break.
	content: 'paragraph',
	isolating: true,
	addAttributes() {
		return {
			colspan: { default: 1, rendered: false },
			rowspan: { default: 1, rendered: false },
			colwidth: { default: null, rendered: false },
			align: {
				default: null,
				parseHTML: (element) => {
					const value = element.getAttribute('align');
					return value && /^(left|center|right)$/.test(value) ? value : null;
				},
				renderHTML: (attributes) => (attributes.align ? { align: attributes.align } : {})
			}
		};
	},
	parseHTML: () => [{ tag: 'td' }],
	renderHTML: ({ HTMLAttributes }) => ['td', HTMLAttributes, 0]
});
const TableHeader = TableCell.extend({
	name: 'tableHeader',
	parseHTML: () => [{ tag: 'th' }],
	renderHTML: ({ HTMLAttributes }) => ['th', HTMLAttributes, 0]
});

function insideTable(position: Editor['state']['selection']['$from']): boolean {
	for (let depth = position.depth; depth > 0; depth--)
		if (position.node(depth).type.spec.tableRole === 'table') return true;
	return false;
}

const Editing = Extension.create({
	name: 'documentTableEditing',
	priority: 110,
	addProseMirrorPlugins: () => [
		tableEditing(),
		new Plugin({
			appendTransaction(transactions, _old, state) {
				if (!transactions.some((transaction) => transaction.docChanged)) return null;
				const tr = state.tr;
				// GFM has precisely one header row. Row insertion/deletion keeps that portable invariant.
				state.doc.descendants((node, position) => {
					if (node.type.name !== 'table') return;
					node.forEach((row, rowOffset, rowIndex) => {
						row.forEach((cell, cellOffset) => {
							const type = state.schema.nodes[rowIndex === 0 ? 'tableHeader' : 'tableCell']!;
							if (cell.type !== type)
								tr.setNodeMarkup(position + 2 + rowOffset + cellOffset, type, cell.attrs);
						});
					});
					return false;
				});
				return tr.docChanged ? tr : null;
			}
		})
	],
	addKeyboardShortcuts() {
		return {
			Tab: () => {
				const { state, view } = this.editor;
				if (goToNextCell(1)(state, view.dispatch)) return true;
				if (!insideTable(state.selection.$from)) return false;
				if (!addRowAfter(state, view.dispatch)) return false;
				return goToNextCell(1)(view.state, view.dispatch);
			},
			'Shift-Tab': () => goToNextCell(-1)(this.editor.state, this.editor.view.dispatch),
			Enter: () =>
				insideTable(this.editor.state.selection.$from) && this.editor.commands.setHardBreak()
		};
	}
});

export const DocumentTables = [Table, TableRow, TableCell, TableHeader, Editing];

export function runDocumentTableCommand(editor: Editor, command: Command): void {
	command(editor.state, editor.view.dispatch, editor.view);
	editor.commands.focus();
}

/** GFM alignment belongs to a whole column, never a single inconsistent cell. */
export function alignDocumentTableColumn(align: TableAlignment): Command {
	return (state, dispatch) => {
		const { $from } = state.selection;
		for (let depth = $from.depth; depth > 0; depth--) {
			const table = $from.node(depth);
			if (table.type.spec.tableRole !== 'table') continue;
			const start = $from.start(depth);
			const map = TableMap.get(table);
			if ($from.depth < depth + 2) return false;
			const cell = $from.before(depth + 2) - start;
			const column = map.findCell(cell).left;
			if (dispatch) {
				const tr = state.tr;
				for (let row = 0; row < map.height; row++) {
					const position = start + map.map[row * map.width + column]!;
					const node = tr.doc.nodeAt(position)!;
					tr.setNodeMarkup(position, undefined, { ...node.attrs, align });
				}
				dispatch(tr);
			}
			return true;
		}
		return false;
	};
}
