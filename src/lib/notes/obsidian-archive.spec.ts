import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
	extractObsidianMarkdownArchive,
	isSafeObsidianArchivePath,
	ObsidianArchiveError
} from './obsidian-archive';

function expectArchiveError(run: () => unknown, code: ObsidianArchiveError['code']): void {
	try {
		run();
		expect.unreachable('expected ObsidianArchiveError');
	} catch (caught) {
		expect(caught).toBeInstanceOf(ObsidianArchiveError);
		expect((caught as ObsidianArchiveError).code).toBe(code);
	}
}

describe('Obsidian ZIP extraction', () => {
	it('extracts only Markdown files from safe nested paths in stable order', () => {
		const archive = zipSync({
			'Bibel/zweite.md': strToU8('# Zwei'),
			'assets/image.png': new Uint8Array([1, 2, 3]),
			'erste.md': strToU8('# Eins')
		});
		const extracted = extractObsidianMarkdownArchive(archive);
		expect(extracted.map((file) => file.filename)).toEqual(['erste.md', 'zweite.md']);
		expect(extracted.map((file) => file.archivePath)).toEqual(['erste.md', 'Bibel/zweite.md']);
		expect(new TextDecoder().decode(extracted[1]!.bytes)).toBe('# Zwei');
	});

	it('rejects traversal paths and archives without Markdown', () => {
		expect(isSafeObsidianArchivePath('../secret.md')).toBe(false);
		expect(isSafeObsidianArchivePath('C:/secret.md')).toBe(false);
		expect(isSafeObsidianArchivePath('notes\\secret.md')).toBe(false);
		expectArchiveError(
			() => extractObsidianMarkdownArchive(zipSync({ '../secret.md': strToU8('private') })),
			'unsafe_archive'
		);
		expectArchiveError(
			() => extractObsidianMarkdownArchive(zipSync({ 'readme.txt': strToU8('text') })),
			'no_markdown'
		);
	});

	it('rejects corrupt input before trying to inflate it', () => {
		expectArchiveError(
			() => extractObsidianMarkdownArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
			'unsafe_archive'
		);
	});
});
