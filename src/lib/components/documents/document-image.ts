import { Node } from '@tiptap/core';
import { parseDocumentImage } from '$lib/notes/document-images';

export const DocumentImage = Node.create({
	name: 'documentImage',
	group: 'inline',
	inline: true,
	atom: true,
	draggable: true,
	addAttributes: () => ({ src: { default: null }, alt: { default: '' } }),
	parseHTML: () => [
		{
			tag: 'img[src]',
			getAttrs: (element) => (parseDocumentImage(element.getAttribute('src') ?? '') ? null : false)
		}
	],
	renderHTML: ({ HTMLAttributes }) => ['img', { src: HTMLAttributes.src, alt: HTMLAttributes.alt }]
});
