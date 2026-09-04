/**
 * Non-persisted Bible-reference links for the Tiptap document editor.
 *
 * ProseMirror decorations affect only the live DOM. They are intentionally absent from
 * `editor.getHTML()` and therefore never turn automatic links into stored Markdown links. The same
 * pure matcher and DOM attributes power the read-only document renderer.
 */
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { bibleReferenceAttributes, findBibleReferences } from '$lib/bible/link-references';

const pluginKey = new PluginKey<DecorationSet>('documentBibleReferenceLinks');
const EXCLUDED_BLOCKS = new Set(['codeBlock']);
const EXCLUDED_MARKS = new Set(['code', 'link']);

export type BibleReferenceDecorationOptions = { tooltipId?: string };

export function createBibleReferenceDecorations(
	document: ProseMirrorNode,
	options: BibleReferenceDecorationOptions = {}
): DecorationSet {
	const decorations: Decoration[] = [];

	document.descendants((node, position) => {
		if (EXCLUDED_BLOCKS.has(node.type.name)) return false;
		if (!node.isText || !node.text) return true;
		if (node.marks.some((mark) => EXCLUDED_MARKS.has(mark.type.name))) return true;

		for (const match of findBibleReferences(node.text)) {
			decorations.push(
				Decoration.inline(
					position + match.from,
					position + match.to,
					{ nodeName: 'a', ...bibleReferenceAttributes(match, options) },
					{
						inclusiveStart: false,
						inclusiveEnd: false,
						bibleReference: match.canonical
					}
				)
			);
		}
		return true;
	});

	return DecorationSet.create(document, decorations);
}

export const BibleReferenceDecorations = Extension.create<BibleReferenceDecorationOptions>({
	name: 'documentBibleReferenceLinks',
	addOptions: () => ({}),

	addProseMirrorPlugins() {
		const options = this.options;
		return [
			new Plugin<DecorationSet>({
				key: pluginKey,
				state: {
					init: (_configuration, state) => createBibleReferenceDecorations(state.doc, options),
					apply: (transaction, current, _oldState, newState) =>
						transaction.docChanged
							? createBibleReferenceDecorations(newState.doc, options)
							: current.map(transaction.mapping, transaction.doc)
				},
				props: {
					decorations: (state) => pluginKey.getState(state) ?? null
				}
			})
		];
	}
});
