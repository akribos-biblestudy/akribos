/**
 * Adapter for installed SWORD modules as distributed in CrossWire's raw ZIP packages.
 *
 * The binary module formats (zText/zCom and their raw variants) are deliberately read through
 * CrossWire's own `diatheke` frontend. Reimplementing its versification, compression and markup
 * filters here would produce subtly different results for real-world modules.
 */

import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { BOOKS } from '../../bible/books.ts';
import { findBookId } from '../../bible/book-names.ts';
import { parseOsis } from '../../bible/parse/osis.ts';
import { sanitizeHtml } from '../../bible/parse/commentary.ts';
import type { ParseStream, ResourceMetadata } from '../../bible/parse/types.ts';

const execFile = promisify(execFileCallback);

export type SwordFormat = 'sword-bible' | 'sword-commentary';

type SwordConfiguration = {
	module: string;
	values: Map<string, string>;
};

export function detectSwordFormat(contents: Uint8Array): SwordFormat | null {
	if (!isZip(contents)) return null;
	const entry = zipEntries(contents).find((candidate) =>
		/(^|\/)mods\.d\/[^/]+\.conf$/i.test(candidate.name)
	);
	if (!entry) return null;
	const configuration = parseConfiguration(entry.text);
	return formatForDriver(configuration.values.get('moddrv'));
}

