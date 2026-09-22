/** Repair historical footnote sources and derivatives without republishing working copies. */
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { repairLegacyDocumentFootnotes } from '../../notes/document-footnotes.ts';
import type { Database } from '../db/client.ts';
import { documentPublications, documents } from '../db/schema.ts';
import { syncDocumentLinks } from '../repositories/document-links.ts';
import { syncDocumentBodyReferenceIndex } from '../repositories/document-reference-index.ts';
import { prepareDocumentBody } from './application.ts';

export type DocumentFootnoteBackfillResult = {
	scanned: number;
	updatedDocuments: number;
	updatedPublications: number;
	/** Counts only; legacy warning text can contain private document content. */
	warnings: number;
};

/** Preserve an operational SQLSTATE without exposing query text, parameters or the original cause. */
export class DocumentFootnoteBackfillError extends Error {
	readonly code: string | undefined;
	constructor(code?: string) {
		super('The document footnote backfill failed.');
		this.name = 'DocumentFootnoteBackfillError';
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
type FootnoteBackfillOptions = { batchSize?: number; userId?: string };

const hasFootnoteMarkdown = (value: string) => /\[\^|#(?:footnote|endnote)-/iu.test(value);
const hasStoredFootnoteHtml = (value: string) =>
	/data-footnote|\bid\s*=\s*["'](?:footnote|endnote)-/iu.test(value);

function repairedBody(bodyMarkdown: string, bodyHtml: string) {
	if (!hasFootnoteMarkdown(bodyMarkdown)) {
		// Historical HTML may be the only remaining footnote source. Rendering an empty/plain Markdown
		// copy would destroy it; keep that uncertain source intact for a deliberate later repair.
		return { body: null, warnings: Number(hasStoredFootnoteHtml(bodyHtml)) };
	}
	const repaired = repairLegacyDocumentFootnotes(bodyMarkdown);
	return { body: prepareDocumentBody(repaired.markdown), warnings: repaired.warnings.length };
}

/**
 * Scan bounded ID batches, then lock and re-read each current document independently.
 *
 * Existing snapshots are repaired from their own source, never copied from the current draft.
 * Equality of the three body fields is the idempotency boundary, including renderer-only fixes.
 */
export async function backfillDocumentFootnotes(
	db: Database,
	options: FootnoteBackfillOptions = {}
): Promise<DocumentFootnoteBackfillResult> {
	try {
		return await runDocumentFootnoteBackfill(db, options);
	} catch (error) {
		// Drizzle errors may include private body Markdown in query parameters. This boundary also
		// protects the existing restore logger and CLI; never retain the original error as a cause.
		throw new DocumentFootnoteBackfillError(safeDatabaseErrorCode(error));
	}
}

async function runDocumentFootnoteBackfill(
	db: Database,
	options: FootnoteBackfillOptions
): Promise<DocumentFootnoteBackfillResult> {
	const requestedSize = options.batchSize ?? 100;
	const batchSize = Number.isFinite(requestedSize)
		? Math.max(1, Math.min(500, Math.trunc(requestedSize)))
		: 100;
	const result: DocumentFootnoteBackfillResult = {
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
						sql`${documents.bodyMarkdown} like '%[^%'`,
						sql`${documents.bodyMarkdown} ilike '%#footnote-%'`,
						sql`${documents.bodyMarkdown} ilike '%#endnote-%'`,
						sql`${documentPublications.bodyMarkdown} like '%[^%'`,
						sql`${documentPublications.bodyMarkdown} ilike '%#footnote-%'`,
						sql`${documentPublications.bodyMarkdown} ilike '%#endnote-%'`,
						sql`${documents.bodyHtml} ~* 'data-footnote|id[[:space:]]*=[[:space:]]*["''](footnote|endnote)-'`,
						sql`${documentPublications.bodyHtml} ~* 'data-footnote|id[[:space:]]*=[[:space:]]*["''](footnote|endnote)-'`
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
				const draft = repairedBody(document.bodyMarkdown, document.bodyHtml);
				const updateDraft =
					!!draft.body &&
					(draft.body.bodyMarkdown !== document.bodyMarkdown ||
						draft.body.bodyHtml !== document.bodyHtml ||
						draft.body.plainText !== document.plainText);
				const revision = document.revision + Number(updateDraft);
				if (updateDraft && draft.body) {
					await tx
						.update(documents)
						.set({ ...draft.body, revision })
						.where(eq(documents.id, id));
					const transactionDb = tx as unknown as Database;
					await syncDocumentLinks(transactionDb, document.userId, id, draft.body.bodyMarkdown);
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
					const published = repairedBody(publication.bodyMarkdown, publication.bodyHtml);
					warnings += published.warnings;
					const publicationBodyChanged =
						!!published.body &&
						(published.body.bodyMarkdown !== publication.bodyMarkdown ||
							published.body.bodyHtml !== publication.bodyHtml);
					const followTechnicalRevision =
						updateDraft && publication.publicationRevision === document.revision;
					updatePublication = publicationBodyChanged || followTechnicalRevision;
					if (updatePublication) {
						await tx
							.update(documentPublications)
							.set({
								...(publicationBodyChanged && published.body
									? {
											bodyMarkdown: published.body.bodyMarkdown,
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
