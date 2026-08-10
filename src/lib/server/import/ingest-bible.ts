/**
 * Writes a parsed bible into the database.
 *
 * Consumes the parser's event stream in batches so memory stays flat, and reports progress through a
 * callback the CLI prints and the admin UI stores on the import job.
 *
 * Duplicate references are resolved **first non-empty text wins**, and every duplicate is reported as
 * a warning.
 *
 * That rule is chosen from the data rather than from taste. The bundled interlinear contains two
 * `<CHAPTER cnumber="2">` blocks in Galatians: the first holds verses 1-14, the second mislabels the
 * tail of verse 14 as verse 1, leaves 2-14 empty, and then carries the genuine verses 15-21.
 * Overwriting would wipe out the first half of the chapter; skipping duplicates outright would keep
 * an empty verse where a later block has the real text. Preferring the first non-empty text yields
 * the complete, correctly numbered chapter.
 */

import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { bookById } from '../../bible/books.ts';
import { sanitizeNoteHtml } from '../../notes/sanitize.ts';
import { segmentsToText, wordsFromSegments } from '../../bible/segments.ts';
import type { ParsedVerse, ParseStream, ResourceMetadata } from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import {
	resourceBooks,
	resources,
	verseComments,
	verses,
	verseWords,
	type NewVerseWord
} from '../db/schema.ts';
import { resolveDuplicate } from './duplicates.ts';

export type IngestProgress = {
	/** Verses written so far. */
	verses: number;
	/** Latest human-readable status line, e.g. the book being read. */
	message?: string;
};

export type IngestOptions = {
	/** Overrides for fields the admin may want to set instead of trusting the file. */
	overrides?: Partial<
		Pick<ResourceMetadata, 'id' | 'name' | 'abbrev' | 'language' | 'licenseHtml'>
	>;
	sourceFormat: string;
	sourceFile?: string;
	onProgress?: (progress: IngestProgress) => void | Promise<void>;
	/** How many verses to write per statement. */
	batchSize?: number;
};

export type IngestResult = {
	resourceId: string;
	verseCount: number;
	wordCount: number;
	warnings: string[];
};

const DEFAULT_BATCH_SIZE = 400;

export async function ingestBible(
	db: Database,
	stream: ParseStream,
	options: IngestOptions
): Promise<IngestResult> {
	const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
	const warnings: string[] = [];

	let metadata: ResourceMetadata | undefined;
	let resourceId: string | undefined;
	let verseCount = 0;
	let wordCount = 0;

	/** Verses of the book currently being read, keyed so a duplicate replaces its predecessor. */
	let buffer = new Map<string, ParsedVerse>();
	let bufferBook: number | undefined;

	const flush = async () => {
		if (buffer.size === 0) return;
		const batch = [...buffer.values()];
		buffer = new Map();

		for (let index = 0; index < batch.length; index += batchSize) {
			const slice = batch.slice(index, index + batchSize);
			const written = await writeVerses(db, resourceId!, slice);
			verseCount += written.verses;
			wordCount += written.words;
		}

		await options.onProgress?.({
			verses: verseCount,
			message: bufferBook ? bookLabel(bufferBook) : undefined
		});
	};

	for await (const event of stream) {
		switch (event.type) {
			case 'metadata': {
				metadata = { ...event.metadata, ...options.overrides };
				resourceId = metadata.id;
				await upsertResource(db, metadata, options);
				// A re-import replaces the resource's content; cascades clear verse_words with it.
				await db.delete(verses).where(eq(verses.resourceId, resourceId));
				await db.delete(resourceBooks).where(eq(resourceBooks.resourceId, resourceId));
				break;
			}

			case 'verse': {
				if (!resourceId) {
					// A source without metadata before the first verse is malformed; parsers emit
					// metadata first, so this only guards against a future parser bug.
					throw new Error('received a verse before any resource metadata');
				}

				const verse = event.verse;
				if (!bookById(verse.book)) {
					warnings.push(`skipped verse outside the canon: book ${verse.book}`);
					break;
				}

				if (bufferBook !== undefined && verse.book !== bufferBook) await flush();
				bufferBook = verse.book;

				const key = `${verse.chapter}:${verse.verse}`;
				const existing = buffer.get(key);
				if (existing) {
					const outcome = resolveDuplicate(existing, verse);
					warnings.push(
						`duplicate ${bookLabel(verse.book)} ${verse.chapter},${verse.verse} — ${outcome.reason}`
					);
					buffer.set(key, outcome.verse);
					break;
				}
				buffer.set(key, verse);

				if (buffer.size >= batchSize * 4) await flush();
				break;
			}

			case 'warning':
				warnings.push(event.message);
				break;

			case 'progress':
				break;

			default:
				break;
		}
	}

	await flush();

	if (!resourceId) throw new Error('the source contained no resource metadata');

	await writeBookStatistics(db, resourceId);
	await db
		.update(resources)
		.set({ verseCount, wordCount, status: 'ready', updatedAt: new Date() })
		.where(eq(resources.id, resourceId));

	return { resourceId, verseCount, wordCount, warnings };
}

