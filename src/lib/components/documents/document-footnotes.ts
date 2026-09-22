import { Node as TiptapNode, type Editor } from '@tiptap/core';
import {
	Fragment,
	DOMParser as ProseMirrorDOMParser,
	DOMSerializer,
	type Node as ProseMirrorNode,
	type Slice
} from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import {
	NodeSelection,
	Plugin,
	PluginKey,
	TextSelection,
	type EditorState,
	type Transaction
} from '@tiptap/pm/state';
import { isDocumentFootnoteId } from '$lib/notes/document-footnotes';
import { t } from '$lib/i18n';

export type EditorFootnote = {
	id: string;
	number: number;
	definition: ProseMirrorNode;
	position: number;
	references: number[];
};

type FootnoteBookmark = { id: string; position: number } | null;
const footnoteKey = new PluginKey<FootnoteBookmark>('documentFootnotes');
const referenceName = 'footnoteReference';
const listName = 'footnoteList';
const definitionName = 'footnoteDefinition';
export const documentFootnoteNavigationMeta = 'documentFootnoteNavigation';

/** Numbers follow first use; unreferenced definitions remain available instead of losing text on cut. */
export function editorFootnotes(doc: ProseMirrorNode): EditorFootnote[] {
	const definitions = new Map<string, EditorFootnote>();
	doc.descendants((node, position) => {
		if (node.type.name !== definitionName) return;
		if (!definitions.has(node.attrs.id))
			definitions.set(node.attrs.id, {
				id: node.attrs.id,
				number: 0,
				definition: node,
				position,
				references: []
			});
		return false;
	});
	const order: EditorFootnote[] = [];
	doc.descendants((node, position) => {
		if (node.type.name === definitionName) return false;
		if (node.type.name !== referenceName) return;
		const note = definitions.get(node.attrs.id);
		if (!note) return;
		if (!note.references.length) order.push(note);
		note.references.push(position);
	});
	for (const note of definitions.values()) if (!note.references.length) order.push(note);
	return order.map((note, index) => ({ ...note, number: index + 1 }));
}

export function selectedEditorFootnote(state: EditorState): EditorFootnote | undefined {
	const { selection } = state;
	let id: string | undefined;
	if (selection instanceof NodeSelection && selection.node.type.name === referenceName)
		id = selection.node.attrs.id;
	for (let depth = selection.$from.depth; depth > 0 && !id; depth -= 1) {
		const node = selection.$from.node(depth);
		if (node.type.name === definitionName) id = node.attrs.id;
	}
	return id ? editorFootnotes(state.doc).find((note) => note.id === id) : undefined;
}

function canInsert(state: EditorState): boolean {
	if (!state.selection.$to.parent.inlineContent || state.selection.$to.parent.type.spec.code)
		return false;
	for (let depth = state.selection.$to.depth; depth > 0; depth -= 1)
		if (state.selection.$to.node(depth).type.name === definitionName) return false;
	return !state.selection.$to.marks().some((mark) => mark.type.name === 'code');
}

function renumber(tr: Transaction): Transaction {
	const lists: { position: number; node: ProseMirrorNode }[] = [];
	tr.doc.forEach((node, position) => {
		if (node.type.name === listName) lists.push({ node, position });
	});
	if (lists.length > 1) {
		tr.setMeta('documentFootnotesMerged', true);
		const definitions = lists.flatMap(({ node }) =>
			Array.from({ length: node.childCount }, (_, index) => node.child(index))
		);
		for (const { node, position } of [...lists].reverse())
			tr.delete(position, position + node.nodeSize);
		tr.insert(tr.doc.content.size, tr.doc.type.schema.nodes[listName]!.create(null, definitions));
	}
	for (const note of editorFootnotes(tr.doc)) {
		for (const position of [...note.references, note.position]) {
			const node = tr.doc.nodeAt(position)!;
			if (node.attrs.number !== note.number)
				tr.setNodeMarkup(position, undefined, { ...node.attrs, number: note.number });
		}
	}
	return tr;
}

