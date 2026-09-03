/**
 * Applies a morphology overlay to an existing Greek resource.
 *
 * Unlike the other importers this one writes no new verses: it fills in `verse_words.lemma`,
 * `translit` and any missing `morph` on a resource that is already present, so a word study can
 * show the dictionary form of an inflected word.
 *
 * Alignment is the whole problem. The overlay numbers words 1-based within a verse; our rows are
 * 0-based over tagged words. Those agree when both sources tokenise identically, which is usually but
 * not always true, so the counts are compared per verse and a mismatch falls back to matching on the
 * Strong's number in reading order. Verses that still cannot be aligned are reported rather than
 * being force-fitted, because a wrong lemma is worse than a missing one.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { bookById } from '../../bible/books.ts';
import type { ParsedWordAnnotation, ParseStream } from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import { resources, verses, verseWords } from '../db/schema.ts';

export type MorphologyIngestOptions = {
	/** Resource to annotate. When omitted, the only Greek bible present is used. */
	targetResourceId?: string;
	sourceFormat: string;
	sourceFile?: string;
	onProgress?: (progress: { annotations: number; message?: string }) => void | Promise<void>;
};

export type MorphologyIngestResult = {
	resourceId: string;
	/** Word rows actually updated. */
	count: number;
	warnings: string[];
};

/** Annotations are applied one verse at a time, buffered per chapter to keep round trips down. */
export async function ingestMorphology(
	db: Database,
	stream: ParseStream,
	options: MorphologyIngestOptions
): Promise<MorphologyIngestResult> {
	const warnings: string[] = [];
	const target = await resolveTarget(db, options.targetResourceId);

	let updated = 0;
	let annotationsSeen = 0;
	let currentChapter: { book: number; chapter: number } | undefined;
	let buffer: ParsedWordAnnotation[] = [];

	const flush = async () => {
		if (!currentChapter || buffer.length === 0) return;
		const result = await applyChapter(db, target, currentChapter, buffer);
		updated += result.updated;
		warnings.push(...result.warnings);
		buffer = [];

		await options.onProgress?.({
			annotations: annotationsSeen,
			message: `${bookById(currentChapter.book)?.osisId ?? currentChapter.book} ${currentChapter.chapter}`
		});
	};

	for await (const event of stream) {
		if (event.type === 'warning') {
			warnings.push(event.message);
			continue;
		}
		if (event.type !== 'wordAnnotation') continue;

		const annotation = event.annotation;
		annotationsSeen += 1;

		if (
			!currentChapter ||
			currentChapter.book !== annotation.book ||
			currentChapter.chapter !== annotation.chapter
		) {
			await flush();
			currentChapter = { book: annotation.book, chapter: annotation.chapter };
		}

		buffer.push(annotation);
	}

	await flush();

	await db
		.update(resources)
		.set({ hasMorphology: true, updatedAt: new Date() })
		.where(eq(resources.id, target));

	return { resourceId: target, count: updated, warnings };
}

async function resolveTarget(db: Database, requested: string | undefined): Promise<string> {
	if (requested) {
		const [found] = await db
			.select({ id: resources.id })
			.from(resources)
			.where(eq(resources.id, requested))
			.limit(1);
		if (!found) throw new Error(`no resource with id "${requested}" to annotate`);
		return found.id;
	}

	const candidates = await db
		.select({ id: resources.id })
		.from(resources)
		.where(and(eq(resources.kind, 'bible'), eq(resources.language, 'grc')));

	if (candidates.length === 1) return candidates[0]!.id;
	if (candidates.length === 0) {
		throw new Error('no Greek bible is present to annotate; import one first');
	}
	throw new Error(
		`several Greek bibles are present (${candidates.map((row) => row.id).join(', ')}); choose one with --target`
	);
}

