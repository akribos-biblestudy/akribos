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
import { repairLegacyDocumentFootnotes } from '../../notes/document-footnotes.ts';
import { updateDocument } from '../repositories/documents.ts';
import { prepareDocumentBody } from './application.ts';
import { backfillDocumentFootnotes, DocumentFootnoteBackfillError } from './footnote-backfill.ts';

const db = getDb();
const ownerIds: string[] = [];
const createdAt = new Date('2023-01-02T03:04:05Z');
const updatedAt = new Date('2024-02-03T04:05:06Z');
const publishedAt = new Date('2024-01-02T03:04:05Z');
const merged =
	'Text[^1] und Absatz[^2].\n\n[^1]: Erste Erklärung Joh 3,16[^2]: Zweite Erklärung Röm 8,1';

async function owner() {
	const [user] = await db
		.insert(users)
		.values({ email: `footnote-backfill-${randomUUID()}@example.test` })
		.returning();
	ownerIds.push(user!.id);
	return user!.id;
}
async function document(
	userId: string,
	bodyMarkdown = merged,
	overrides: Partial<typeof documents.$inferInsert> = {}
) {
	const [row] = await db
		.insert(documents)
		.values({
			userId,
			kind: 'note',
			title: 'Unveränderter Titel',
			bodyMarkdown,
			bodyHtml: '<p>Alte Fußnotendarstellung</p>',
			plainText: 'Alte Fußnotendarstellung',
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
			slug: `footnote-${randomUUID()}`,
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
	const [row] = await db.select().from(documents).where(eq(documents.id, id));
	return row!;
}
async function readPublication(id: string) {
	const [row] = await db
		.select()
		.from(documentPublications)
		.where(eq(documentPublications.documentId, id));
	return row!;
}
afterAll(async () => {
	if (ownerIds.length) await db.delete(users).where(inArray(users.id, ownerIds));
	await closeDb();
});

describe.sequential('historical document footnote backfill', () => {
	it('exposes only a harmless error and SQLSTATE to startup, restore and CLI loggers', async () => {
		const privateBody = 'PRIVATE FOOTNOTE CONTENT MUST NEVER REACH LOGS';
		const original = Object.assign(new Error(`Failed query with ${privateBody}`), {
			name: 'DrizzleQueryError',
			query: `update documents set body_markdown = '${privateBody}'`,
			params: [privateBody],
			cause: { code: '23514', detail: privateBody }
		});
		const failingDb = {
			select() {
				throw original;
			}
		} as unknown as Database;
		const failure = await backfillDocumentFootnotes(failingDb).catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(DocumentFootnoteBackfillError);
		expect(failure).toMatchObject({ name: 'DocumentFootnoteBackfillError', code: '23514' });
		expect(JSON.stringify(failure)).not.toContain(privateBody);
		expect(String(failure)).not.toContain(privateBody);
		expect((failure as Error).stack).not.toContain(privateBody);
		expect(failure).not.toHaveProperty('cause');
		expect(failure).not.toHaveProperty('query');
		expect(failure).not.toHaveProperty('params');
	});

	it('repairs notes, sermons and trash across bounded batches while preserving history and metadata', async () => {
		const userId = await owner();
		const originals = await Promise.all([
			document(userId),
			document(userId, merged, { kind: 'sermon', sermonStatus: 'research', sermonSeries: 'Serie' }),
			document(userId, merged, { deletedAt: new Date('2025-01-01T00:00:00Z') })
		]);
		const unchanged = await document(userId, 'Ohne Fußnoten', {
			bodyHtml: '<p>Eigene historische Darstellung</p>'
		});
		const expected = prepareDocumentBody(repairLegacyDocumentFootnotes(merged).markdown);
		expect(expected.bodyMarkdown).toContain('\n[^2]:');
		const result = await backfillDocumentFootnotes(db, { userId, batchSize: 1 });
		expect(result).toMatchObject({ scanned: 3, updatedDocuments: 3, updatedPublications: 0 });
		for (const original of originals) {
			expect(await readDocument(original.id)).toEqual({ ...original, ...expected, revision: 8 });
		}
		expect(await readDocument(unchanged.id)).toEqual(unchanged);
		expect(await backfillDocumentFootnotes(db, { userId, batchSize: 2 })).toMatchObject({
			updatedDocuments: 0,
			updatedPublications: 0
		});
		expect((await readDocument(originals[0]!.id)).revision).toBe(8);
	});

	it('repairs escaped and Mammoth definitions and refreshes canonical Markdown with obsolete HTML', async () => {
		const userId = await owner();
		const sources = [
			'Text\\[^1\\] und Satz[^2].\n\n\\[^1\\]: Erste Erklärung[^2]: Zweite Erklärung',
			'Text[\\[1\\]](#footnote-1).\n\n1. Mammoth-Erklärung [↑](#footnote-ref-1)',
			'Text[^1].\n\n[^1]: Bereits kanonische Erklärung\n'
		];
		const rows = await Promise.all(sources.map((source) => document(userId, source)));
		expect(repairLegacyDocumentFootnotes(sources[2]!).changed).toBe(false);
		expect(await backfillDocumentFootnotes(db, { userId })).toMatchObject({ updatedDocuments: 3 });
		for (const [index, row] of rows.entries()) {
			const expected = prepareDocumentBody(repairLegacyDocumentFootnotes(sources[index]!).markdown);
			expect(await readDocument(row.id)).toMatchObject({
				...expected,
				revision: 8,
				createdAt,
				updatedAt
			});
			expect(expected.bodyHtml).not.toContain('[^1]');
		}
		expect((await readDocument(rows[2]!.id)).bodyMarkdown).toBe(sources[2]);
	});

	it('updates owned document links and the Bible index atomically and rejects the old editor revision', async () => {
		const userId = await owner();
		const otherId = await owner();
		const target = await document(userId, 'Ziel');
		const foreign = await document(otherId, 'Fremdes Ziel');
		const source = await document(
			userId,
			`${merged}\n\n[Eigene Notiz](/notes/${target.id}) [Fremde Notiz](/notes/${foreign.id})`
		);
		await backfillDocumentFootnotes(db, { userId });
		const links = await db
			.select()
			.from(documentLinks)
			.where(eq(documentLinks.sourceDocumentId, source.id));
		expect(links.map((link) => link.targetDocumentId)).toEqual([target.id]);
		expect(links.every((link) => link.userId === userId)).toBe(true);
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
		expect(await readDocument(foreign.id)).toEqual(foreign);
	});

	it('repairs each public source independently and preserves both current and stale publication status', async () => {
		const userId = await owner();
		for (const isCurrent of [true, false]) {
			const draft = await document(userId, `PRIVATER ENTWURF ${merged}`, {
				visibility: 'unlisted'
			});
			const pub = await publication(draft, `ÖFFENTLICHE FASSUNG ${merged}`, isCurrent ? 7 : 4);
			await backfillDocumentFootnotes(db, { userId });
			const expectedPublic = prepareDocumentBody(
				repairLegacyDocumentFootnotes(pub.bodyMarkdown).markdown
			);
			const currentPublic = await readPublication(draft.id);
			expect(currentPublic).toEqual({
				...pub,
				bodyMarkdown: expectedPublic.bodyMarkdown,
				bodyHtml: expectedPublic.bodyHtml,
				publicationRevision: isCurrent ? 8 : 4
			});
			expect(currentPublic.bodyMarkdown).not.toContain('PRIVATER ENTWURF');
			expect(currentPublic.bodyHtml).not.toContain('PRIVATER ENTWURF');
			expect((await readDocument(draft.id)).revision).toBe(8);
		}
	});

	it('keeps a previously current publication current when only the draft needs a technical repair', async () => {
		const userId = await owner();
		const draft = await document(userId, merged, { visibility: 'unlisted' });
		const expected = prepareDocumentBody(repairLegacyDocumentFootnotes(merged).markdown);
		const pub = await publication(draft, expected.bodyMarkdown);
		await db
			.update(documentPublications)
			.set({ bodyHtml: expected.bodyHtml })
			.where(eq(documentPublications.documentId, draft.id));
		expect(await backfillDocumentFootnotes(db, { userId })).toMatchObject({
			updatedDocuments: 1,
			updatedPublications: 1
		});
		expect(await readPublication(draft.id)).toEqual({
			...pub,
			bodyHtml: expected.bodyHtml,
			publicationRevision: 8
		});
		expect(await backfillDocumentFootnotes(db, { userId })).toMatchObject({
			updatedDocuments: 0,
			updatedPublications: 0
		});
	});
	it('finds a public-only repair without altering or publishing a clean private working copy', async () => {
		const userId = await owner();
		const draft = await document(userId, 'Neuer PRIVATER ENTWURF ohne Fußnoten');
		const pub = await publication(draft, merged, 3);
		const neverPublished = await document(userId);
		expect(await backfillDocumentFootnotes(db, { userId })).toMatchObject({
			updatedDocuments: 1,
			updatedPublications: 1
		});
		expect(await readDocument(draft.id)).toEqual(draft);
		expect(await readPublication(draft.id)).toEqual({
			...pub,
			bodyMarkdown: repairLegacyDocumentFootnotes(merged).markdown,
			bodyHtml: prepareDocumentBody(repairLegacyDocumentFootnotes(merged).markdown).bodyHtml
		});
		expect(await readPublication(neverPublished.id)).toBeUndefined();
	});

	it('keeps ambiguous Markdown and HTML-only footnotes instead of discarding their source', async () => {
		const userId = await owner();
		const ambiguous = 'Text[^1].\n\n[^1]: Erster Text\n[^1]: Zweiter Text\n';
		const first = await document(userId, ambiguous);
		const htmlOnly = await document(userId, '', {
			bodyHtml: '<ol><li id="footnote-1">NUR IM HTML ERHALTEN</li></ol>',
			plainText: 'NUR IM HTML ERHALTEN'
		});
		const result = await backfillDocumentFootnotes(db, { userId });
		expect(result.warnings).toBeGreaterThanOrEqual(1);
		expect((await readDocument(first.id)).bodyMarkdown).toBe(ambiguous);
		expect(await readDocument(htmlOnly.id)).toEqual(htmlOnly);
	});

	it('two simultaneous backfills increment each document revision only once', async () => {
		const userId = await owner();
		const before = await document(userId);
		const results = await Promise.all([
			backfillDocumentFootnotes(db, { userId }),
			backfillDocumentFootnotes(db, { userId })
		]);
		expect(results.reduce((sum, result) => sum + result.updatedDocuments, 0)).toBe(1);
		expect((await readDocument(before.id)).revision).toBe(8);
	});

	it('re-reads a document changed after candidate discovery instead of restoring stale footnotes', async () => {
		const userId = await owner();
		const before = await document(userId);
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
		let backfill!: ReturnType<typeof backfillDocumentFootnotes>;
		const latest = prepareDocumentBody('Neue bewusste Fassung ohne Fußnoten');
		await db.transaction(async (tx) => {
			await tx.select().from(documents).where(eq(documents.id, before.id)).for('update');
			backfill = backfillDocumentFootnotes(observedDb, { userId });
			await started;
			await tx
				.update(documents)
				.set({ ...latest, revision: 8 })
				.where(eq(documents.id, before.id));
		});
		expect(await backfill).toMatchObject({ updatedDocuments: 0 });
		expect(await readDocument(before.id)).toEqual({ ...before, ...latest, revision: 8 });
	});
});