function referencePosition(state: EditorState, note: EditorFootnote): number | undefined {
	const bookmark = footnoteKey.getState(state);
	return bookmark?.id === note.id && note.references.includes(bookmark.position)
		? bookmark.position
		: note.references.includes(state.selection.from)
			? state.selection.from
			: note.references[0];
}

function addDefinition(tr: Transaction, definition: ProseMirrorNode): void {
	let list: { node: ProseMirrorNode; position: number } | undefined;
	tr.doc.forEach((node, position) => {
		if (!list && node.type.name === listName) list = { node, position };
	});
	if (list) tr.insert(list.position + list.node.nodeSize - 1, definition);
	else tr.insert(tr.doc.content.size, tr.doc.type.schema.nodes[listName]!.create(null, definition));
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		documentFootnotes: {
			insertDocumentFootnote: (id?: string) => ReturnType;
			focusDocumentFootnote: (id: string, sourcePosition?: number) => ReturnType;
			returnFromDocumentFootnote: (id: string) => ReturnType;
			removeDocumentFootnoteReference: (id: string) => ReturnType;
		};
	}
}

export const DocumentFootnoteReference = TiptapNode.create({
	name: referenceName,
	priority: 1000,
	inline: true,
	group: 'inline',
	atom: true,
	selectable: true,
	marks: '',
	addAttributes: () => ({
		id: { default: null, rendered: false },
		number: { default: 1, rendered: false }
	}),
	parseHTML: () => [
		{
			tag: 'sup[data-footnote-ref]',
			getAttrs: (element) => {
				const id = element.getAttribute('data-footnote-ref');
				return isDocumentFootnoteId(id) ? { id, number: Number(element.textContent) || 1 } : false;
			}
		}
	],
	renderHTML: ({ node }) => [
		'sup',
		{ 'data-footnote-ref': node.attrs.id },
		String(node.attrs.number)
	],
	addNodeView() {
		return ({ node, getPos, editor }) => {
			const dom = document.createElement('sup');
			dom.tabIndex = 0;
			dom.setAttribute('role', 'button');
			const update = (next: ProseMirrorNode) => {
				if (next.type.name !== referenceName) return false;
				node = next;
				dom.dataset.footnoteRef = node.attrs.id;
				dom.textContent = String(node.attrs.number);
				dom.setAttribute(
					'aria-label',
					t('documents.footnotes.edit', { number: node.attrs.number })
				);
				return true;
			};
			update(node);
			const open = (event: Event) => {
				event.preventDefault();
				editor.commands.focusDocumentFootnote(node.attrs.id, getPos());
			};
			dom.addEventListener('click', open);
			dom.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') open(event);
			});
			return {
				dom,
				update,
				stopEvent: (event) => event.type === 'click' || event.type === 'keydown'
			};
		};
	},
	addCommands() {
		return {
			insertDocumentFootnote:
				(existingId) =>
				({ state, tr, dispatch }) => {
					if (!canInsert(state)) return false;
					if (existingId && !editorFootnotes(tr.doc).some((note) => note.id === existingId))
						return false;
					if (!dispatch) return true;
					const id = existingId ?? `fn_${crypto.randomUUID()}`;
					const position = tr.selection.to;
					tr.insert(position, this.type.create({ id }));
					if (!existingId)
						addDefinition(
							tr,
							state.schema.nodes[definitionName]!.create(
								{ id },
								state.schema.nodes.paragraph!.create()
							)
						);
					renumber(tr);
					const note = editorFootnotes(tr.doc).find((note) => note.id === id)!;
					tr.setMeta(footnoteKey, { id, position });
					tr.setSelection(
						TextSelection.create(tr.doc, existingId ? position + 1 : note.position + 2)
					);
					closeHistory(tr).setMeta(documentFootnoteNavigationMeta, true).scrollIntoView();
					return true;
				},
			focusDocumentFootnote:
				(id, sourcePosition) =>
				({ state, tr, dispatch }) => {
					const note = editorFootnotes(tr.doc).find((note) => note.id === id);
					if (!note) return false;
					if (dispatch) {
						const position = sourcePosition ?? referencePosition(state, note);
						if (position !== undefined) tr.setMeta(footnoteKey, { id, position });
						tr.setSelection(TextSelection.create(tr.doc, note.position + 2))
							.setMeta(documentFootnoteNavigationMeta, true)
							.scrollIntoView();
						this.editor.view.focus();
					}
					return true;
				},
			returnFromDocumentFootnote:
				(id) =>
				({ state, tr, dispatch }) => {
					const note = editorFootnotes(tr.doc).find((note) => note.id === id);
					const position = note && referencePosition(state, note);
					if (position === undefined) return false;
					if (dispatch)
						tr.setSelection(TextSelection.create(tr.doc, position + 1))
							.setMeta(documentFootnoteNavigationMeta, true)
							.scrollIntoView();
					return true;
				},
			removeDocumentFootnoteReference:
				(id) =>
				({ state, tr, dispatch }) => {
					const note = editorFootnotes(tr.doc).find((note) => note.id === id);
					if (!note) return false;
					if (!dispatch) return true;
					const sourcePosition = referencePosition(state, note);
					const removals: { from: number; to: number }[] = [];
					if (sourcePosition !== undefined)
						removals.push({ from: sourcePosition, to: sourcePosition + 1 });
					if (note.references.length < 2) {
						const parent = tr.doc.resolve(note.position).parent;
						const onlyDefinition = parent.type.name === listName && parent.childCount === 1;
						removals.push({
							from: note.position - (onlyDefinition ? 1 : 0),
							to: note.position + note.definition.nodeSize + (onlyDefinition ? 1 : 0)
						});
					}
					for (const { from, to } of removals.sort((left, right) => right.from - left.from))
						tr.delete(from, to);
					renumber(tr);
					if (sourcePosition !== undefined)
						tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(sourcePosition))));
					closeHistory(tr).setMeta(documentFootnoteNavigationMeta, true).scrollIntoView();
					return true;
				}
		};
	},
	addKeyboardShortcuts() {
		return { 'Mod-Alt-f': () => this.editor.commands.insertDocumentFootnote() };
	},
	addProseMirrorPlugins() {
		return [
			new Plugin<FootnoteBookmark>({
				key: footnoteKey,
				state: {
					init: () => null,
					apply: (tr, previous) => {
						const next = tr.getMeta(footnoteKey) as FootnoteBookmark | undefined;
						if (next !== undefined) return next;
						if (!previous) return null;
						const mapped = tr.mapping.mapResult(previous.position);
						return mapped.deleted ? null : { ...previous, position: mapped.pos };
					}
				},
				props: { transformPastedHTML: (html) => prepareFootnotePasteHtml(this.editor, html) },
				appendTransaction: (transactions, _oldState, state) => {
					if (!transactions.some((tr) => tr.docChanged)) return null;
					const tr = renumber(state.tr);
					return tr.docChanged
						? tr.getMeta('documentFootnotesMerged')
							? tr
							: tr.setMeta('addToHistory', false)
						: null;
				}
			})
		];
	}
});

