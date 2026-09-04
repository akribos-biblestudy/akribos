import { unzipSync } from 'fflate';
import { MAX_OBSIDIAN_IMPORT_BYTES } from './documents';

export const MAX_OBSIDIAN_ARCHIVE_BYTES = 16 * 1024 * 1024;
export const MAX_OBSIDIAN_ARCHIVE_ENTRIES = 500;
export const MAX_OBSIDIAN_IMPORT_FILES = 100;
export const MAX_OBSIDIAN_DECOMPRESSED_BYTES = 16 * 1024 * 1024;

export class ObsidianArchiveError extends Error {
	readonly code: 'unsafe_archive' | 'archive_too_large' | 'too_many_files' | 'no_markdown';
	readonly filename?: string;

	constructor(code: ObsidianArchiveError['code'], filename?: string) {
		super(code);
		this.name = 'ObsidianArchiveError';
		this.code = code;
		this.filename = filename;
	}
}

export type ObsidianMarkdownSource = {
	/** Safe leaf filename passed to the Markdown parser and retained as source metadata. */
	filename: string;
	/** Safe relative ZIP path used in diagnostics when two folders contain the same leaf name. */
	archivePath?: string;
	bytes: Uint8Array;
};

function uint16(view: DataView, offset: number): number {
	return view.getUint16(offset, true);
}

function uint32(view: DataView, offset: number): number {
	return view.getUint32(offset, true);
}

export function isSafeObsidianArchivePath(filename: string): boolean {
	if (
		!filename ||
		filename.startsWith('/') ||
		filename.includes('\\') ||
		/^[a-z]:/iu.test(filename) ||
		Array.from(filename).some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code <= 0x1f || code === 0x7f;
		})
	)
		return false;
	return !filename.split('/').some((segment) => segment === '.' || segment === '..');
}

/** Reads the central directory before inflation, blocking traversal, links and ZIP bombs. */
function preflight(bytes: Uint8Array): Map<string, number> {
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_OBSIDIAN_ARCHIVE_BYTES) {
		throw new ObsidianArchiveError('archive_too_large');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let eocd = -1;
	for (
		let offset = bytes.byteLength - 22;
		offset >= Math.max(0, bytes.byteLength - 65_557);
		offset -= 1
	) {
		if (uint32(view, offset) === 0x06054b50) {
			eocd = offset;
			break;
		}
	}
	if (eocd < 0) throw new ObsidianArchiveError('unsafe_archive');
	const entryCount = uint16(view, eocd + 10);
	const diskNumber = uint16(view, eocd + 4);
	const centralDisk = uint16(view, eocd + 6);
	const diskEntryCount = uint16(view, eocd + 8);
	const centralSize = uint32(view, eocd + 12);
	const centralOffset = uint32(view, eocd + 16);
	if (
		diskNumber !== 0 ||
		centralDisk !== 0 ||
		diskEntryCount !== entryCount ||
		entryCount === 0xffff ||
		centralSize === 0xffffffff ||
		centralOffset === 0xffffffff ||
		entryCount > MAX_OBSIDIAN_ARCHIVE_ENTRIES ||
		centralOffset + centralSize > eocd
	)
		throw new ObsidianArchiveError(
			entryCount > MAX_OBSIDIAN_ARCHIVE_ENTRIES ? 'too_many_files' : 'unsafe_archive'
		);

	const decoder = new TextDecoder('utf-8', { fatal: true });
	const markdown = new Map<string, number>();
	let cursor = centralOffset;
	let total = 0;
	for (let index = 0; index < entryCount; index += 1) {
		if (cursor + 46 > bytes.byteLength || uint32(view, cursor) !== 0x02014b50)
			throw new ObsidianArchiveError('unsafe_archive');
		const flags = uint16(view, cursor + 8);
		const method = uint16(view, cursor + 10);
		const uncompressed = uint32(view, cursor + 24);
		const nameLength = uint16(view, cursor + 28);
		const extraLength = uint16(view, cursor + 30);
		const commentLength = uint16(view, cursor + 32);
		const versionMade = uint16(view, cursor + 4);
		const external = uint32(view, cursor + 38);
		const nextCursor = cursor + 46 + nameLength + extraLength + commentLength;
		if (nextCursor > centralOffset + centralSize || cursor + 46 + nameLength > bytes.byteLength) {
			throw new ObsidianArchiveError('unsafe_archive');
		}
		let filename: string;
		try {
			filename = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
		} catch {
			throw new ObsidianArchiveError('unsafe_archive');
		}
		if (!isSafeObsidianArchivePath(filename)) {
			throw new ObsidianArchiveError('unsafe_archive', filename);
		}
		if ((flags & 1) !== 0 || ![0, 8].includes(method) || uncompressed === 0xffffffff) {
			throw new ObsidianArchiveError('unsafe_archive', filename);
		}
		const unixMode = versionMade >> 8 === 3 ? external >>> 16 : 0;
		if ((unixMode & 0xf000) === 0xa000) {
			throw new ObsidianArchiveError('unsafe_archive', filename);
		}
		if (!filename.endsWith('/') && /\.md$/iu.test(filename)) {
			if (uncompressed === 0 || uncompressed > MAX_OBSIDIAN_IMPORT_BYTES)
				throw new ObsidianArchiveError('archive_too_large', filename);
			if (markdown.has(filename)) throw new ObsidianArchiveError('unsafe_archive', filename);
			total += uncompressed;
			if (total > MAX_OBSIDIAN_DECOMPRESSED_BYTES)
				throw new ObsidianArchiveError('archive_too_large');
			markdown.set(filename, uncompressed);
		}
		cursor = nextCursor;
	}
	if (cursor !== centralOffset + centralSize) throw new ObsidianArchiveError('unsafe_archive');
	if (markdown.size === 0) throw new ObsidianArchiveError('no_markdown');
	if (markdown.size > MAX_OBSIDIAN_IMPORT_FILES) throw new ObsidianArchiveError('too_many_files');
	return markdown;
}

export function extractObsidianMarkdownArchive(bytes: Uint8Array): ObsidianMarkdownSource[] {
	const expected = preflight(bytes);
	let extracted: Record<string, Uint8Array>;
	try {
		extracted = unzipSync(bytes);
	} catch {
		throw new ObsidianArchiveError('unsafe_archive');
	}
	const sources: ObsidianMarkdownSource[] = [];
	for (const [filename, size] of expected) {
		const data = extracted[filename];
		if (!data || data.byteLength !== size) throw new ObsidianArchiveError('unsafe_archive');
		sources.push({ filename: filename.split('/').at(-1)!, archivePath: filename, bytes: data });
	}
	return sources.sort((left, right) => left.filename.localeCompare(right.filename, 'de'));
}
