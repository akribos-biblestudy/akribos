/**
 * Parser registry: maps a detected format to the generator that reads it.
 */

import type { ParseStream, SourceFormat, SourceInput } from './types.ts';
import { parseHebrewLexiconXml } from './hebrew-lexicon-xml.ts';
import { parseOsis } from './osis.ts';
import { parseStrongsXml } from './strongs-xml.ts';
import { parseTsk } from './tsk.ts';
import { parseTsp } from './tsp.ts';
import { parseUsfm } from './usfm.ts';
import { parseUsfx, parseUsx } from './usx.ts';
import { parseVpl } from './vpl.ts';
import { parseCommentaryCsv, parseCommentaryThml, parseZefaniaCommentary } from './commentary.ts';
import { parseZefania } from './zefania.ts';

export type Parser = (input: SourceInput) => ParseStream;

const parsers: Record<SourceFormat, Parser> = {
	zefania: parseZefania,
	'zefania-commentary': parseZefaniaCommentary,
	'sword-bible': () => {
		throw new Error('SWORD modules must be read from their archived source file');
	},
	'sword-commentary': () => {
		throw new Error('SWORD modules must be read from their archived source file');
	},
	osis: parseOsis,
	usfm: (input) => parseUsfm(input),
	usx: (input) => parseUsx(input),
	'usx-zip': () => {
		throw new Error('USX ZIP imports require the original archive file');
	},
	usfx: (input) => parseUsfx(input),
	vpl: (input) => parseVpl(input),
	'strongs-xml': parseStrongsXml,
	'hebrew-lexicon-xml': parseHebrewLexiconXml,
	tsp: parseTsp,
	tsk: parseTsk,
	'commentary-csv': (input) => parseCommentaryCsv(input),
	'commentary-thml': parseCommentaryThml
};

export function parserFor(format: SourceFormat): Parser {
	const parser = parsers[format];
	if (!parser) throw new Error(`no parser is registered for the format "${format}"`);
	return parser;
}

export function supportedFormats(): SourceFormat[] {
	return Object.keys(parsers) as SourceFormat[];
}

export { detectFormat } from './detect.ts';
export type { ParseEvent, ParseStream, SourceFormat, SourceInput } from './types.ts';
