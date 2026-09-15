import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
	createBibleReferenceDecorations,
	updateBibleReferenceDecorations
} from './bible-reference-decorations';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { content: 'inline*', group: 'block' },
		codeBlock: { content: 'text*', group: 'block', code: true },
		text: { group: 'inline' }
	},
	marks: {
		code: {},
		link: { attrs: { href: {} } }
	}
});

describe('createBibleReferenceDecorations', () => {
	it.each([
		[
			'Joh 7,12+47',
			[
				['Joh 7,12', 'Joh7,12'],
				['47', 'Joh7,47']
			]
		],
		[
			'Joh 7,12.47',
			[
				['Joh 7,12', 'Joh7,12'],
				['47', 'Joh7,47']
			]
		],
		['Joh 7,12f', [['Joh 7,12f', 'Joh7,12-13']]],
		['Joh 7,12ff', [['Joh 7,12ff', 'Joh7,12-14']]],
		['Joh 7,12a', [['Joh 7,12a', 'Joh7,12']]],
		['Joh 7,12b', [['Joh 7,12b', 'Joh7,12']]],
		['Joh 7,12c', [['Joh 7,12c', 'Joh7,12']]]
	] as const)('decorates the complete shorthand %s without changing its text', (text, expected) => {
		const document = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text(text)])
		]);
		const before = document.toJSON();
		expect(
			createBibleReferenceDecorations(document)
				.find()
				.map(({ from, to, spec }) => [document.textBetween(from, to), spec.bibleReference])
		).toEqual(expected);
		expect(document.toJSON()).toEqual(before);
	});

	it('highlights the book number with the complete second Samuel reference', () => {
		const document = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text('Siehe 2. Sam 9,2.')])
		]);
		expect(createBibleReferenceDecorations(document).find()).toEqual([
			expect.objectContaining({
				from: 7,
				to: 17,
				spec: expect.objectContaining({ bibleReference: '2Sam9,2' })
			})
		]);
	});

	it('adds reference decorations at ProseMirror text positions without changing the document', () => {
		const document = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text('Vor Mt 3,12 und Johannes3:16 danach')])
		]);
		const before = document.toJSON();

		const decorations = createBibleReferenceDecorations(document).find();

		expect(
			decorations.map(({ from, to, spec }) => ({ from, to, reference: spec.bibleReference }))
		).toEqual([
			{ from: 5, to: 12, reference: 'Mt3,12' },
			{ from: 17, to: 29, reference: 'Joh3,16' }
		]);
		expect(document.toJSON()).toEqual(before);
	});

	it('decorates authored Bible links while leaving inline code and fenced code untouched', () => {
		const document = schema.node('doc', null, [
			schema.node('paragraph', null, [
				schema.text('Mt 3,12', [schema.mark('link', { href: '/authored' })]),
				schema.text(' und '),
				schema.text('Joh 3,16', [schema.mark('code')])
			]),
			schema.node('codeBlock', null, [schema.text('Röm 8,1')])
		]);

		const decorations = createBibleReferenceDecorations(document).find();
		expect(decorations).toHaveLength(1);
		expect(decorations[0]).toMatchObject({ from: 1, to: 8 });
	});
});

describe('incremental Bible-reference decorations', () => {
	it('preserves all reference links when a mode switch replaces the document with equal content', () => {
		const state = EditorState.create({
			schema,
			doc: schema.node('doc', null, [
				schema.node('paragraph', null, [schema.text('Siehe Mt 3,12 und Joh 3,16.')])
			])
		});
		const current = createBibleReferenceDecorations(state.doc);
		const replacement = state.tr.replaceWith(0, state.doc.content.size, state.doc.content);
		expect(replacement.docChanged).toBe(true);
		expect(updateBibleReferenceDecorations(replacement, current).find()).toEqual(current.find());
	});

	it('matches full recognition after typing, deleting, joining, splitting, pasting and mark changes', () => {
		let state = EditorState.create({
			schema,
			doc: schema.node('doc', null, [
				schema.node('paragraph', null, [schema.text('Siehe Joh 3,16 und Röm 8,28.')]),
				schema.node('paragraph', null, [schema.text('Mt 3,12 bleibt erhalten.')]),
				schema.node('codeBlock', null, [schema.text('Joh 3,16')])
			])
		});
		const options = { tooltipId: 'preview' };
		let current = createBibleReferenceDecorations(state.doc, options);
		const apply = (transaction: typeof state.tr) => {
			current = updateBibleReferenceDecorations(transaction, current, options);
			state = state.apply(transaction);
			expect(current.find()).toEqual(createBibleReferenceDecorations(state.doc, options).find());
		};
		apply(state.tr.insertText('17', 13, 15));
		apply(state.tr.insertText('Text ', 1));
		apply(state.tr.delete(6, 10));
		apply(state.tr.addMark(7, 15, schema.mark('code')));
		apply(state.tr.removeMark(7, 15, schema.marks.code));
		apply(state.tr.addMark(1, 15, schema.mark('link', { href: '/authored' })));
		apply(state.tr.removeMark(1, 15, schema.marks.link));
		apply(state.tr.split(12));
		apply(state.tr.join(state.doc.firstChild!.nodeSize));
		apply(
			state.tr.insert(
				state.doc.firstChild!.nodeSize,
				schema.node('paragraph', null, [schema.text('Joh 3,16')])
			)
		);
		apply(state.tr.delete(0, state.doc.firstChild!.nodeSize));
		apply(state.tr.setBlockType(1, 1, schema.nodes.codeBlock));
		apply(state.tr.setBlockType(1, 1, schema.nodes.paragraph));
		apply(state.tr.insertText('Anfang ', 1).insertText(' Ende', state.doc.content.size - 1 + 7));
		apply(state.tr.delete(0, state.doc.content.size));
	});

	it('retains distant decorations when the changed paragraph contains no references', () => {
		const state = EditorState.create({
			schema,
			doc: schema.node(
				'doc',
				null,
				Array.from({ length: 150 }, (_, index) =>
					schema.node('paragraph', null, [schema.text(index === 75 ? 'Text' : 'Siehe Joh 3,16.')])
				)
			)
		});
		let position = 1;
		for (let i = 0; i < 75; i++) position += state.doc.child(i).nodeSize;
		const current = createBibleReferenceDecorations(state.doc);
		const changed = state.tr.insertText('Neuer ', position);
		const updated = updateBibleReferenceDecorations(changed, current);
		expect(updated.find()).toHaveLength(149);
		expect(updated.find()).toEqual(createBibleReferenceDecorations(changed.doc).find());
	});
});
