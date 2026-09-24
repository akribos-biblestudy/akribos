/** Bounded, in-memory USX ZIP reader shared by the admin upload and CLI. */
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { parseUsx } from '../../bible/parse/usx.ts';
import { segmentsToText } from '../../bible/segments.ts';
import { readXml } from '../../bible/parse/xml.ts';
import { normalizeSourceRevision } from '../../bible/parse/source-revision.ts';
import type { ParseStream, ResourceMetadata } from '../../bible/parse/types.ts';

export const MAX_USX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 500;
const decoder = new TextDecoder('utf-8', { fatal: true });
type Entry = {
	name: string;
	size: number;
	compressed: number;
	offset: number;
	method: number;
	crc: number;
};
const invalid = (detail: string) => new Error(`Ungültiges USX-ZIP: ${detail}`);

function entries(bytes: Uint8Array): Entry[] {
	if (bytes.length > MAX_USX_ARCHIVE_BYTES) throw invalid('Archiv größer als 64 MiB.');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const u16 = (at: number) => view.getUint16(at, true);
	const u32 = (at: number) => view.getUint32(at, true);
	let end = -1;
	for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
		if (u32(at) === 0x06054b50 && at + 22 + u16(at + 20) === bytes.length) {
			end = at;
			break;
		}
	}
	if (end < 0) throw invalid('ZIP-Verzeichnis fehlt.');
	const count = u16(end + 10);
	const start = u32(end + 16);
	const size = u32(end + 12);
	if (
		u16(end + 4) ||
		u16(end + 6) ||
		u16(end + 8) !== count ||
		count > MAX_ENTRIES ||
		start + size !== end
	)
		throw invalid(
			'Mehrteilige Archive, ZIP64 oder mehr als 500 Einträge werden nicht unterstützt.'
		);
	const result: Entry[] = [];
	const names = new Set<string>();
	let cursor = start;
	let total = 0;
	for (let i = 0; i < count; i++) {
		if (cursor + 46 > end || u32(cursor) !== 0x02014b50)
			throw invalid('Beschädigtes ZIP-Verzeichnis.');
		const flags = u16(cursor + 8);
		const method = u16(cursor + 10);
		const compressed = u32(cursor + 20);
		const uncompressed = u32(cursor + 24);
		const nameLength = u16(cursor + 28);
		const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32);
		if (next > end) throw invalid('Beschädigter Dateieintrag.');
		const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
		if (
			!name ||
			name.includes('\\') ||
			Array.from(name).some(
				(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
			) ||
			name.startsWith('/') ||
			/^[a-z]:/i.test(name) ||
			name.split('/').some((part) => part === '..' || part === '.') ||
			names.has(name.toLowerCase())
		)
			throw invalid(`Unsicherer oder doppelter Pfad: ${name}`);
		names.add(name.toLowerCase());
		const mode = u32(cursor + 38) >>> 16;
		if (flags & 0x41 || ![0, 8].includes(method) || (mode & 0xf000) === 0xa000 || u16(cursor + 34))
			throw invalid(`Nicht unterstützter ZIP-Eintrag: ${name}`);
		total += uncompressed;
		if (uncompressed > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES)
			throw invalid('Entpackte Daten überschreiten 32 MiB je Datei oder 256 MiB insgesamt.');
		const offset = u32(cursor + 42);
		if (offset + 30 > start || u32(offset) !== 0x04034b50)
			throw invalid(`Dateikopf fehlt: ${name}`);
		const localNameEnd = offset + 30 + u16(offset + 26);
		const dataOffset = localNameEnd + u16(offset + 28);
		if (
			dataOffset + compressed > start ||
			decoder.decode(bytes.subarray(offset + 30, localNameEnd)) !== name ||
			u16(offset + 8) !== method ||
			u16(offset + 6) !== flags
		)
			throw invalid(`Widersprüchlicher Dateikopf: ${name}`);
		result.push({
			name,
			size: uncompressed,
			compressed,
			offset: dataOffset,
			method,
			crc: u32(cursor + 16)
		});
		cursor = next;
	}
	if (cursor !== end) throw invalid('Falsche Verzeichnisgröße.');
	return result;
}

const isUsx = (entry: Entry) =>
	/\.usx$/i.test(entry.name) &&
	!entry.name.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');

export function detectUsxArchive(contents: Uint8Array): 'usx-zip' | null {
	if (contents.length < 4 || contents[0] !== 0x50 || contents[1] !== 0x4b) return null;
	return entries(contents).some(isUsx) ? 'usx-zip' : null;
}

