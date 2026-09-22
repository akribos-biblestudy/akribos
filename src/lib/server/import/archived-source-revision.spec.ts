import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import * as fileSystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
	MAX_REVISION_HEADER_BYTES,
	readArchivedZefaniaRevision
} from './archived-source-revision.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return { ...actual, open: vi.fn(actual.open) };
});

const directory = await mkdtemp(join(tmpdir(), 'akribos-revision-'));
const uploads = join(directory, 'uploads');
await mkdir(uploads);
let counter = 0;
async function archive(contents: string) {
	const path = join(uploads, `${counter++}.xml`);
	await writeFile(path, contents);
	return path;
}
afterAll(() => rm(directory, { recursive: true, force: true }));

describe('archived Zefania source revision', () => {
	it('reads revision, not format version or display text, and stops before Bible content', async () => {
		const source = await archive(
			'<XMLBIBLE revision=" 1.2 " version="2.0.1.18"><INFORMATION><title>Edition 1.1</title></INFORMATION><deliberately malformed Bible'
		);
		expect(await readArchivedZefaniaRevision(source, uploads)).toBe('1.2');
	});

	it('never guesses from a title, rights, description, format version or filename', async () => {
		const source = await archive(
			'<XMLBIBLE version="2.0.1.18"><INFORMATION><title>Akribos 1.2</title><rights>Version 1.2</rights></INFORMATION></XMLBIBLE>'
		);
		expect(await readArchivedZefaniaRevision(source, uploads)).toBeNull();
	});

	it('rejects missing files, directories and paths outside the archive including symlinks', async () => {
		const outside = join(directory, 'outside.xml');
		await writeFile(outside, '<XMLBIBLE revision="1.2"><INFORMATION/></XMLBIBLE>');
		const link = join(uploads, 'link.xml');
		await symlink(outside, link);
		for (const path of [outside, link, uploads, join(uploads, 'missing.xml')]) {
			expect(await readArchivedZefaniaRevision(path, uploads)).toBeNull();
		}
	});

	it('requires a complete valid header of the actual root and excludes document types', async () => {
		for (const xml of [
			'<XMLBIBLE revision="1.2"><INFORMATION>',
			'<XMLBIBLE revision="1.2"><INFORMATION><title>Broken</INFORMATION>',
			'<wrapper><XMLBIBLE revision="1.2"><INFORMATION/></XMLBIBLE></wrapper>',
			'<XMLBIBLE revision="1.2"><BIBLEBOOK/></XMLBIBLE>',
			'<!DOCTYPE XMLBIBLE SYSTEM "file:///etc/passwd"><XMLBIBLE revision="1.2"><INFORMATION/></XMLBIBLE>'
		]) {
			expect(await readArchivedZefaniaRevision(await archive(xml), uploads)).toBeNull();
		}
	});

	it('discards a revision when the archive changes during its read', async () => {
		const source = await archive('<XMLBIBLE revision="1.2"><INFORMATION/></XMLBIBLE>');
		const { open } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
		const spy = vi.spyOn(fileSystem, 'open').mockImplementation(async (...args) => {
			const file = await open(...args);
			const stat = file.stat.bind(file);
			let calls = 0;
			file.stat = (async () => {
				if (++calls === 2) await writeFile(source, 'Replacement content');
				return stat({ bigint: true });
			}) as typeof file.stat;
			return file;
		});
		try {
			expect(await readArchivedZefaniaRevision(source, uploads)).toBeNull();
		} finally {
			spy.mockRestore();
		}
	});

	it('bounds header reads and revision text', async () => {
		const oversized = `<XMLBIBLE revision="1.2"><INFORMATION><title>${'a'.repeat(MAX_REVISION_HEADER_BYTES)}</title></INFORMATION>`;
		expect(await readArchivedZefaniaRevision(await archive(oversized), uploads)).toBeNull();
		for (const revision of ['a'.repeat(81), '&lt;script&gt;', '1.2&#x202e;']) {
			const source = await archive(`<XMLBIBLE revision="${revision}"><INFORMATION/></XMLBIBLE>`);
			expect(await readArchivedZefaniaRevision(source, uploads)).toBeNull();
		}
	});
});
