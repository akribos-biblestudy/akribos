import { Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { createBibleReferenceDecorations } from './bible-reference-decorations';

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
