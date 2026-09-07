import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { closeDb, getDb } from './index.ts';
import { documentPublications, documents } from './schema.ts';

afterAll(closeDb);

it('migrates existing public links losslessly and enforces unlisted-only writes', async () => {
	const migration = await readFile('drizzle/0037_unlisted_note_sharing.sql', 'utf8');
	const db = getDb();
	await db.transaction(async (tx) => {
		// Connection-local copies exercise the real migration without touching another test's documents.
		await tx.execute(
			sql`CREATE TEMP TABLE documents (LIKE public.documents INCLUDING DEFAULTS) ON COMMIT DROP`
		);
		await tx.execute(
			sql`CREATE TEMP TABLE document_publications (LIKE public.document_publications INCLUDING DEFAULTS) ON COMMIT DROP`
		);
		const rows = [
			{ visibility: 'public', revision: 3, snapshotRevision: 3 },
			{ visibility: 'public', revision: 4, snapshotRevision: 2 },
			{ visibility: 'unlisted', revision: 2, snapshotRevision: 2 },
			{ visibility: 'private', revision: 1, snapshotRevision: null }
		];
		const ids: string[] = [];
		for (const [index, row] of rows.entries()) {
			const id = randomUUID();
			ids.push(id);
			await tx.insert(documents).values({
				id,
				userId: randomUUID(),
				kind: 'note',
				title: `Note ${index}`,
				bodyMarkdown: 'Private draft',
				bodyHtml: '<p>Private draft</p>',
				plainText: 'Private draft',
				visibility: row.visibility as never,
				revision: row.revision
			});
			if (row.snapshotRevision !== null)
				await tx.insert(documentPublications).values({
					documentId: id,
					slug: `existing-${index}`,
					title: `Shared ${index}`,
					excerpt: 'Original excerpt',
					bodyHtml: '<p>Original snapshot</p>',
					bodyMarkdown: 'Original snapshot',
					authorName: 'Original author',
					visibility: row.visibility as never,
					passages: [],
					tags: ['Original tag'],
					publicationRevision: row.snapshotRevision,
					firstPublishedAt: new Date('2026-01-01T00:00:00Z'),
					publishedAt: new Date('2026-02-01T00:00:00Z')
				});
		}
		const before = await tx.select().from(documentPublications);
		for (const statement of migration.split('--> statement-breakpoint')) {
			if (statement.trim()) await tx.execute(sql.raw(statement));
		}
		const after = await tx.select().from(documentPublications);
		for (const original of before) {
			const index = ids.indexOf(original.documentId);
			expect(after.find((row) => row.documentId === original.documentId)).toEqual({
				...original,
				visibility: 'unlisted',
				publicationRevision: index === 0 ? 4 : original.publicationRevision
			});
		}
		const migratedDocuments = await tx.select().from(documents);
		expect(
			ids.map((id) => {
				const row = migratedDocuments.find((row) => row.id === id)!;
				return [row.visibility, row.revision];
			})
		).toEqual([
			['unlisted', 4],
			['unlisted', 5],
			['unlisted', 2],
			['private', 1]
		]);
		for (const table of ['documents', 'document_publications']) {
			await expect(
				tx.transaction(async (nested) => {
					await nested.execute(sql.raw(`UPDATE "${table}" SET visibility = 'public'`));
				})
			).rejects.toMatchObject({ cause: { code: '23514' } });
		}
	});
});
