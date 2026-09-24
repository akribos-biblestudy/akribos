/**
 * Import entry point shared by the CLI and the admin UI.
 *
 * Maps a detected format to the resource kind it produces, then hands the parser's event stream to
 * the matching ingester. Keeping the dispatch here means the two front ends cannot drift apart.
 */

import { parserFor } from '../../bible/parse/index.ts';
import type { SourceFormat, SourceInput } from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import { refreshStrongStatistics } from '../db/statistics.ts';
import { ingestBible, type IngestOptions } from './ingest-bible.ts';
import { ingestLexicon } from './ingest-lexicon.ts';
import { ingestMorphology } from './ingest-morphology.ts';
import { ingestCommentary, ingestCrossReferences } from './ingest-simple.ts';
import { readSwordModule } from './sword.ts';
import { readUsxArchive } from './usx-archive.ts';

export type ResourceKind = 'bible' | 'lexicon' | 'commentary' | 'xrefs' | 'morphology';

const KIND_BY_FORMAT: Record<SourceFormat, ResourceKind> = {
	zefania: 'bible',
	'zefania-commentary': 'commentary',
	'sword-bible': 'bible',
	'sword-commentary': 'commentary',
	osis: 'bible',
	usfm: 'bible',
	usx: 'bible',
	'usx-zip': 'bible',
	usfx: 'bible',
	vpl: 'bible',
	'strongs-xml': 'lexicon',
	'hebrew-lexicon-xml': 'lexicon',
	tsp: 'morphology',
	tsk: 'xrefs',
	'commentary-csv': 'commentary',
	'commentary-thml': 'commentary'
};

export function resourceKindForFormat(format: SourceFormat): ResourceKind {
	return KIND_BY_FORMAT[format];
}

export type RunImportOptions = {
	format: SourceFormat;
	input: SourceInput;
	sourceFile?: string;
	/** Original upload name, before storage adds a timestamp. */
	sourceName?: string;
	overrides?: IngestOptions['overrides'];
	/** Target resource for kinds that annotate an existing one, such as morphology overlays. */
	targetResourceId?: string;
	onProgress?: (progress: { done: number; message?: string }) => void | Promise<void>;
};

export type RunImportResult = {
	resourceId: string;
	kind: ResourceKind;
	/** Rows written, whichever kind of row this import produces. */
	count: number;
	/** Tagged words written, for bible imports. */
	wordCount?: number;
	warnings: string[];
};

export async function runImport(db: Database, options: RunImportOptions): Promise<RunImportResult> {
	const kind = resourceKindForFormat(options.format);
	const stream =
		options.format === 'sword-bible' || options.format === 'sword-commentary'
			? options.sourceFile
				? readSwordModule(options.sourceFile, options.format)
				: (() => {
						throw new Error('SWORD imports require the original archive file');
					})()
			: options.format === 'usx-zip'
				? options.sourceFile
					? readUsxArchive(options.sourceFile, options.sourceName)
					: (() => {
							throw new Error('USX ZIP imports require the original archive file');
						})()
				: parserFor(options.format)(options.input);

	switch (kind) {
		case 'bible': {
			const result = await ingestBible(db, stream, {
				sourceFormat: options.format,
				...(options.sourceFile ? { sourceFile: options.sourceFile } : {}),
				...(options.overrides ? { overrides: options.overrides } : {}),
				onProgress: ({ verses, message }) =>
					options.onProgress?.({ done: verses, ...(message ? { message } : {}) })
			});

			// Word-level statistics only change with a bible import.
			await refreshStrongStatistics(db);

			return {
				resourceId: result.resourceId,
				kind,
				count: result.verseCount,
				wordCount: result.wordCount,
				warnings: result.warnings
			};
		}

		case 'lexicon': {
			const result = await ingestLexicon(db, stream, {
				sourceFormat: options.format,
				...(options.sourceFile ? { sourceFile: options.sourceFile } : {}),
				...(options.overrides?.id ? { id: options.overrides.id } : {}),
				...(options.overrides?.name ? { name: options.overrides.name } : {}),
				onProgress: ({ entries }) => options.onProgress?.({ done: entries })
			});

			return {
				resourceId: result.resourceId,
				kind,
				count: result.entryCount,
				warnings: result.warnings
			};
		}

		case 'morphology': {
			const result = await ingestMorphology(db, stream, {
				sourceFormat: options.format,
				...(options.sourceFile ? { sourceFile: options.sourceFile } : {}),
				...(options.targetResourceId ? { targetResourceId: options.targetResourceId } : {}),
				onProgress: ({ annotations, message }) =>
					options.onProgress?.({ done: annotations, ...(message ? { message } : {}) })
			});

			return {
				resourceId: result.resourceId,
				kind,
				count: result.count,
				warnings: result.warnings
			};
		}

		case 'xrefs':
		case 'commentary': {
			const ingester = kind === 'xrefs' ? ingestCrossReferences : ingestCommentary;
			const result = await ingester(db, stream, {
				sourceFormat: options.format,
				...(options.sourceFile ? { sourceFile: options.sourceFile } : {}),
				...(options.overrides ? { overrides: options.overrides } : {}),
				onProgress: ({ rows }) => options.onProgress?.({ done: rows })
			});

			return {
				resourceId: result.resourceId,
				kind: result.kind,
				count: result.count,
				warnings: result.warnings
			};
		}
	}
}

export { deleteResource } from './ingest-bible.ts';