export const DocumentFootnoteList = TiptapNode.create({
	name: listName,
	// Keep paragraph as the schema's default block; the parse rule still wins over orderedList.
	priority: 99,
	group: 'block',
	content: 'footnoteDefinition+',
	isolating: true,
	parseHTML: () => [{ tag: 'ol[data-footnotes="true"]', priority: 1000 }],
	renderHTML: () => ['ol', { 'data-footnotes': 'true' }, 0]
});

export const DocumentFootnoteDefinition = TiptapNode.create({
	name: definitionName,
	priority: 1000,
	content: 'paragraph block*',
	defining: true,
	addAttributes: () => ({
		id: { default: null, rendered: false },
		number: { default: 1, rendered: false }
	}),
	parseHTML: () => [
		{
			tag: 'li[data-footnote-id]',
			getAttrs: (element) => {
				const id = element.getAttribute('data-footnote-id');
				return isDocumentFootnoteId(id)
					? { id, number: Array.from(element.parentElement?.children ?? []).indexOf(element) + 1 }
					: false;
			}
		}
	],
	renderHTML: ({ node }) => ['li', { 'data-footnote-id': node.attrs.id }, 0],
	addNodeView() {
		return ({ node }) => {
			const dom = document.createElement('li');
			const update = (next: ProseMirrorNode) => {
				if (next.type.name !== definitionName) return false;
				dom.dataset.footnoteId = next.attrs.id;
				dom.value = next.attrs.number;
				return true;
			};
			update(node);
			return { dom, contentDOM: dom, update };
		};
	}
});

