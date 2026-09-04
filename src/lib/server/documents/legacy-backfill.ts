/** Idempotent operational backfill for verse comments created after migration 0025. */

import { formatReference } from '../../bible/reference.ts';
import { documentHtmlToMarkdown, documentMarkdownToHtml } from '../../notes/document-markdown.ts';
import type { Database } from '../db/client.ts';
import {
	createDocumentFromLegacyVerseComment,
	listPendingLegacyVerseComments
} from '../repositories/documents.ts';

export type LegacyDocumentBackfillResult = {
	created: number;
	alreadyPresent: number;
};

/**
 * Converts every still-unmapped `verse_comments` row in bounded batches.
 *
 * The repository's unique provenance constraint is the real idempotency boundary. A second run sees
 * no pending rows; two concurrent runs may both see a row, but only one can create its document.
 */
export async function backfillLegacyVerseComments(
	db: Database,
	options: { batchSize?: number } = {}
): Promise<LegacyDocumentBackfillResult> {
	const batchSize = Math.max(1, Math.min(5_000, Math.trunc(options.batchSize ?? 500)));
	let created = 0;
	let alreadyPresent = 0;

	while (true) {
		const pending = await listPendingLegacyVerseComments(db, batchSize);
		if (pending.length === 0) return { created, alreadyPresent };

		for (const comment of pending) {
			const bodyMarkdown = documentHtmlToMarkdown(comment.commentHtml);
			const converted = documentMarkdownToHtml(bodyMarkdown);
			const result = await createDocumentFromLegacyVerseComment(db, {
				...comment,
				title: `Notiz zu ${formatReference(
					{ book: comment.bookId, chapter: comment.chapter, verse: comment.verse },
					{ style: 'full' }
				)}`,
				bodyMarkdown,
				// Preserve the already-sanitised legacy rendering. Markdown remains the portable fallback.
				bodyHtml: comment.commentHtml,
				plainText: converted.plainText
			});
			if (!result.ok) {
				throw new Error(
					`legacy verse comment ${comment.id} references unavailable Bible ${result.resourceId}`
				);
			}
			if (result.created) created += 1;
			else alreadyPresent += 1;
		}

		if (pending.length < batchSize) return { created, alreadyPresent };
	}
}