export async function* readSwordModule(
	archivePath: string,
	expectedFormat: SwordFormat
): ParseStream {
	const temporary = await mkdtemp(join(tmpdir(), 'strongs-sword-'));

	try {
		const { stdout: listing } = await run('unzip', ['-Z1', archivePath]);
		for (const name of listing.split(/\r?\n/).filter(Boolean)) {
			const destination = resolve(temporary, name);
			if (
				name.startsWith('/') ||
				name.includes('\0') ||
				(destination !== temporary && !destination.startsWith(`${temporary}${sep}`))
			) {
				throw new Error(`SWORD archive contains an unsafe path: ${name}`);
			}
		}
		await run('unzip', ['-q', archivePath, '-d', temporary]);

		const confPath = await findConfiguration(temporary);
		if (!confPath) throw new Error('the SWORD archive contains no mods.d/*.conf file');
		const configuration = parseConfiguration(await readFile(confPath, 'utf8'));
		const actualFormat = formatForDriver(configuration.values.get('moddrv'));
		if (!actualFormat) {
			throw new Error(
				`unsupported SWORD module driver "${configuration.values.get('moddrv') ?? '?'}"; Bible and commentary modules are supported`
			);
		}
		if (actualFormat !== expectedFormat) {
			throw new Error(`the archive contains a ${actualFormat}, not a ${expectedFormat}`);
		}

		const swordRoot = dirname(dirname(confPath));
		const environment = { ...process.env, SWORD_PATH: swordRoot };
		const available = await run('diatheke', ['-b', 'system', '-k', 'modulelistnames'], environment);
		if (!available.stdout.split(/\s+/).includes(configuration.module)) {
			throw new Error(`SWORD could not load module "${configuration.module}" from the archive`);
		}

		const metadata = swordMetadata(configuration);
		yield { type: 'metadata', metadata };

		let count = 0;
		for (const book of BOOKS) {
			const before = count;
			let rendered = '';
			if (expectedFormat === 'sword-bible') {
				const result = await run(
					'diatheke',
					[
						'-b',
						configuration.module,
						'-o',
						'nfmhs',
						'-f',
						'OSIS',
						'-e',
						'UTF8',
						'-k',
						book.osisId
					],
					environment
				);
				rendered = result.stdout;
				const document = swordBookAsOsis(result.stdout, book.id, book.osisId);
				if (document) {
					for await (const event of parseOsis(document)) {
						if (event.type === 'verse' || event.type === 'warning') {
							if (event.type === 'verse') count += 1;
							yield event;
						}
					}
				}
			} else {
				// Read the book twice, with and without diatheke's section-heading filter ("h" in `-o`).
				// A commentary section's heading has no other structural marker in diatheke's flattened
				// OSIS output — it is plain text merged straight into the body — so the only way to tell
				// the two apart is to diff a rendering that has it against one that does not.
				const [withHeadings, withoutHeadings] = await Promise.all([
					run(
						'diatheke',
						[
							'-b',
							configuration.module,
							'-o',
							'nfmhs',
							'-f',
							'OSIS',
							'-e',
							'UTF8',
							'-k',
							book.osisId
						],
						environment
					),
					run(
						'diatheke',
						[
							'-b',
							configuration.module,
							'-o',
							'nfms',
							'-f',
							'OSIS',
							'-e',
							'UTF8',
							'-k',
							book.osisId
						],
						environment
					)
				]);
				rendered = withHeadings.stdout;
				for (const entry of swordCommentaryEntries(
					withHeadings.stdout,
					withoutHeadings.stdout,
					book.id
				)) {
					count += 1;
					yield { type: 'commentaryEntry', entry };
				}
			}

			// A book the module simply does not cover renders as nothing at all, so text that yields no
			// reference means the output was there and could not be read. That is worth saying out loud:
			// the reader would otherwise just show an empty column for those books, as it did while
			// SWORD's `II Thessalonians` and `Song of Solomon` went unrecognised.
			if (count === before && hasRenderedText(rendered)) {
				yield {
					type: 'warning',
					message: `no readable references in the output for ${book.osisId}`
				};
			}

			yield {
				type: 'progress',
				done: count,
				message: `${book.id} / ${BOOKS.length} Bücher`
			};
		}

		if (count === 0) {
			throw new Error(
				`SWORD module "${configuration.module}" was loaded but contained no readable canonical Bible references`
			);
		}
		yield { type: 'progress', done: count, total: count };
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

/** Whether diatheke printed anything beyond its trailing `(ModuleName)` line for an absent book. */
function hasRenderedText(output: string): boolean {
	return output.split(/\r?\n/).some((raw) => raw.trim() !== '' && !/^\([^)]+\)$/.test(raw.trim()));
}

function swordBookAsOsis(output: string, expectedBook: number, osisId: string): string | null {
	const verses: string[] = [];
	for (const parsed of parseDiathekeOutput(output, expectedBook)) {
		verses.push(
			`<verse osisID="${osisId}.${parsed.chapter}.${parsed.verse}">${parsed.content}</verse>`
		);
	}
	if (verses.length === 0) return null;
	return `<osis><osisText osisIDWork="SWORD"><div type="book" osisID="${osisId}">${verses.join('')}</div></osisText></osis>`;
}

type CommentarySection = {
	book: number;
	chapter: number;
	verseStart: number;
	verseEnd: number;
	title?: string;
	bodyHtml: string;
};

/**
 * Turns diatheke's per-verse commentary text into per-section entries.
 *
 * A SWORD zCom module stores one block of text per commented section (often several verses, e.g.
 * `annotateRef="Gen.1.3-Gen.1.5"`) and maps every verse in that range to the same block. Asking
 * diatheke for each verse individually therefore returns byte-identical text for every verse in a
 * section — which is exactly how the section's range is recovered here: consecutive verses of the same
 * chapter with identical rendered content are merged back into one entry spanning `verseStart..verseEnd`,
 * rather than imported as repeated, single-verse duplicates.
 *
 * `withHeadings`/`withoutHeadings` are the same book read twice, with diatheke's section-heading filter
 * ("h" in `-o`) toggled. See `extractTitle` for why both are needed to recover the heading text.
 */
export function* swordCommentaryEntries(
	withHeadings: string,
	withoutHeadings: string,
	expectedBook?: number
): Generator<CommentarySection> {
	const headed = [...parseDiathekeOutput(withHeadings, expectedBook)];
	const plain = [...parseDiathekeOutput(withoutHeadings, expectedBook)];
	const alignedPlain =
		headed.length === plain.length &&
		headed.every(
			(entry, index) =>
				entry.book === plain[index]!.book &&
				entry.chapter === plain[index]!.chapter &&
				entry.verse === plain[index]!.verse
		);

	type PendingSection = {
		book: number;
		chapter: number;
		verseStart: number;
		verseEnd: number;
		title: string | undefined;
		plainContent: string;
	};
	let pending: PendingSection | null = null;

	function* flush(): Generator<CommentarySection> {
		if (!pending) return;
		const bodyHtml = sanitizeHtml(pending.plainContent);
		if (bodyHtml) {
			yield {
				book: pending.book,
				chapter: pending.chapter,
				verseStart: pending.verseStart,
				verseEnd: pending.verseEnd,
				...(pending.title ? { title: pending.title } : {}),
				bodyHtml
			};
		}
	}

	for (const [index, verse] of headed.entries()) {
		const plainContent = alignedPlain ? plain[index]!.content : verse.content;

		if (
			pending &&
			pending.book === verse.book &&
			pending.chapter === verse.chapter &&
			pending.verseEnd + 1 === verse.verse &&
			pending.plainContent === plainContent
		) {
			pending.verseEnd = verse.verse;
			continue;
		}

		yield* flush();
		pending = {
			book: verse.book,
			chapter: verse.chapter,
			verseStart: verse.verse,
			verseEnd: verse.verse,
			title: alignedPlain ? extractTitle(verse.content, plainContent) : undefined,
			plainContent
		};
	}
	yield* flush();
}

/**
 * Recovers a section's heading by diffing the same text rendered with and without diatheke's
 * section-heading filter. The filter has no output of its own for the heading (no tag, no delimiter) —
 * it either merges the heading straight into the body as plain text, or drops it entirely — so the
 * heading can only be isolated as whatever leading text disappears when the filter is turned off.
 *
 * This only recovers a clean, single heading: a book/testament introduction can bundle several
 * unrelated headings into one block (e.g. "Einleitung Downloads Über den Autor …"), which does not
 * reduce to "one heading, then the body" — `withoutHeading` is then not a clean trailing match and no
 * title is extracted, leaving that block's text exactly as before.
 */
export function extractTitle(withHeading: string, withoutHeading: string): string | undefined {
	const headed = withHeading.trim();
	const body = withoutHeading.trim();
	if (body.length === 0 || headed.length <= body.length || !headed.endsWith(body)) return undefined;
	const title = headed.slice(0, headed.length - body.length).trim();
	return title || undefined;
}

/**
 * Book a reference in front of `<chapter>:<verse>:` names, taking the **longest** trailing phrase
 * that resolves.
 *
 * Shortest-first would be wrong for every numbered book: SWORD writes the number as a separate word
 * (`II Samuel`), and the one-word suffix of such a name is another book's historical bare alias —
 * `Samuel` has meant 1.Samuel since the old site, so `II Samuel` would file itself under 1.Samuel.
 * Up to four words, because `Revelation of John` and `Song of Solomon` are three.
 */
function bookFromPrefix(prefix: string): number | undefined {
	const words = prefix.split(/\s+/);
	for (let length = Math.min(4, words.length); length >= 1; length -= 1) {
		const book = findBookId(words.slice(-length).join(' '));
		if (book) return book;
	}
	return undefined;
}

/**
 * `expectedBook` is the book diatheke was asked for and therefore the book every verse it printed
 * belongs to. It takes precedence over the name in the output, which is written in whichever locale
 * SWORD happens to resolve and is not something this importer can rely on reading.
 */
function parseDiathekeLine(line: string, expectedBook?: number) {
	const padded = ` ${line}`;
	const reference = /\s(\d+):(\d+):\s*/g;
	for (let match = reference.exec(padded); match; match = reference.exec(padded)) {
		const prefix = padded.slice(0, match.index).trim();
		// A wrapped continuation line carries no reference of its own, so a bare `3:16:` inside the
		// body text must never start a verse — only something that could be a book name may.
		if (!prefix) continue;
		const book = expectedBook ?? bookFromPrefix(prefix);
		if (!book) continue;
		const chapter = Number(match[1]);
		const verse = Number(match[2]);
		if (!chapter || !verse) return null;
		return {
			book,
			chapter,
			verse,
			content: padded.slice(match.index + match[0].length)
		};
	}
	return null;
}

export function* parseDiathekeOutput(output: string, expectedBook?: number) {
	let pending: ReturnType<typeof parseDiathekeLine> = null;
	for (const raw of output.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || /^\([^)]+\)$/.test(line)) continue;
		const parsed = parseDiathekeLine(line, expectedBook);
		if (parsed) {
			if (pending) yield pending;
			pending = parsed;
		} else if (pending) {
			pending.content += ` ${line}`;
		}
	}
	if (pending) yield pending;
}

