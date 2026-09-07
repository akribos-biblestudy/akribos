/**
 * Common vocabulary for every importable format.
 *
 * Parsers are async generators that emit a flat event stream rather than returning a whole bible.
 * A complete translation is tens of megabytes of source and hundreds of thousands of rows, so
 * nothing is ever fully materialised: the ingester consumes events in batches and the memory profile
 * stays flat whether the upload is 1 MB or 100 MB.
 */

import type { LexiconTranslation } from '../lexicon.ts';

import type { VerseSegment } from '../segments.ts';

export const SOURCE_FORMATS = [
	'zefania',
	'zefania-commentary',
	'sword-bible',
	'sword-commentary',
	'osis',
	'usfm',
	'usx',
	'usfx',
	'vpl',
	'strongs-xml',
	'hebrew-lexicon-xml',
	'tsp',
	'tsk',
	'commentary-csv',
	'commentary-thml'
] as const;

export type SourceFormat = (typeof SOURCE_FORMATS)[number];

/** Descriptive metadata a source carries about itself. */
export type ResourceMetadata = {
	/** Identifier from the file, e.g. Zefania's `<identifier>`. Falls back to a slug of the title. */
	id: string;
	name: string;
	abbrev: string;
	/** Language tag: `de`, `grc`, `hbo`. */
	language: string;
	direction?: 'ltr' | 'rtl';
	/** Rights notice, shown beneath the column in the reader. */
	licenseHtml?: string;
	description?: string;
};

export type ParsedVerse = {
	book: number;
	chapter: number;
	verse: number;
	/** Set when the source merges a range into one unit, e.g. verses 16-17 printed together. */
	verseEnd?: number;
	segments: VerseSegment[];
	/** Section heading printed before this verse. */
	heading?: string;
};

export type ParsedLexiconEntry = {
	/** Canonical Strong's id, `G26` or `H430`. */
	strong: string;
	language: 'grc' | 'hbo';
	lemma: string;
	transliteration?: string;
	pronunciation?: string;
	definitionHtml?: string;
	derivationHtml?: string;
	kjvDefinitionHtml?: string;
	germanTranslation?: LexiconTranslation;
	seeAlso?: string[];
};

/** Word-level enrichment: lemma and morphology for an existing verse of an existing resource. */
export type ParsedWordAnnotation = {
	book: number;
	chapter: number;
	verse: number;
	/** 1-based word index within the verse, as the source numbers it. */
	position: number;
	strong: string;
	morph?: string;
	lemma?: string;
	surface?: string;
};

export type ParsedCrossReference = {
	fromBook: number;
	fromChapter: number;
	fromVerse: number;
	toBook: number;
	toChapter: number;
	toVerse: number;
	toVerseEnd: number;
	votes: number;
};

export type ParsedCommentaryEntry = {
	book: number;
	chapter: number;
	verseStart?: number;
	verseEnd?: number;
	title?: string;
	bodyHtml: string;
};

/**
 * Events a parser can emit.
 *
 * `warning` is for recoverable problems in the source — an unknown book name, a duplicated verse, a
 * Strong's number out of range. They are collected on the import job and shown in the admin UI
 * instead of being logged and forgotten, because in practice they are how you find out that a
 * downloaded file is subtly broken.
 */
export type ParseEvent =
	| { type: 'metadata'; metadata: ResourceMetadata }
	| { type: 'verse'; verse: ParsedVerse }
	| { type: 'lexiconEntry'; entry: ParsedLexiconEntry }
	| { type: 'wordAnnotation'; annotation: ParsedWordAnnotation }
	| { type: 'crossReference'; crossReference: ParsedCrossReference }
	| { type: 'commentaryEntry'; entry: ParsedCommentaryEntry }
	| { type: 'warning'; message: string }
	/** Reports progress for long sources; `total` may be absent when it is not known up front. */
	| { type: 'progress'; done: number; total?: number; message?: string }
	/** A rights notice that isn't tied to a single entry, e.g. a Strong's dictionary's `<prologue>`.
	 *  Kept separate from `metadata` because a lexicon source has no id/name/abbrev/language of its
	 *  own to report — those are already decided from import options or the first entry. */
	| { type: 'license'; licenseHtml: string }
	/** A dictionary's own "how to read this" preface, e.g. a Strong's dictionary's `<usage_notes>`.
	 *  Kept separate from `license` since it explains reading conventions rather than rights, and a
	 *  page may want to show one without the other. */
	| { type: 'usageNotes'; usageNotesHtml: string };

export type ParseStream = AsyncGenerator<ParseEvent, void, undefined>;

/** What a parser reads: either the whole text or a stream of chunks. */
export type SourceInput = string | AsyncIterable<string>;

export async function* asChunks(input: SourceInput): AsyncIterable<string> {
	if (typeof input === 'string') yield input;
	else yield* input;
}
