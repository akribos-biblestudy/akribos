export type SelectedBibleVerse = { reference: string; text: string; source: string };

/** Leave mixed, non-Bible and cross-column selections to the browser's ordinary copy behavior. */
export function selectedBibleVerses(selection: Selection | null): SelectedBibleVerse[] | null {
	if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
	const range = selection.getRangeAt(0);
	const elementOf = (node: Node) => (node instanceof Element ? node : node.parentElement);
	const column = elementOf(range.startContainer)?.closest<HTMLElement>(
		'.flow-column[data-copy-source]'
	);
	if (!column || elementOf(range.endContainer)?.closest('.flow-column') !== column) return null;
	const source = column.dataset.copySource;
	if (!source) return null;

	// Traverse selected text rather than relying on range endpoints to be text nodes: selecting a
	// complete paragraph (e.g. selectNode or keyboard selection) uses element boundary offsets.
	const selected = new Set<HTMLElement>();
	const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (!range.intersectsNode(node)) continue;
		const start = range.startContainer === node ? range.startOffset : 0;
		const end = range.endContainer === node ? range.endOffset : (node.textContent?.length ?? 0);
		if (!node.textContent?.slice(start, end).trim()) continue;
		const verse = elementOf(node)?.closest<HTMLElement>(
			'.flow-chapter.scripture .flow-verse[data-copy-reference]'
		);
		// Selected headings, other works or controls are not silently replaced with Bible text.
		if (!verse || !column.contains(verse)) return null;
		selected.add(verse);
	}
	const verses = [...selected].map((verse) => ({
		reference: verse.dataset.copyReference ?? '',
		text: verse.dataset.copyText ?? '',
		source
	}));
	return verses.length > 0 && verses.every((verse) => verse.reference && verse.text)
		? verses
		: null;
}
