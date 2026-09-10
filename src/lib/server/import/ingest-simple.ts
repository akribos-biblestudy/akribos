/**
 * Ingesters for cross references and commentaries.
 *
 * Both are flat lists of rows keyed to a reference, so they share one batched-insert shape and differ
 * only in the table they fill.
 */

import { eq } from 'drizzle-orm';
import type {
	ParsedCommentaryEntry,
	ParsedCrossReference,
	ParseStream,
	ResourceMetadata
} from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import { commentaryEntries, crossReferences, resources } from '../db/schema.ts';
import { isSwordTsk } from '../../bible/parse/resource-kind.ts';

export type SimpleIngestOptions = {
	sourceFormat: string;
	sourceFile?: string;
	overrides?: Partial<
		Pick<ResourceMetadata, 'id' | 'name' | 'abbrev' | 'language' | 'licenseHtml'>
	>;
	onProgress?: (progress: { rows: number }) => void | Promise<void>;
};

export type SimpleIngestResult = {
	resourceId: string;
	kind: 'commentary' | 'xrefs';
	count: number;
	warnings: string[];
};

const BATCH_SIZE = 500;

export async function ingestCrossReferences(
	db: Database,
	stream: ParseStream,
	options: SimpleIngestOptions
): Promise<SimpleIngestResult> {
	return ingest(db, stream, options, {
		kind: 'xrefs',
		eventType: 'crossReference',
		clear: (resourceId) =>
			db.delete(crossReferences).where(eq(crossReferences.resourceId, resourceId)),
		write: async (resourceId, rows) => {
			await db.insert(crossReferences).values(
				(rows as ParsedCrossReference[]).map((row) => ({
					resourceId,
					fromBook: row.fromBook,
					fromChapter: row.fromChapter,
					fromVerse: row.fromVerse,
					toBook: row.toBook,
					toChapter: row.toChapter,
					toVerse: row.toVerse,
					toVerseEnd: row.toVerseEnd,
					votes: row.votes
				}))
			);
		}
	});
}

export async function ingestCommentary(
	db: Database,
	stream: ParseStream,
	options: SimpleIngestOptions
): Promise<SimpleIngestResult> {
	return ingest(db, stream, options, {
		kind: 'commentary',
		eventType: 'commentaryEntry',
		clear: (resourceId) =>
			db.delete(commentaryEntries).where(eq(commentaryEntries.resourceId, resourceId)),
		write: async (resourceId, rows) => {
			await db.insert(commentaryEntries).values(
				(rows as ParsedCommentaryEntry[]).map((row) => ({
					resourceId,
					bookId: row.book,
					chapter: row.chapter,
					verseStart: row.verseStart ?? null,
					verseEnd: row.verseEnd ?? null,
					title: row.title ?? null,
					bodyHtml: row.bodyHtml
				}))
			);
		}
	});
}

type Handler = {
	kind: 'xrefs' | 'commentary';
	eventType: 'crossReference' | 'commentaryEntry';
	clear: (resourceId: string) => Promise<unknown>;
	write: (resourceId: string, rows: unknown[]) => Promise<void>;
};

async function ingest(
	db: Database,
	stream: ParseStream,
	options: SimpleIngestOptions,
	handler: Handler
): Promise<SimpleIngestResult> {
	const warnings: string[] = [];
	let resourceId: string | undefined;
	let kind = handler.kind;
	let count = 0;
	let batch: unknown[] = [];
	/**
	 * Rows can arrive before the metadata event, because the ThML parser only learns the commentary's
	 * title once it has read the document. They are held back until the resource row exists.
	 */
	let pending: unknown[] = [];

	const flush = async () => {
		if (!resourceId || batch.length === 0) return;
		const rows = batch;
		batch = [];
		await handler.write(resourceId, rows);
		await options.onProgress?.({ rows: count });
	};

	for await (const event of stream) {
		if (event.type === 'warning') {
			warnings.push(event.message);
			continue;
		}

		if (event.type === 'metadata') {
			kind =
				handler.kind === 'commentary' &&
				isSwordTsk({ ...event.metadata, sourceFormat: options.sourceFormat })
					? 'xrefs'
					: handler.kind;
			const metadata = { ...event.metadata, ...options.overrides };
			resourceId = metadata.id;

			await db
				.insert(resources)
				.values({
					id: resourceId,
					kind,
					name: metadata.name,
					abbrev: metadata.abbrev,
					language: metadata.language,
					licenseHtml: metadata.licenseHtml ?? null,
					sourceFormat: options.sourceFormat,
					sourceFile: options.sourceFile ?? null,
					status: 'importing'
				})
				.onConflictDoUpdate({
					target: resources.id,
					set: {
						kind,
						sourceFormat: options.sourceFormat,
						sourceFile: options.sourceFile ?? null,
						status: 'importing',
						updatedAt: new Date()
					}
				});

			await handler.clear(resourceId);

			// Anything buffered before the metadata arrived can be written now.
			batch = pending;
			pending = [];
			if (batch.length >= BATCH_SIZE) await flush();
			continue;
		}

		if (event.type !== handler.eventType) continue;

		const row = event.type === 'crossReference' ? event.crossReference : event.entry;
		count += 1;

		if (resourceId) {
			batch.push(row);
			if (batch.length >= BATCH_SIZE) await flush();
		} else {
			pending.push(row);
		}
	}

	if (!resourceId) throw new Error('the source contained no resource metadata');
	batch.push(...pending);
	await flush();

	await db
		.update(resources)
		.set({ wordCount: count, status: 'ready', updatedAt: new Date() })
		.where(eq(resources.id, resourceId));

	return { resourceId, kind, count, warnings };
}