async function upsertResource(
	db: Database,
	metadata: ResourceMetadata,
	options: IngestOptions
): Promise<void> {
	const values = {
		id: metadata.id,
		kind: 'bible' as const,
		name: metadata.name,
		abbrev: metadata.abbrev,
		language: metadata.language,
		direction: metadata.direction ?? 'ltr',
		licenseHtml: metadata.licenseHtml ?? null,
		sourceFormat: options.sourceFormat,
		sourceFile: options.sourceFile ?? null,
		status: 'importing' as const
	};

	await db
		.insert(resources)
		.values(values)
		.onConflictDoUpdate({
			target: resources.id,
			// Name, abbreviation and ordering may have been edited in the admin UI; a re-import of the
			// same file must not silently revert those. Only content-derived fields are refreshed.
			set: {
				language: values.language,
				direction: values.direction,
				sourceFormat: values.sourceFormat,
				sourceFile: values.sourceFile,
				status: values.status,
				updatedAt: new Date()
			}
		});
}

async function writeVerses(
	db: Database,
	resourceId: string,
	batch: ParsedVerse[]
): Promise<{ verses: number; words: number }> {
	const rows = batch.map((verse) => ({
		resourceId,
		bookId: verse.book,
		chapter: verse.chapter,
		verse: verse.verse,
		verseEnd: verse.verseEnd ?? null,
		segments: verse.segments,
		text: segmentsToText(verse.segments),
		heading: verse.heading ?? null
	}));

	const inserted = await db
		.insert(verses)
		.values(rows)
		.onConflictDoUpdate({
			target: [verses.resourceId, verses.bookId, verses.chapter, verses.verse],
			set: {
				segments: sql`excluded.segments`,
				text: sql`excluded.text`,
				verseEnd: sql`excluded.verse_end`,
				heading: sql`excluded.heading`
			}
		})
		.returning({
			id: verses.id,
			bookId: verses.bookId,
			chapter: verses.chapter,
			verse: verses.verse
		});

	// An update may have replaced a verse that already had words attached.
	await db.delete(verseWords).where(
		inArray(
			verseWords.verseId,
			inserted.map((row) => row.id)
		)
	);

	const byReference = new Map(
		inserted.map((row) => [`${row.bookId}:${row.chapter}:${row.verse}`, row.id])
	);

	const wordRows: NewVerseWord[] = [];
	for (const verse of batch) {
		const verseId = byReference.get(`${verse.book}:${verse.chapter}:${verse.verse}`);
		if (verseId === undefined) continue;

		for (const word of wordsFromSegments(verse.segments)) {
			wordRows.push({
				resourceId,
				verseId,
				bookId: verse.book,
				position: word.position,
				word: word.text,
				strong: word.strong,
				morph: word.morph ?? null
			});
		}
	}

	// Each row binds six parameters, so keep well below PostgreSQL's 65535 parameter ceiling.
	const wordBatchSize = 2000;
	for (let index = 0; index < wordRows.length; index += wordBatchSize) {
		await db.insert(verseWords).values(wordRows.slice(index, index + wordBatchSize));
	}

	return { verses: inserted.length, words: wordRows.length };
}

