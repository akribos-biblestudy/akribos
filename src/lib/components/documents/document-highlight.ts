import { Mark } from '@tiptap/core';

/** Attribute-free portable formatting, mirrored by the document Markdown allow-list. */
export const DocumentHighlight = Mark.create({
	name: 'highlight',
	parseHTML: () => [{ tag: 'mark' }],
	renderHTML: () => ['mark', 0]
});
