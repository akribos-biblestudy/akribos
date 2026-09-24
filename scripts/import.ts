/**
 * Command-line importer.
 *
 * Runs the same parsers and the same ingesters as the admin UI; it exists so seeding a fresh database
 * does not mean clicking through the upload wizard once per resource.
 *
 *   pnpm data:import data/bibles/GER_ELB1905_STRONG.xml
 *   pnpm data:import data/strongsgreek.xml
 *   pnpm data:import --id ELB1905 --name "Elberfelder 1905" data/bibles/GER_ELB1905_STRONG.xml
 *   pnpm data:import --format zefania path/to/file.xml
 */

import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { detectFormat } from '../src/lib/bible/parse/detect.ts';
import { DETECTION_PREFIX_BYTES } from '../src/lib/bible/parse/detect.ts';
import type { SourceFormat } from '../src/lib/bible/parse/types.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { runImport } from '../src/lib/server/import/index.ts';
import { detectSwordFormat } from '../src/lib/server/import/sword.ts';
import { detectUsxArchive } from '../src/lib/server/import/usx-archive.ts';

type Options = {
	file: string;
	format?: SourceFormat;
	id?: string;
	name?: string;
	abbrev?: string;
	language?: string;
	target?: string;
};

function parseArguments(argv: string[]): Options {
	const options: Partial<Options> = {};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]!;
		if (!argument.startsWith('--')) {
			options.file = argument;
			continue;
		}

		const key = argument.slice(2);
		const value = argv[index + 1];
		if (value === undefined) throw new Error(`--${key} needs a value`);
		index += 1;

		switch (key) {
			case 'format':
				options.format = value as SourceFormat;
				break;
			case 'id':
				options.id = value;
				break;
			case 'name':
				options.name = value;
				break;
			case 'abbrev':
				options.abbrev = value;
				break;
			case 'language':
				options.language = value;
				break;
			case 'target':
				options.target = value;
				break;
			default:
				throw new Error(`unknown option --${key}`);
		}
	}

	if (!options.file) {
		throw new Error(
			'usage: pnpm data:import [--format f] [--id id] [--name name] [--target resource] <file>'
		);
	}

	return options as Options;
}

/** Reads the head of the file for format detection, without loading the whole thing. */
async function readPrefix(path: string): Promise<string> {
	const handle = await open(path, 'r');
	try {
		const buffer = Buffer.alloc(DETECTION_PREFIX_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, DETECTION_PREFIX_BYTES, 0);
		return buffer.subarray(0, bytesRead).toString('utf8');
	} finally {
		await handle.close();
	}
}

async function* readChunks(...paths: string[]): AsyncIterable<string> {
	for (const path of paths) {
		for await (const chunk of createReadStream(path, {
			encoding: 'utf8',
			highWaterMark: 1 << 20
		})) {
			yield chunk as string;
		}
		// Guarantee a line break between concatenated files, so the last line of one is not glued to
		// the first line of the next.
		yield '\n';
	}
}

/**
 * Expands a directory into the files it contains, sorted by name.
 *
 * Some resources are published as one file per book — the morphology data in `data/books` is 27 TSP
 * files — and they have to be imported as a single overlay, in canonical order.
 */
async function resolveInputs(path: string): Promise<string[]> {
	const info = await stat(path);
	if (!info.isDirectory()) return [path];

	const entries = await readdir(path, { withFileTypes: true });
	const files = entries
		.filter(
			(entry) => entry.isFile() && /\.(tsp|usfm|sfm|usx|txt|xml|csv|tsv|zip)$/i.test(entry.name)
		)
		.map((entry) => join(path, entry.name))
		.sort();

	if (files.length === 0) throw new Error(`no importable files found in ${path}`);
	return files;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const options = parseArguments(process.argv.slice(2));
const path = resolve(options.file);
const inputs = await resolveInputs(path);
if (inputs.length > 1) console.log(`reading ${inputs.length} files from ${options.file}`);

let resolvedDetection: { format: SourceFormat; reason: string } | null = options.format
	? { format: options.format, reason: 'given on the command line' }
	: null;
if (!options.format) {
	const first = inputs[0]!;
	const bytes = first.toLowerCase().endsWith('.zip')
		? new Uint8Array(await readFile(first))
		: undefined;
	const archive = bytes ? (detectSwordFormat(bytes) ?? detectUsxArchive(bytes)) : null;
	resolvedDetection = archive
		? { format: archive, reason: 'ZIP archive contents' }
		: detectFormat(await readPrefix(first), basename(first));
}

if (!resolvedDetection) {
	console.error(
		`could not recognise the format of ${options.file}. Pass --format explicitly; see docs/importing.md`
	);
	process.exit(1);
}

if (resolvedDetection.format === 'usx-zip' && (inputs.length !== 1 || inputs[0] !== path)) {
	throw new Error('Please import one USX ZIP file at a time.');
}

console.log(`format: ${resolvedDetection.format} (${resolvedDetection.reason})`);

const { client, db } = createDb(databaseUrl, { max: 4 });
const started = Date.now();

try {
	let lastLine = '';
	let lastMessage = '';

	const result = await runImport(db, {
		format: resolvedDetection.format,
		input: readChunks(...inputs),
		sourceFile: path,
		...(options.target ? { targetResourceId: options.target } : {}),
		overrides: {
			...(options.id ? { id: options.id } : {}),
			...(options.name ? { name: options.name } : {}),
			...(options.abbrev ? { abbrev: options.abbrev } : {}),
			...(options.language ? { language: options.language } : {})
		},
		onProgress: ({ done, message }) => {
			const line = `  ${done.toLocaleString('de-DE')}${message ? ` — ${message}` : ''}`;
			if (line === lastLine) return;
			lastLine = line;
			// Overwrite a single line on a terminal; in a log, print only when the label changes.
			if (process.stdout.isTTY) process.stdout.write(`\r${line.padEnd(60)}`);
			else if (message && message !== lastMessage) {
				lastMessage = message;
				console.log(line);
			}
		}
	});

	if (process.stdout.isTTY) process.stdout.write('\n');

	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	const detail =
		result.wordCount === undefined
			? `${result.count.toLocaleString('de-DE')} entries`
			: `${result.count.toLocaleString('de-DE')} verses, ${result.wordCount.toLocaleString('de-DE')} tagged words`;
	console.log(`imported ${result.resourceId} (${result.kind}): ${detail} in ${seconds}s`);

	if (result.warnings.length > 0) {
		console.log(`\n${result.warnings.length} warning(s):`);
		for (const warning of result.warnings.slice(0, 20)) console.log(`  - ${warning}`);
		if (result.warnings.length > 20) console.log(`  … and ${result.warnings.length - 20} more`);
	}
} catch (error) {
	if (process.stdout.isTTY) process.stdout.write('\n');
	console.error('import failed:', error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	await client.end();
}
