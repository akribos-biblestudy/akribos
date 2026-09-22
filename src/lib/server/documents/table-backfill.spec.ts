import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import type { Database } from '../db/client.ts';
import {
	documentBodyReferenceIndexes,
	documentLinks,
	documentPublications,
	documents,
	users,
	type Document
} from '../db/schema.ts';
import { documentMarkdownToHtml } from '../../notes/document-markdown.ts';
import { updateDocument } from '../repositories/documents.ts';
import { prepareDocumentBody } from './application.ts';
import { backfillDocumentTables, DocumentTableBackfillError } from './table-backfill.ts';

const db = getDb();
const ownerIds: string[] = [];
const createdAt = new Date('2023-01-02T03:04:05Z');
const updatedAt = new Date('2024-02-03T04:05:06Z');
const publishedAt = new Date('2024-01-02T03:04:05Z');
const table =
	'| Stelle | Beobachtung |\n| :--- | ---: |\n| Joh 3,16 | **Liebe** |\n| Röm 8,1 | Keine Verdammnis |\n';

async function owner() {
	const [user] = await db
		.insert(users)
		.values({ email: `table-backfill-${randomUUID()}@example.test` })
		.returning();
	ownerIds.push(user!.id);
	return user!.id;
}
async function document(
	userId: string,
	bodyMarkdown = table,
	overrides: Partial<typeof documents.$inferInsert> = {}
) {
	const [row] = await db
		.insert(documents)
		.values({
			userId,
			kind: 'note',
			title: 'Unveränderter Titel',
			bodyMarkdown,
			bodyHtml: '<p>Alte Tabelle als flacher Text</p>',
			plainText: 'Alte Tabelle als flacher Text',
			revision: 7,
			createdAt,
			updatedAt,
			...overrides
		})
		.returning();
	return row!;
}
async function publication(doc: Document, bodyMarkdown: string, revision = doc.revision) {
	const [row] = await db
		.insert(documentPublications)
		.values({
			documentId: doc.id,
			slug: `table-${randomUUID()}`,
			title: 'Öffentlicher Titel',
			excerpt: 'Unveränderter Auszug',
			bodyMarkdown,
			bodyHtml: '<p>Alte öffentliche Darstellung</p>',
			authorName: 'Öffentlicher Autor',
			visibility: 'unlisted',
			passages: [],
			tags: ['öffentlich'],
			publicationRevision: revision,
			firstPublishedAt: createdAt,
			publishedAt
		})
		.returning();
	return row!;
}
async function readDocument(id: string) {
	return (await db.select().from(documents).where(eq(documents.id, id)))[0]!;
}
async function readPublication(id: string) {
	return (
		await db.select().from(documentPublications).where(eq(documentPublications.documentId, id))
	)[0];
}
function derivatives(markdown: string) {
	const { html, plainText } = documentMarkdownToHtml(markdown);
	return { bodyHtml: html, plainText };
}
afterAll(async () => {
	if (ownerIds.length) await db.delete(users).where(inArray(users.id, ownerIds));
	await closeDb();
});