export const DocumentFootnotes = [
	DocumentFootnoteReference,
	DocumentFootnoteList,
	DocumentFootnoteDefinition
];

/** Include definitions with copied references; IDs never depend on their visual numbering. */
export function footnoteClipboardHtml(editor: Editor, slice: Slice): string | null {
	const references = new Set<string>();
	slice.content.descendants((node) => {
		if (node.type.name === referenceName) references.add(node.attrs.id);
		if (node.type.name === definitionName) return false;
	});
	if (!references.size) return null;
	const host = document.createElement('div');
	host.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content));
	const existing = new Set(
		Array.from(host.querySelectorAll('[data-footnote-id]'), (node) =>
			node.getAttribute('data-footnote-id')
		)
	);
	const missing = editorFootnotes(editor.state.doc).filter(
		(note) => references.has(note.id) && !existing.has(note.id)
	);
	if (missing.length)
		host.append(
			DOMSerializer.fromSchema(editor.schema).serializeNode(
				editor.schema.nodes[listName]!.create(
					null,
					Fragment.from(missing.map((note) => note.definition))
				)
			)
		);
	return host.innerHTML;
}

/** A pasted definition may reuse an ID only when its content already belongs to that ID. */
export function prepareFootnotePasteHtml(editor: Editor, html: string): string {
	if (!html.includes('data-footnote-')) return html;
	const template = document.createElement('template');
	template.innerHTML = html;
	const parsed = ProseMirrorDOMParser.fromSchema(editor.schema).parse(template.content);
	const incoming = new Map(editorFootnotes(parsed).map((note) => [note.id, note]));
	const existing = new Map(editorFootnotes(editor.state.doc).map((note) => [note.id, note]));
	const incomingReferences = new Set(
		Array.from(template.content.querySelectorAll('sup[data-footnote-ref]'), (node) =>
			node.getAttribute('data-footnote-ref')
		)
	);
	const seen = new Set<string>();
	for (const definition of template.content.querySelectorAll<HTMLElement>('li[data-footnote-id]')) {
		const id = definition.dataset.footnoteId;
		if (!isDocumentFootnoteId(id)) continue;
		if (seen.has(id)) {
			// An ambiguous second definition is retained as an unreferenced note, never discarded.
			definition.dataset.footnoteId = `fn_${crypto.randomUUID()}`;
			continue;
		}
		seen.add(id);
		const previous = existing.get(id);
		if (!previous) continue;
		if (
			incomingReferences.has(id) &&
			incoming.get(id)?.definition.content.eq(previous.definition.content)
		) {
			definition.remove();
			continue;
		}
		const replacement = `fn_${crypto.randomUUID()}`;
		definition.dataset.footnoteId = replacement;
		for (const reference of template.content.querySelectorAll<HTMLElement>(
			'sup[data-footnote-ref]'
		))
			if (reference.dataset.footnoteRef === id) reference.dataset.footnoteRef = replacement;
	}
	for (const list of template.content.querySelectorAll('ol[data-footnotes="true"]'))
		if (!list.children.length) list.remove();
	return template.innerHTML;
}