function swordMetadata(configuration: SwordConfiguration): ResourceMetadata {
	const value = (key: string) => configuration.values.get(key);
	const name = value('description') ?? configuration.module;
	const language = (value('lang') ?? 'de').toLowerCase();
	const license = value('distributionlicense');
	return {
		id: configuration.module
			.replace(/[^\w]+/g, '')
			.toUpperCase()
			.slice(0, 32),
		name,
		abbrev: value('abbreviation') ?? configuration.module,
		language,
		...(license ? { licenseHtml: license } : {}),
		...(value('about') ? { description: value('about')! } : {})
	};
}

function parseConfiguration(text: string): SwordConfiguration {
	const unfolded = text.replace(/\\\r?\n/g, '');
	const section = /^\s*\[([^\]]+)\]/m.exec(unfolded)?.[1]?.trim();
	if (!section) throw new Error('invalid SWORD module configuration: module name is missing');
	const values = new Map<string, string>();
	for (const line of unfolded.split(/\r?\n/)) {
		const match = /^\s*([^#;=\s]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (match && !values.has(match[1]!.toLowerCase())) {
			values.set(match[1]!.toLowerCase(), match[2]!);
		}
	}
	return { module: section, values };
}

function formatForDriver(driver: string | undefined): SwordFormat | null {
	if (/^(?:rawtext4?|ztext4?)$/i.test(driver ?? '')) return 'sword-bible';
	if (/^(?:rawcom4?|zcom4?|hrefcom|rawfiles)$/i.test(driver ?? '')) return 'sword-commentary';
	return null;
}

