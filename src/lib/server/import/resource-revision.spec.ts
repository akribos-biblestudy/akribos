import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { parseZefania } from '../../bible/parse/zefania.ts';
import { closeDb, getDb } from '../db/index.ts';
import { resources, verses } from '../db/schema.ts';
import { invalidateResourceCache, listResources } from '../repositories/resources.ts';
import * as archivedRevision from './archived-source-revision.ts';
import { backfillResourceRevisions } from './backfill-resource-revisions.ts';
import { ingestBible } from './ingest-bible.ts';

const db = getDb();
const directory = await mkdtemp(join(tmpdir(), 'akribos-revision-db-'));
const ids: string[] = [];
function source(id: string, revision?: string, text = 'Text') {
	return `<XMLBIBLE ${revision ? `revision="${revision}"` : ''}><INFORMATION><identifier>${id}</identifier><title>Imported title</title></INFORMATION><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">${text}</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
}
async function imported(revision?: string) {
	const id = `REVISION-${randomUUID()}`.toUpperCase();
	ids.push(id);
	const sourceFile = join(directory, `${id}.xml`);
	await writeFile(sourceFile, source(id, revision));
	await ingestBible(db, parseZefania(source(id, revision)), {
		sourceFormat: 'zefania',
		sourceFile
	});
	return { id, sourceFile };
}
async function resource(id: string) {
	return (await db.select().from(resources).where(eq(resources.id, id)))[0]!;
}
afterAll(async () => {
	vi.restoreAllMocks();
	await db.delete(resources).where(inArray(resources.id, ids));
	invalidateResourceCache();
	await closeDb();
	await rm(directory, { recursive: true, force: true });
});

describe.sequential('source revision persistence', () => {
	it('updates editions with content atomically, preserves admin labels and clears missing revisions', async () => {
		const { id, sourceFile } = await imported('1.1');
		const labels = {
			name: 'My edition',
			abbrev: 'Mine',
			coverTitle: 'Cover',
			tabTitle: 'Tab',
			selectionTitle: 'Selected',
			selectionSubtitle: 'My subtitle',
			licenseHtml: 'Admin rights'
		};
		await db.update(resources).set(labels).where(eq(resources.id, id));
		await ingestBible(db, parseZefania(source(id, '1.2', 'New text')), {
			sourceFormat: 'zefania',
			sourceFile
		});
		expect(await resource(id)).toMatchObject({ ...labels, sourceRevision: '1.2' });
		invalidateResourceCache();
		expect((await listResources(db)).find((row) => row.id === id)?.sourceRevision).toBe('1.2');
		await expect(
			ingestBible(db, parseZefania(source(id, '1.3', '')), { sourceFormat: 'zefania', sourceFile })
		).rejects.toThrow('no usable Bible text');
		expect((await resource(id)).sourceRevision).toBe('1.2');
		expect((await db.select().from(verses).where(eq(verses.resourceId, id)))[0]?.text).toBe(
			'New text'
		);
		await writeFile(sourceFile, source(id));
		await ingestBible(db, parseZefania(source(id)), { sourceFormat: 'zefania', sourceFile });
		expect((await resource(id)).sourceRevision).toBeNull();
	});

	it('backfills each ready legacy edition from its own archive, preserving content and known versions', async () => {
		const first = await imported('1.2');
		const second = await imported('1.1');
		const known = await imported('3.0');
		const importing = await imported('4.0');
		const missing = await imported();
		await db
			.update(resources)
			.set({ sourceRevision: null })
			.where(inArray(resources.id, [first.id, second.id, importing.id]));
		await db.update(resources).set({ status: 'importing' }).where(eq(resources.id, importing.id));
		await rm(missing.sourceFile);
		const before = await resource(first.id);
		const beforeVerses = await db.select().from(verses).where(eq(verses.resourceId, first.id));
		expect(await backfillResourceRevisions(db, directory)).toBe(2);
		expect(await backfillResourceRevisions(db, directory)).toBe(0);
		expect(await resource(first.id)).toEqual({ ...before, sourceRevision: '1.2' });
		expect((await resource(second.id)).sourceRevision).toBe('1.1');
		expect((await resource(known.id)).sourceRevision).toBe('3.0');
		expect((await resource(importing.id)).sourceRevision).toBeNull();
		expect((await resource(missing.id)).sourceRevision).toBeNull();
		expect(await db.select().from(verses).where(eq(verses.resourceId, first.id))).toEqual(
			beforeVerses
		);
	});

	it('does not attach an old revision after an intervening edit or reimport of the same source path', async () => {
		const candidate = await imported('1.2');
		await db.update(resources).set({ sourceRevision: null }).where(eq(resources.id, candidate.id));
		const read = archivedRevision.readArchivedZefaniaRevision;
		const spy = vi
			.spyOn(archivedRevision, 'readArchivedZefaniaRevision')
			.mockImplementation(async (path, directory) => {
				const revision = await read(path, directory);
				if (path === candidate.sourceFile) {
					// Same path, ready status and missing revision: only the row version reveals this reimport.
					await ingestBible(db, parseZefania(source(candidate.id, undefined, 'Concurrent text')), {
						sourceFormat: 'zefania',
						sourceFile: path
					});
				}
				return revision;
			});
		try {
			expect(await backfillResourceRevisions(db, directory)).toBe(0);
			expect((await resource(candidate.id)).sourceRevision).toBeNull();
			expect(
				(await db.select().from(verses).where(eq(verses.resourceId, candidate.id)))[0]?.text
			).toBe('Concurrent text');
		} finally {
			spy.mockRestore();
		}
	});
});