function extract(bytes: Uint8Array, entry: Entry): string {
	try {
		const compressed = bytes.subarray(entry.offset, entry.offset + entry.compressed);
		const data =
			entry.method === 0
				? compressed
				: inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.size) });
		if (data.length !== entry.size || crc32(data) !== entry.crc)
			throw invalid('Größe oder Prüfsumme stimmt nicht.');
		return decoder.decode(data);
	} catch (error) {
		throw invalid(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** DBL metadata is plain data: even XHTML rights statements are flattened and escaped. */
async function readMetadata(xml: string): Promise<Partial<ResourceMetadata>> {
	const stack: string[] = [];
	const values = new Map<string, string>();
	let revision: string | undefined;
	let copyright = '';
	for await (const event of readXml(xml)) {
		if (event.type === 'open') {
			stack.push(event.name);
			if (stack.length === 1) {
				if (event.name !== 'dblmetadata')
					throw invalid('metadata.xml enthält keine DBL-Metadaten.');
				revision = normalizeSourceRevision(event.attributes.revision);
			}
		} else if (event.type === 'close') {
			if (stack.includes('copyright') && ['p', 'div', 'br'].includes(event.name)) copyright += ' ';
			stack.pop();
		} else {
			const path = stack.join('/');
			values.set(path, (values.get(path) ?? '') + event.text);
			if (stack.includes('copyright')) copyright += event.text;
		}
	}
	const value = (path: string) =>
		values.get(`dblmetadata/${path}`)?.replace(/\s+/g, ' ').trim() || undefined;
	const abbrev = value('identification/abbreviationlocal') ?? value('identification/abbreviation');
	const id = value('identification/abbreviation') ?? abbrev;
	const name = value('identification/namelocal') ?? value('identification/name');
	const language = value('language/ldml') ?? value('language/iso');
	const rights = copyright.replace(/\s+/g, ' ').trim();
	const escape = (text: string) =>
		text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	return {
		...(id ? { id: resourceId(id) } : {}),
		...(name ? { name } : {}),
		...(abbrev ? { abbrev } : {}),
		...(language ? { language } : {}),
		...(value('language/scriptdirection')?.toLowerCase() === 'rtl'
			? { direction: 'rtl' as const }
			: {}),
		...(rights ? { licenseHtml: `<p>${escape(rights)}</p>` } : {}),
		...(revision ? { sourceRevision: revision } : {})
	};
}

function resourceId(value: string): string {
	return (
		value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9_-]/gi, '')
			.toUpperCase() || 'USX'
	);
}

export async function* parseUsxArchive(bytes: Uint8Array, fileName = 'USX.zip'): ParseStream {
	const files = entries(bytes);
	const books = files.filter(isUsx).sort((a, b) => a.name.localeCompare(b.name, 'en'));
	if (!books.length) throw invalid('Keine USX-Buchdateien gefunden.');
	const metadataFiles = files.filter(
		(entry) => /(^|\/)metadata\.xml$/i.test(entry.name) && !entry.name.startsWith('__MACOSX/')
	);
	if (metadataFiles.length > 1)
		throw invalid('Mehrere metadata.xml-Dateien; bitte nur ein Bibelwerk je ZIP importieren.');
	const fallbackName = basename(fileName).replace(/\.zip$/i, '');
	const metadata: ResourceMetadata = {
		id: resourceId(fallbackName),
		name: fallbackName,
		abbrev: fallbackName,
		language: 'de',
		...(metadataFiles[0] ? await readMetadata(extract(bytes, metadataFiles[0])) : {})
	};
	yield { type: 'metadata', metadata };
	let total = 0;
	for (const entry of books) {
		let count = 0;
		let hasText = false;
		try {
			for await (const event of parseUsx(extract(bytes, entry))) {
				if (event.type === 'metadata' || event.type === 'progress') continue;
				if (event.type === 'verse') {
					count++;
					hasText ||= segmentsToText(event.verse.segments).length > 0;
					total++;
				}
				yield event.type === 'warning'
					? { ...event, message: `${entry.name}: ${event.message}` }
					: event;
			}
		} catch (error) {
			throw invalid(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (!count || !hasText) throw invalid(`${entry.name}: kein verwertbarer Bibeltext.`);
		yield { type: 'progress', done: total, message: entry.name };
	}
	yield { type: 'progress', done: total, total };
}

export async function* readUsxArchive(path: string, fileName?: string): ParseStream {
	if ((await stat(path)).size > MAX_USX_ARCHIVE_BYTES) throw invalid('Archiv größer als 64 MiB.');
	yield* parseUsxArchive(await readFile(path), fileName ?? basename(path));
}
