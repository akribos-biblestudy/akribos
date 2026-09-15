import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import * as markdown from '$lib/notes/document-markdown';
import { closeDb, getDb } from '$lib/server/db';
import { documentBodyReferenceIndexes, documents, users } from '$lib/server/db/schema';
import { DOCUMENT_REFERENCE_PARSER_VERSION } from '$lib/server/repositories/document-reference-index';
import { listSermonBoardDocuments } from '$lib/server/repositories/documents';
import { GET } from './+server';

const db = getDb();
const owners: string[] = [];
async function owner() {
	const id = randomUUID();
	await db.insert(users).values({ id, email: `library-summary-${id}@example.test` });
	owners.push(id);
	return id;
}
async function seed(
	userId: string,
	count: number,
	body: string,
	kind: 'note' | 'sermon' = 'note',
	age = 0
) {
	const rendered = markdown.documentMarkdownToHtml(body);
	const reference = markdown.documentBodyBibleReferenceIndex(rendered.html);
	const rows = Array.from({ length: count }, (_, index) => ({
		id: randomUUID(),
		userId,
		kind,
		title: `Dokument ${index}`,
		bodyMarkdown: body,
		bodyHtml: rendered.html,
		plainText: rendered.plainText,
		updatedAt: new Date(Date.now() - age - index * 1000),
		...(kind === 'sermon' ? { sermonStatus: 'idea' } : {})
	}));
	await db.insert(documents).values(rows);
	await db.insert(documentBodyReferenceIndexes).values(
		rows.map((row) => ({
			documentId: row.id,
			userId,
			...reference,
			parserVersion: DOCUMENT_REFERENCE_PARSER_VERSION
		}))
	);
	return rows;
}
async function summaries(userId: string, query = '') {
	const headers: Record<string, string> = {};
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	// This handler reads only locals, url and setHeaders from the SvelteKit event.
	const response = await GET({
		locals: { user: user!, sessionId: null, apiAuth: null },
		url: new URL(`http://localhost/api/documents${query}`),
		setHeaders: (next: Record<string, string>) => Object.assign(headers, next)
	} as unknown as Parameters<typeof GET>[0]);
	expect(response.status).toBe(200);
	expect(headers['cache-control']).toBe('private, no-store');
	return response.json();
}

afterAll(async () => {
	if (owners.length) await db.delete(users).where(inArray(users.id, owners));
	await closeDb();
});

describe('bounded private document summaries', () => {
	it('uses current reference projections, limits previews and preserves updated order and ownership', async () => {
		const id = await owner(),
			foreign = await owner();
		const rows = await seed(id, 105, `Joh 3,16. ${'Langer Inhalt '.repeat(1000)}`);
		await seed(foreign, 1, 'Joh 3,16. Fremder Inhalt');
		const newest = rows.at(-1)!;
		await db
			.update(documents)
			.set({ updatedAt: new Date(Date.now() + 1000) })
			.where(eq(documents.id, newest.id));
		const parse = vi.spyOn(markdown, 'documentBodyBibleReferenceIndex');
		try {
			const result = await summaries(id, '?passage=Joh3');
			expect(result.truncated).toBe(true);
			expect(result.documents).toHaveLength(100);
			expect(result.documents[0].id).toBe(newest.id);
			expect(
				result.documents.every(
					(row: { id: string; excerpt: string }) =>
						rows.some((own) => own.id === row.id) && row.excerpt.length <= 181
				)
			).toBe(true);
			expect(result.documents[0]).not.toHaveProperty('bodyHtml');
			expect(parse).not.toHaveBeenCalled();
		} finally {
			parse.mockRestore();
		}
	});

	it('filters passages before limiting and repairs a stale projection only in memory', async () => {
		const id = await owner();
		await seed(id, 105, 'Mt 3,12');
		const [match] = await seed(id, 1, 'Joh 3,16 und ein alter passender Text', 'note', 200000);
		await db
			.update(documentBodyReferenceIndexes)
			.set({ parserVersion: 0, books: [], ranges: [] })
			.where(eq(documentBodyReferenceIndexes.documentId, match!.id));
		const parse = vi.spyOn(markdown, 'documentBodyBibleReferenceIndex');
		try {
			const result = await summaries(id, '?passage=Joh3,16');
			expect(result.truncated).toBe(false);
			expect(result.documents.map((row: { id: string }) => row.id)).toEqual([match!.id]);
			expect(parse).toHaveBeenCalledTimes(1);
			const [stored] = await db
				.select()
				.from(documentBodyReferenceIndexes)
				.where(eq(documentBodyReferenceIndexes.documentId, match!.id));
			expect(stored!.parserVersion).toBe(0);
		} finally {
			parse.mockRestore();
		}
	});

	it('searches full sermon text while returning only short board previews and workflow fields', async () => {
		const id = await owner(),
			foreign = await owner();
		await seed(id, 1, `${'Langer Text '.repeat(2000)}SuchwortGanzAmEnde`, 'sermon');
		await seed(id, 1, 'SuchwortGanzAmEnde', 'note');
		await seed(foreign, 1, 'SuchwortGanzAmEnde', 'sermon');
		const rows = await listSermonBoardDocuments(db, id, 'SuchwortGanzAmEnde');
		expect(rows).toHaveLength(1);
		expect(rows[0]!.plainText.length).toBeLessThanOrEqual(136);
		expect(rows[0]).toMatchObject({ sermonStatus: 'idea', revision: 1 });
		expect(rows[0]).not.toHaveProperty('bodyMarkdown');
		expect(rows[0]).not.toHaveProperty('bodyHtml');
	});
});