async function findConfiguration(root: string): Promise<string | null> {
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.shift()!;
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) pending.push(path);
			else if (
				entry.isFile() &&
				entry.name.toLowerCase().endsWith('.conf') &&
				relative(root, path).split(sep).includes('mods.d')
			) {
				return path;
			}
		}
	}
	return null;
}

async function run(command: string, args: string[], env = process.env) {
	try {
		return await execFile(command, args, {
			env,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(
				`${command} is required for SWORD imports but is not installed in this runtime`,
				{ cause: error }
			);
		}
		throw error;
	}
}

function isZip(contents: Uint8Array): boolean {
	return (
		contents.length >= 4 &&
		contents[0] === 0x50 &&
		contents[1] === 0x4b &&
		contents[2] === 0x03 &&
		contents[3] === 0x04
	);
}

/** Reads the ZIP central directory and inflates only the tiny module configuration during upload. */
function zipEntries(contents: Uint8Array): { name: string; text: string }[] {
	const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength);
	const entries: { name: string; text: string }[] = [];
	let end = contents.length - 22;
	const earliest = Math.max(0, contents.length - 65_557);
	while (end >= earliest && view.getUint32(end, true) !== 0x06054b50) end -= 1;
	if (end < earliest) return entries;

	let offset = view.getUint32(end + 16, true);
	const count = view.getUint16(end + 10, true);
	for (let index = 0; index < count && offset + 46 <= contents.length; index += 1) {
		if (view.getUint32(offset, true) !== 0x02014b50) break;
		const method = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const nameStart = offset + 46;
		const name = new TextDecoder().decode(contents.subarray(nameStart, nameStart + nameLength));

		if (localOffset + 30 > contents.length || view.getUint32(localOffset, true) !== 0x04034b50) {
			break;
		}
		const localNameLength = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		const dataStart = localOffset + 30 + localNameLength + localExtraLength;
		const dataEnd = dataStart + compressedSize;
		if (dataEnd > contents.length) break;
		if (name.toLowerCase().endsWith('.conf')) {
			const compressed = contents.subarray(dataStart, dataEnd);
			const data =
				method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : new Uint8Array();
			if (data.length > 0) entries.push({ name, text: new TextDecoder().decode(data) });
		}
		offset = nameStart + nameLength + extraLength + commentLength;
	}
	return entries;
}
