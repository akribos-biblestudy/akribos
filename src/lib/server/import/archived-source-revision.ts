import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { SaxesParser } from 'saxes';
import { normalizeSourceRevision } from '../../bible/parse/source-revision.ts';

export const MAX_REVISION_HEADER_BYTES = 256 * 1024;
const HEADER_COMPLETE = Symbol('header complete');

/** Read only an archived Zefania header. Missing, unsafe or unverifiable sources stay unknown. */
export async function readArchivedZefaniaRevision(
	sourceFile: string,
	uploadDirectory: string
): Promise<string | null> {
	try {
		const directory = await realpath(uploadDirectory);
		const path = await realpath(resolve(sourceFile));
		const child = relative(directory, path);
		if (!child || child === '..' || child.startsWith('../') || isAbsolute(child)) return null;
		// Do not follow a final symlink replaced after realpath, or block on a non-file such as a FIFO.
		const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const before = await file.stat({ bigint: true });
			if (!before.isFile()) return null;
			const parser = new SaxesParser({ fragment: false });
			let depth = 0;
			let revision: string | undefined;
			let information = false;
			let complete = false;
			const localName = (name: string) => name.split(':').at(-1)!.toLowerCase();
			parser.on('doctype', () => {
				throw new Error('Unexpected document type');
			});
			parser.on('opentag', (node) => {
				depth++;
				const name = localName(node.name);
				if (depth === 1) {
					if (name !== 'xmlbible' && name !== 'x-bible') throw new Error('Not Zefania');
					for (const [key, value] of Object.entries(node.attributes)) {
						if (localName(key) === 'revision')
							revision = normalizeSourceRevision(typeof value === 'string' ? value : value.value);
					}
				} else if (depth === 2) {
					if (name !== 'information') throw HEADER_COMPLETE;
					information = true;
				}
			});
			parser.on('closetag', (node) => {
				if (depth === 2 && information && localName(node.name) === 'information') {
					complete = true;
					throw HEADER_COMPLETE;
				}
				depth--;
			});
			const decoder = new TextDecoder('utf-8', { fatal: true });
			const buffer = Buffer.alloc(4096);
			let total = 0;
			try {
				while (total < MAX_REVISION_HEADER_BYTES) {
					const { bytesRead } = await file.read(buffer, 0, buffer.length, total);
					if (!bytesRead) break;
					total += bytesRead;
					parser.write(decoder.decode(buffer.subarray(0, bytesRead), { stream: true }));
				}
			} catch (error) {
				if (error !== HEADER_COMPLETE) throw error;
			}
			const after = await file.stat({ bigint: true });
			if (before.size !== after.size || before.mtimeNs !== after.mtimeNs) return null;
			return complete ? (revision ?? null) : null;
		} finally {
			await file.close();
		}
	} catch {
		return null;
	}
}
