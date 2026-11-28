import { Node } from '@tiptap/core';
import { documentImageLayout, parseDocumentImage } from '$lib/notes/document-images';

export const DocumentImage = Node.create({
	name: 'documentImage',
	group: 'inline',
	inline: true,
	atom: true,
	draggable: true,
	addAttributes: () => ({
		src: { default: null },
		alt: { default: '' },
		align: {
			default: null,
			parseHTML: (element) =>
				documentImageLayout(element.getAttribute('data-image-align'), null).align,
			rendered: false
		},
		width: {
			default: null,
			parseHTML: (element) =>
				documentImageLayout(null, element.getAttribute('data-image-width')).width,
			rendered: false
		}
	}),
	parseHTML: () => [
		{
			tag: 'img[src]',
			getAttrs: (element) => (parseDocumentImage(element.getAttribute('src') ?? '') ? null : false)
		}
	],
	renderHTML: ({ node, HTMLAttributes }) => [
		'img',
		{
			...HTMLAttributes,
			'data-image-align': node.attrs.align,
			'data-image-width': node.attrs.width
		}
	]
});
