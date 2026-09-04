/**
 * Compact, owner-scoped document anchors for the reader chapter stream.
 *
 * The reader needs enough information to mark every overlapping verse, but must not ship complete
 * private document bodies with each endless-scroll response. Translation-neutral anchors apply to
 * every Bible; translation-specific anchors apply only to the exact active Bible resource.
 */

import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { MAX_PASSAGE_VERSE, passagePointKey } from '$lib/bible/passage';
import type { ReaderDocumentAnchor } from '$lib/reader/document-notes';
import type { Database } from '$lib/server/db/client';
import { documentPassages, documents } from '$lib/server/db/schema';

/**
 * Lists anchors intersecting a chapter for one active Bible tab.
 *
 * Passing no Bible resource deliberately returns nothing: commentary, cross-reference and lexicon
 * tabs cannot establish which translation-specific anchors are relevant, and they do not render
 * per-verse document indicators. Canonical anchors are returned alongside only the requested Bible.
 */
export async function loadReaderDocumentAnchors(
	db: Database,
	userId: string | null,
	resourceId: string | null,
	reference: { book: number; chapter: number }
): Promise<ReaderDocumentAnchor[]> {
	if (!userId || !resourceId) return [];

	const startKey = passagePointKey({ ...reference, verse: 1 });
	const endKey = passagePointKey({ ...reference, verse: MAX_PASSAGE_VERSE });

	return db
		.select({
			documentId: documents.id,
			title: documents.title,
			kind: documents.kind,
			source: documents.source,
			resourceId: documentPassages.resourceId,
			startKey: documentPassages.startKey,
			endKey: documentPassages.endKey
		})
		.from(documentPassages)
		.innerJoin(
			documents,
			and(
				eq(documents.id, documentPassages.documentId),
				eq(documents.userId, userId),
				isNull(documents.deletedAt)
			)
		)
		.where(
			and(
				lte(documentPassages.startKey, endKey),
				gte(documentPassages.endKey, startKey),
				or(isNull(documentPassages.resourceId), eq(documentPassages.resourceId, resourceId))
			)
		)
		.orderBy(desc(documents.updatedAt), desc(documents.id), documentPassages.position);
}
