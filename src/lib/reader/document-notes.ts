import { passagePointKey } from '$lib/bible/passage';
import type { DocumentKind, DocumentSource } from '$lib/notes/documents';

export type ReaderDocumentAnchor = {
	documentId: string;
	title: string;
	kind: DocumentKind;
	source: DocumentSource;
	resourceId: string | null;
	startKey: number;
	endKey: number;
};

export type ReaderDocumentSummary = {
	id: string;
	title: string;
	kind: DocumentKind;
	source: DocumentSource;
	/** True only when every matching anchor is tied to the active translation. */
	translationSpecific: boolean;
};

/**
 * Finds and de-duplicates the documents whose inclusive anchors touch the rendered verse block.
 * Merged Bible cells may cover several verses, so both ends of the cell are considered.
 */
export function readerDocumentsAt(
	anchors: readonly ReaderDocumentAnchor[],
	reference: { book: number; chapter: number; verse: number; verseEnd?: number | null }
): ReaderDocumentSummary[] {
	const startKey = passagePointKey(reference);
	const endKey = passagePointKey({
		book: reference.book,
		chapter: reference.chapter,
		verse: reference.verseEnd ?? reference.verse
	});
	const matched = new Map<string, ReaderDocumentSummary>();

	for (const anchor of anchors) {
		if (anchor.startKey > endKey || anchor.endKey < startKey) continue;
		const existing = matched.get(anchor.documentId);
		if (existing) {
			// A canonical matching anchor makes the document canonical for this verse even when another
			// anchor on the same document is translation-specific.
			existing.translationSpecific &&= anchor.resourceId !== null;
			continue;
		}
		matched.set(anchor.documentId, {
			id: anchor.documentId,
			title: anchor.title,
			kind: anchor.kind,
			source: anchor.source,
			translationSpecific: anchor.resourceId !== null
		});
	}

	return [...matched.values()];
}
