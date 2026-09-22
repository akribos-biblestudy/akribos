/** Restore table derivatives from each stored source, never from another revision or flat prose. */
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import {
	documentMarkdownToHtml,
	hasDocumentMarkdownTables
} from '../../notes/document-markdown.ts';
import type { Database } from '../db/client.ts';
import { documentPublications, documents } from '../db/schema.ts';
import { syncDocumentLinks } from '../repositories/document-links.ts';
import { syncDocumentBodyReferenceIndex } from '../repositories/document-reference-index.ts';

export type DocumentTableBackfillResult = {
	scanned: number;
	updatedDocuments: number;
	updatedPublications: number;
	/** HTML tables without a recoverable Markdown table source, counted without exposing content. */
	warnings: number;
};

/** Preserve an operational SQLSTATE without exposing query text, parameters or the original cause. */
export class DocumentTableBackfillError extends Error {
	readonly code: string | undefined;
	constructor(code?: string) {
		super('The document table backfill failed.');
		this.name = 'DocumentTableBackfillError';
		this.code = code;
	}
}
function safeDatabaseErrorCode(error: unknown): string | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const cause = 'cause' in error ? error.cause : undefined;
	const candidates = [error, cause];
	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== 'object' || !('code' in candidate)) continue;
		if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code))
			return candidate.code;
	}
	return undefined;
}
type TableBackfillOptions = { batchSize?: number; userId?: string };

function rebuiltBody(bodyMarkdown: string, bodyHtml: string) {
	if (!hasDocumentMarkdownTables(bodyMarkdown)) {
		// Never infer a table from joined prose or an uncertain HTML-only source.
		return { body: null, warnings: Number(/<table(?:\s|>)/iu.test(bodyHtml)) };
	}
	const rendered = documentMarkdownToHtml(bodyMarkdown);
	// Source whitespace and user input stay byte-for-byte intact; only derived fields are repaired.
	return { body: { bodyHtml: rendered.html, plainText: rendered.plainText }, warnings: 0 };
}

/**
 * Scan bounded ID batches, then lock and re-read each current document independently.
 *
 * Existing snapshots are repaired from their own source, never copied from the current draft.
 * Equality of HTML and plain-text derivatives is the idempotency boundary; Markdown is never rewritten.
 */
export async function backfillDocumentTables(
	db: Database,
	options: TableBackfillOptions = {}
): Promise<DocumentTableBackfillResult> {
	try {
		return await runDocumentTableBackfill(db, options);
	} catch (error) {
		// Drizzle errors may include private body Markdown in query parameters. This boundary also
		// protects the existing restore logger and CLI; never retain the original error as a cause.
		throw new DocumentTableBackfillError(safeDatabaseErrorCode(error));
	}
}

async function runDocumentTableBackfill(
	db: Database,
	options: TableBackfillOptions
): Promise<DocumentTableBackfillResult> {
	const requestedSize = options.batchSize ?? 100;
	const batchSize = Number.isFinite(requestedSize)
		? Math.max(1, Math.min(500, Math.trunc(requestedSize)))
		: 100;
	const result: DocumentTableBackfillResult = {
		scanned: 0,
		updatedDocuments: 0,
		updatedPublications: 0,
		warnings: 0
	};
	let afterId: string | undefined;
	while (true) {
		const batch = await db
			.select({ id: documents.id })
			.from(documents)
			.leftJoin(documentPublications, eq(documentPublications.documentId, documents.id))
			.where(
				and(
					afterId ? gt(documents.id, afterId) : undefined,
					options.userId ? eq(documents.userId, options.userId) : undefined,
					or(
						sql`${documents.bodyMarkdown} like '%|%'`,
						sql`${documentPublications.bodyMarkdown} like '%|%'`,
						sql`${documents.bodyHtml} ~* '<table([[:space:]]|>)'`,
						sql`${documentPublications.bodyHtml} ~* '<table([[:space:]]|>)'`
					)
				)
			)
			.orderBy(asc(documents.id))
			.limit(batchSize);
		if (!batch.length) return result;
		for (const { id } of batch) {
			const changed = await db.transaction(async (tx) => {
				const [document] = await tx
					.select()
					.from(documents)
					.where(
						and(
							eq(documents.id, id),
							options.userId ? eq(documents.userId, options.userId) : undefined
						)
					)
					.for('update');
				if (!document) return null;
				const [publication] = await tx
					.select()
					.from(documentPublications)
					.where(eq(documentPublications.documentId, id))
					.for('update');
				const draft = rebuiltBody(document.bodyMarkdown, document.bodyHtml);
				const updateDraft =
					!!draft.body &&
					(draft.body.bodyHtml !== document.bodyHtml ||
						draft.body.plainText !== document.plainText);
				const revision = document.revision + Number(updateDraft);
				if (updateDraft && draft.body) {
					await tx
						.update(documents)
						.set({ ...draft.body, revision })
						.where(eq(documents.id, id));
					const transactionDb = tx as unknown as Database;
					await syncDocumentLinks(transactionDb, document.userId, id, document.bodyMarkdown);
					await syncDocumentBodyReferenceIndex(
						transactionDb,
						document.userId,
						id,
						draft.body.bodyHtml
					);
				}
				let updatePublication = false;
				let warnings = draft.warnings;
				if (publication) {
					const published = rebuiltBody(publication.bodyMarkdown, publication.bodyHtml);
					warnings += published.warnings;
					const publicationBodyChanged =
						!!published.body && published.body.bodyHtml !== publication.bodyHtml;
					const followTechnicalRevision =
						updateDraft && publication.publicationRevision === document.revision;
					updatePublication = publicationBodyChanged || followTechnicalRevision;
					if (updatePublication) {
						await tx
							.update(documentPublications)
							.set({
								...(publicationBodyChanged && published.body
									? {
											bodyHtml: published.body.bodyHtml
										}
									: {}),
								...(followTechnicalRevision ? { publicationRevision: revision } : {})
							})
							.where(eq(documentPublications.documentId, id));
					}
				}
				return { updateDraft, updatePublication, warnings };
			});
			if (changed) {
				result.scanned++;
				result.updatedDocuments += Number(changed.updateDraft);
				result.updatedPublications += Number(changed.updatePublication);
				result.warnings += changed.warnings;
			}
		}
		afterId = batch.at(-1)!.id;
	}
}