describe.sequential('historical document table backfill', () => {
	it('exposes only a harmless error and SQLSTATE, never private query parameters', async () => {
		const secret = 'PRIVATE TABLE CONTENT';
		const original = Object.assign(new Error(`Failed query: ${secret}`), {
			params: [secret],
			query: secret,
			cause: { code: '23514', detail: secret }
		});
		const failingDb = {
			select() {
				throw original;
			}
		} as unknown as Database;
		const failure = await backfillDocumentTables(failingDb).catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(DocumentTableBackfillError);
		expect(failure).toMatchObject({ name: 'DocumentTableBackfillError', code: '23514' });
		for (const output of [JSON.stringify(failure), String(failure), (failure as Error).stack])
			expect(output).not.toContain(secret);
		for (const field of ['cause', 'query', 'params']) expect(failure).not.toHaveProperty(field);
	});

	it('repairs notes, sermons and trash once without changing Markdown bytes or metadata', async () => {
		const userId = await owner();
		const markdown = '\n\n' + table.replaceAll('\n', '  \r\n') + '\r\n';
		const originals = await Promise.all([
			document(userId, markdown),
			document(userId, markdown, {
				kind: 'sermon',
				sermonStatus: 'research',
				sermonSeries: 'Serie'
			}),
			document(userId, markdown, { deletedAt: new Date('2025-01-01T00:00:00Z') })
		]);
		const foreign = await document(await owner());
		const expected = derivatives(markdown);
		expect(expected.bodyHtml).toContain('<table>');
		expect(expected.bodyHtml).toContain('<strong>Liebe</strong>');
		expect(await backfillDocumentTables(db, { userId, batchSize: 1 })).toMatchObject({
			scanned: 3,
			updatedDocuments: 3,
			updatedPublications: 0,
			warnings: 0
		});
		for (const original of originals)
			expect(await readDocument(original.id)).toEqual({ ...original, ...expected, revision: 8 });
		expect(await readDocument(foreign.id)).toEqual(foreign);
		expect(await backfillDocumentTables(db, { userId, batchSize: 2 })).toMatchObject({
			updatedDocuments: 0,
			updatedPublications: 0
		});
		expect((await readDocument(originals[0]!.id)).revision).toBe(8);
	});

	it('refreshes owned links and reference indexes atomically and rejects a stale editor revision', async () => {
		const userId = await owner();
		const target = await document(userId, 'Ziel');
		const foreign = await document(await owner(), 'Privates fremdes Ziel');
		const source = await document(
			userId,
			`${table}\n| Eigene Notiz | Fremde Notiz |\n| --- | --- |\n| [Ziel](/notes/${target.id}) | [Fremd](/notes/${foreign.id}) |\n`
		);
		await backfillDocumentTables(db, { userId });
		const links = await db
			.select()
			.from(documentLinks)
			.where(eq(documentLinks.sourceDocumentId, source.id));
		expect(links.map((entry) => [entry.userId, entry.targetDocumentId])).toEqual([
			[userId, target.id]
		]);
		const [index] = await db
			.select()
			.from(documentBodyReferenceIndexes)
			.where(eq(documentBodyReferenceIndexes.documentId, source.id));
		expect(index!.books).toEqual(expect.arrayContaining([43, 45]));
		expect(
			await updateDocument(db, userId, source.id, source.revision, {
				body: prepareDocumentBody('Veralteter Editor')
			})
		).toMatchObject({ ok: false, reason: 'conflict', currentRevision: 8 });
	});

	it.each([true, false])(
		'rebuilds publication from its own table source, preserving current=%s status',
		async (current) => {
			const userId = await owner();
			const draft = await document(userId, `PRIVATER ENTWURF\n\n${table}`, {
				visibility: 'unlisted'
			});
			const pub = await publication(
				draft,
				`ÖFFENTLICHE FASSUNG\n\n${table.replace('Liebe', 'Öffentliche Aussage')}`,
				current ? 7 : 4
			);
			await backfillDocumentTables(db, { userId });
			const actual = await readPublication(draft.id);
			expect(actual).toEqual({
				...pub,
				bodyHtml: derivatives(pub.bodyMarkdown).bodyHtml,
				publicationRevision: current ? 8 : 4
			});
			expect(actual!.bodyHtml).not.toContain('PRIVATER ENTWURF');
			expect((await readDocument(draft.id)).revision).toBe(8);
			expect(await backfillDocumentTables(db, { userId })).toMatchObject({
				updatedDocuments: 0,
				updatedPublications: 0
			});
		}
	);

	it('repairs a public-only table and never publishes an unpublished working copy', async () => {
		const userId = await owner();
		const draft = await document(userId, 'Neuer privater Entwurf ohne Tabelle');
		const pub = await publication(draft, table, 3);
		const neverPublished = await document(userId);
		expect(await backfillDocumentTables(db, { userId })).toMatchObject({
			updatedDocuments: 1,
			updatedPublications: 1
		});
		expect(await readDocument(draft.id)).toEqual(draft);
		expect(await readPublication(draft.id)).toEqual({
			...pub,
			bodyHtml: derivatives(table).bodyHtml
		});
		expect(await readPublication(neverPublished.id)).toBeUndefined();
	});

	it('keeps an already current snapshot current when only the draft derivative changes', async () => {
		const userId = await owner();
		const draft = await document(userId);
		const pub = await publication(draft, 'Öffentlicher Text ohne Tabelle');
		expect(await backfillDocumentTables(db, { userId })).toMatchObject({
			updatedDocuments: 1,
			updatedPublications: 1
		});
		expect(await readPublication(draft.id)).toEqual({ ...pub, publicationRevision: 8 });
	});

	it('recognizes nested source tables but does not invent tables from code, pipes or flattened text', async () => {
		const userId = await owner();
		const nested = [
			table
				.split('\n')
				.filter(Boolean)
				.map((line) => `> ${line}`)
				.join('\n'),
			`- Liste\n\n${table
				.split('\n')
				.filter(Boolean)
				.map((line) => `  ${line}`)
				.join('\n')}`,
			`Text[^1].\n\n[^1]: Erläuterung\n\n${table
				.split('\n')
				.filter(Boolean)
				.map((line) => `    ${line}`)
				.join('\n')}`
		];
		const rows = await Promise.all(nested.map((markdown) => document(userId, markdown)));
		const untouched = await Promise.all([
			document(userId, `\x60\x60\x60md\n${table}\x60\x60\x60`),
			document(userId, 'A | B\ngewöhnliche Prosa'),
			document(userId, 'A · B\nC · D'),
			document(userId, '', {
				bodyHtml: '<table><tr><td>Nur im HTML erhalten</td></tr></table>',
				plainText: 'Nur im HTML erhalten'
			})
		]);
		expect(await backfillDocumentTables(db, { userId })).toMatchObject({
			updatedDocuments: 3,
			warnings: 1
		});
		for (const row of rows) expect((await readDocument(row.id)).bodyHtml).toContain('<table>');
		for (const row of untouched) expect(await readDocument(row.id)).toEqual(row);
	});

	it('serializes simultaneous backfills so each working copy gains exactly one revision', async () => {
		const userId = await owner();
		const before = await document(userId);
		const results = await Promise.all([
			backfillDocumentTables(db, { userId }),
			backfillDocumentTables(db, { userId })
		]);
		expect(results.reduce((sum, result) => sum + result.updatedDocuments, 0)).toBe(1);
		expect((await readDocument(before.id)).revision).toBe(8);
	});

	it('re-reads draft and publication after discovery instead of restoring stale source tables', async () => {
		const userId = await owner();
		const before = await document(userId);
		const pub = await publication(before, table, 3);
		let notifyStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			notifyStarted = resolve;
		});
		const observedDb = new Proxy(db, {
			get(target, key) {
				if (key === 'transaction')
					return (fn: Parameters<Database['transaction']>[0]) =>
						target.transaction(async (tx) => {
							notifyStarted();
							return fn(tx);
						});
				const value = Reflect.get(target, key);
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});
		let backfill!: ReturnType<typeof backfillDocumentTables>;
		const latest = prepareDocumentBody('Bewusste neue Fassung ohne Tabelle');
		const latestPublic = table.replace('Liebe', 'Aktualisierte öffentliche Tabelle');
		await db.transaction(async (tx) => {
			await tx.select().from(documents).where(eq(documents.id, before.id)).for('update');
			backfill = backfillDocumentTables(observedDb, { userId });
			await started;
			await tx
				.update(documents)
				.set({ ...latest, revision: 8 })
				.where(eq(documents.id, before.id));
			await tx
				.update(documentPublications)
				.set({ bodyMarkdown: latestPublic })
				.where(eq(documentPublications.documentId, before.id));
		});
		expect(await backfill).toMatchObject({ updatedDocuments: 0, updatedPublications: 1 });
		expect(await readDocument(before.id)).toEqual({ ...before, ...latest, revision: 8 });
		expect(await readPublication(before.id)).toEqual({
			...pub,
			bodyMarkdown: latestPublic,
			bodyHtml: derivatives(latestPublic).bodyHtml
		});
	});
});
