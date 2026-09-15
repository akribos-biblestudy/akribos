/**
 * Non-persisted Bible-reference links for the Tiptap document editor.
 *
 * ProseMirror decorations affect only the live DOM. They are intentionally absent from
 * `editor.getHTML()` and therefore never turn automatic links into stored Markdown links. The same
 * pure matcher and DOM attributes power the read-only document renderer.
 */
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
	bibleReferenceAttributes,
	bibleReferenceFromLinkText,
	findBibleReferences
} from '$lib/bible/link-references';

const pluginKey = new PluginKey<DecorationSet>('documentBibleReferenceLinks');
const EXCLUDED_BLOCKS = new Set(['codeBlock']);
const EXCLUDED_MARKS = new Set(['code', 'link']);

export type BibleReferenceDecorationOptions = { tooltipId?: string };

function collectBibleReferenceDecorations(
	document: ProseMirrorNode,
	options: BibleReferenceDecorationOptions,
	from = 0,
	to = document.content.size
): Decoration[] {
	const decorations: Decoration[] = [];

	document.nodesBetween(from, to, (node, position) => {
		if (EXCLUDED_BLOCKS.has(node.type.name)) return false;
		if (node.isTextblock) {
			let run = '';
			let start = 0;
			let href: string | null = null;
			const flush = () => {
				if (!href || !run) return;
				const match = bibleReferenceFromLinkText(run);
				decorations.push(
					Decoration.inline(start, start + run.length, {
						nodeName: 'span',
						...(match ? bibleReferenceAttributes(match, options) : {}),
						title: match?.href ?? href
					})
				);
			};
			node.forEach((child, offset) => {
				const link =
					child.isText && !child.marks.some((mark) => mark.type.name === 'code')
						? child.marks.find((mark) => mark.type.name === 'link')
						: undefined;
				const nextHref = link?.attrs.href ?? null;
				if (nextHref !== href || !child.isText) {
					flush();
					run = '';
					start = position + 1 + offset;
					href = nextHref;
				}
				if (href) run += child.text ?? '';
			});
			flush();
		}
		if (!node.isText || !node.text) return true;
		if (node.marks.some((mark) => EXCLUDED_MARKS.has(mark.type.name))) return true;

		for (const match of findBibleReferences(node.text)) {
			decorations.push(
				Decoration.inline(
					position + match.from,
					position + match.to,
					{ nodeName: 'a', ...bibleReferenceAttributes(match, options), title: match.href },
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

	return decorations;
}

export function createBibleReferenceDecorations(
	document: ProseMirrorNode,
	options: BibleReferenceDecorationOptions = {}
): DecorationSet {
	return DecorationSet.create(document, collectBibleReferenceDecorations(document, options));
}

export function updateBibleReferenceDecorations(
	transaction: Transaction,
	current: DecorationSet,
	options: BibleReferenceDecorationOptions = {}
): DecorationSet {
	const document = transaction.doc;
	const mapped = current.map(transaction.mapping, document);
	if (!transaction.docChanged) return mapped;
	const start = transaction.before.content.findDiffStart(document.content);
	// Replacing the whole document with equal content (e.g. a mode switch) may map every
	// decoration away, although all original positions and marks are still valid.
	if (start === null) return current;
	const end = transaction.before.content.findDiffEnd(document.content)?.b ?? start;
	// Include either side of a split/join, and rescan whole textblocks: an edit can extend or
	// invalidate a reference before the cursor. Untouched paragraphs retain their mapped links.
	let from = Math.max(0, start - 1);
	let to = Math.min(document.content.size, Math.max(start, end) + 1);
	document.nodesBetween(from, to, (node, position) => {
		if (!node.isTextblock) return true;
		from = Math.min(from, position);
		to = Math.max(to, position + node.nodeSize);
		return false;
	});
	return mapped
		.remove(mapped.find(from, to))
		.add(document, collectBibleReferenceDecorations(document, options, from, to));
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
					apply: (transaction, current) =>
						updateBibleReferenceDecorations(transaction, current, options)
				},
				props: {
					decorations: (state) => pluginKey.getState(state) ?? null
				}
			})
		];
	}
});
