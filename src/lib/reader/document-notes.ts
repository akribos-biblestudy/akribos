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

/** Minimal client-only metadata needed to expose a just-created note before the Reader reloads. */
export type ReaderCreatedDocument = {
	id: string;
	title: string;
	kind: DocumentKind;
	source: DocumentSource;
	passage: string;
	resourceId: string | null;
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

/**
 * Returns the documents whose passage starts or ends inside the rendered verse block.
 *
 * A ranged anchor therefore paints every covered verse through `readerDocumentsAt()`, while its
 * document button appears only at the range boundary (once for a one-verse or merged cell). This
 * keeps long study passages discoverable without repeating the same icon after every verse.
 */
export function readerDocumentBoundariesAt(
	anchors: readonly ReaderDocumentAnchor[],
	reference: { book: number; chapter: number; verse: number; verseEnd?: number | null }
): ReaderDocumentSummary[] {
	const startKey = passagePointKey(reference);
	const endKey = passagePointKey({
		book: reference.book,
		chapter: reference.chapter,
		verse: reference.verseEnd ?? reference.verse
	});
	const boundaryDocumentIds = new Set<string>();

	for (const anchor of anchors) {
		if (anchor.startKey > endKey || anchor.endKey < startKey) continue;
		if (
			(anchor.startKey >= startKey && anchor.startKey <= endKey) ||
			(anchor.endKey >= startKey && anchor.endKey <= endKey)
		) {
			boundaryDocumentIds.add(anchor.documentId);
		}
	}

	return readerDocumentsAt(anchors, reference).filter((document) =>
		boundaryDocumentIds.has(document.id)
	);
}