/**
 * Derives which books the resource covers, with per-book chapter and verse counts, straight from the
 * rows just written. Cheaper and more trustworthy than accumulating counters while streaming.
 */
async function writeBookStatistics(db: Database, resourceId: string): Promise<void> {
	// `chapter_count` is the highest chapter number present, not how many chapters exist. Navigation
	// clamps against it, and a resource that covers only part of a book — a fixture, a single-chapter
	// commentary sample, a partial translation — would otherwise be clamped below its own content.
	await db.execute(sql`
		insert into ${resourceBooks} (resource_id, book_id, chapter_count, verse_count)
		select resource_id, book_id, max(chapter)::int, count(*)::int
		from ${verses}
		where resource_id = ${resourceId}
		group by resource_id, book_id
		on conflict (resource_id, book_id) do update
		set chapter_count = excluded.chapter_count, verse_count = excluded.verse_count
	`);

	// Record whether the resource carries Strong's numbers and morphology, which drives the reader UI.
	await db.execute(sql`
		update ${resources} set
			has_strongs = exists (
				select 1 from ${verseWords} where resource_id = ${resourceId}
			),
			has_morphology = exists (
				select 1 from ${verseWords} where resource_id = ${resourceId} and morph is not null
			),
			canon = case
				when not exists (select 1 from ${verses} where resource_id = ${resourceId} and book_id >= 40) then 'ot'
				when not exists (select 1 from ${verses} where resource_id = ${resourceId} and book_id < 40) then 'nt'
				else 'both'
			end
		where id = ${resourceId}
	`);
}

function bookLabel(bookId: number): string {
	return bookById(bookId)?.osisId ?? `Buch ${bookId}`;
}

/**
 * Removes a resource. Private comments belonging to a Bible are moved to another Bible in the same
 * transaction. If a user already commented on the same verse in the destination translation, both
 * notes are retained and separated visibly.
 */
export async function deleteResource(
	db: Database,
	resourceId: string,
	replacementResourceId?: string
): Promise<number> {
	return db.transaction(async (tx) => {
		const [resource] = await tx
			.select({
				kind: resources.kind,
				abbrev: resources.abbrev,
				tabTitle: resources.tabTitle
			})
			.from(resources)
			.where(eq(resources.id, resourceId))
			.limit(1);

		if (!resource) throw new Error('resource not found');

		let transferredComments = 0;
		if (resource.kind === 'bible') {
			if (!replacementResourceId) throw new Error('replacement Bible required');
			const [replacement] = await tx
				.select({ id: resources.id })
				.from(resources)
				.where(
					and(
						eq(resources.id, replacementResourceId),
						eq(resources.kind, 'bible'),
						ne(resources.id, resourceId)
					)
				)
				.limit(1);
			if (!replacement) throw new Error('invalid replacement Bible');
			const transferLabel = sanitizeNoteHtml(
				`<p><strong>Übertragen aus ${resource.tabTitle ?? resource.abbrev}</strong></p>`
			);
			const commentCounts = await tx
				.select({ value: count() })
				.from(verseComments)
				.where(eq(verseComments.resourceId, resourceId));
			transferredComments = commentCounts[0]?.value ?? 0;

			await tx.execute(sql`
				insert into verse_comments (
					id, user_id, book_id, chapter, verse, resource_id, comment_html, created_at, updated_at
				)
				select
					gen_random_uuid(), user_id, book_id, chapter, verse, ${replacementResourceId}, comment_html,
					created_at, updated_at
				from verse_comments
				where resource_id = ${resourceId}
				on conflict (user_id, resource_id, book_id, chapter, verse) do update
				set comment_html = verse_comments.comment_html
					|| ${transferLabel}
					|| excluded.comment_html,
					updated_at = greatest(verse_comments.updated_at, excluded.updated_at)
			`);
			await tx.delete(verseComments).where(eq(verseComments.resourceId, resourceId));
		}

		await tx.delete(resources).where(eq(resources.id, resourceId));
		return transferredComments;
	});
}