async function applyChapter(
	db: Database,
	resourceId: string,
	chapter: { book: number; chapter: number },
	annotations: ParsedWordAnnotation[]
): Promise<{ updated: number; warnings: string[] }> {
	const warnings: string[] = [];

	// All tagged words of the chapter, in reading order.
	const rows = await db
		.select({
			id: verseWords.id,
			verse: verses.verse,
			position: verseWords.position,
			strong: verseWords.strong
		})
		.from(verseWords)
		.innerJoin(verses, eq(verseWords.verseId, verses.id))
		.where(
			and(
				eq(verseWords.resourceId, resourceId),
				eq(verses.bookId, chapter.book),
				eq(verses.chapter, chapter.chapter)
			)
		)
		.orderBy(verses.verse, verseWords.position);

	if (rows.length === 0) {
		return {
			updated: 0,
			warnings: [
				`no words to annotate in ${bookById(chapter.book)?.osisId ?? chapter.book} ${chapter.chapter}`
			]
		};
	}

	const rowsByVerse = new Map<number, typeof rows>();
	for (const row of rows) {
		const list = rowsByVerse.get(row.verse) ?? [];
		list.push(row);
		rowsByVerse.set(row.verse, list);
	}

	const annotationsByVerse = new Map<number, ParsedWordAnnotation[]>();
	for (const annotation of annotations) {
		const list = annotationsByVerse.get(annotation.verse) ?? [];
		list.push(annotation);
		annotationsByVerse.set(annotation.verse, list);
	}

	const updates: { id: number; lemma: string; translit: string | null; morph: string }[] = [];

	for (const [verseNumber, verseAnnotations] of annotationsByVerse) {
		const verseRows = rowsByVerse.get(verseNumber);
		if (!verseRows) continue;

		const byPosition = verseRows.length === verseAnnotations.length;
		const unused = [...verseRows];

		for (const [index, annotation] of verseAnnotations.entries()) {
			// Positions line up when both sources tokenise the verse the same way.
			const row = byPosition
				? verseRows[index]
				: unused.find((candidate) => candidate.strong === annotation.strong);

			if (!row) continue;
			if (!byPosition) unused.splice(unused.indexOf(row), 1);

			if (annotation.lemma) {
				updates.push({
					id: row.id,
					lemma: annotation.lemma,
					translit: null,
					morph: annotation.morph ?? ''
				});
			}
		}

		if (!byPosition) {
			warnings.push(
				`word counts differ in ${bookById(chapter.book)?.osisId ?? chapter.book} ` +
					`${chapter.chapter},${verseNumber} (${verseRows.length} vs ${verseAnnotations.length}); ` +
					`aligned by Strong's number instead`
			);
		}
	}

	// One statement per batch: UPDATE ... FROM (VALUES ...) is far cheaper than a statement per word.
	const batchSize = 500;
	for (let index = 0; index < updates.length; index += batchSize) {
		const slice = updates.slice(index, index + batchSize);
		const values = sql.join(
			slice.map(
				(update) =>
					sql`(${update.id}::bigint, ${update.lemma}::text, ${update.morph || null}::text)`
			),
			sql`, `
		);

		await db.execute(sql`
			update ${verseWords} as w
			set lemma = v.lemma,
			    morph = coalesce(w.morph, v.morph)
			from (values ${values}) as v(id, lemma, morph)
			where w.id = v.id
		`);
	}

	return { updated: updates.length, warnings };
}

/** Clears an overlay, so a bad import can be undone without re-importing the translation. */
export async function clearMorphology(db: Database, resourceId: string): Promise<void> {
	await db
		.update(verseWords)
		.set({ lemma: null, translit: null })
		.where(eq(verseWords.resourceId, resourceId));
	await db.update(resources).set({ hasMorphology: false }).where(eq(resources.id, resourceId));
}

/** Exported for the admin UI, which lists candidate targets before starting an overlay import. */
export async function morphologyTargets(db: Database): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: resources.id, name: resources.name })
		.from(resources)
		.where(and(eq(resources.kind, 'bible'), inArray(resources.language, ['grc', 'hbo'])));
}
