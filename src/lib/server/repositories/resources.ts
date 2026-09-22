/**
 * Resource queries.
 *
 * The list of available translations is read on every page, so it is cached in the process for a
 * short while. It changes only when an admin imports or edits a resource, and both paths call
 * {@link invalidateResourceCache}.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import {
	resourceBooks,
	resources,
	resourceUserGrants,
	users,
	type Resource
} from '../db/schema.ts';

export type ReadableResource = Pick<
	Resource,
	| 'id'
	| 'kind'
	| 'name'
	| 'abbrev'
	| 'language'
	| 'canon'
	| 'direction'
	| 'sortOrder'
	| 'hasStrongs'
	| 'hasMorphology'
	| 'licenseHtml'
	| 'usageNotesHtml'
	| 'sourceRevision'
> & {
	coverTitle: string;
	tabTitle: string;
	selectionTitle: string;
	selectionSubtitle: string | null;
};

export type ResourceAccessChannel = 'reader' | 'api';

const CACHE_TTL_MS = 30_000;

let cache: { at: number; resources: ReadableResource[] } | undefined;

export function invalidateResourceCache(): void {
	cache = undefined;
}

/** Apply to a query joined to resources. Grants are checked in the database on every private read. */
export function readableResourceCondition(
	userId?: string | null,
	channel: ResourceAccessChannel = 'reader'
) {
	return and(
		eq(resources.status, 'ready'),
		channel === 'api' ? eq(resources.apiEnabled, true) : undefined,
		userId
			? sql`(${resources.isPublic} = true or exists (
       select 1 from ${resourceUserGrants}
       inner join ${users} on ${users.id} = ${resourceUserGrants.userId}
       where ${resourceUserGrants.resourceId} = ${resources.id}
       and ${resourceUserGrants.userId} = ${userId} and ${users.disabledAt} is null
     ))`
			: eq(resources.isPublic, true)
	);
}

/** Public and explicitly granted ready resources, in display order. */
export async function listResources(
	db: Database,
	userId?: string | null,
	channel: ResourceAccessChannel = 'reader'
): Promise<ReadableResource[]> {
	if (channel === 'reader' && !userId && cache && Date.now() - cache.at < CACHE_TTL_MS)
		return cache.resources;

	const rows = await db
		.select({
			id: resources.id,
			kind: resources.kind,
			name: resources.name,
			sourceRevision: resources.sourceRevision,
			abbrev: resources.abbrev,
			coverTitle: sql<string>`coalesce(${resources.coverTitle}, ${resources.abbrev})`,
			tabTitle: sql<string>`coalesce(${resources.tabTitle}, ${resources.abbrev})`,
			selectionTitle: sql<string>`coalesce(${resources.selectionTitle}, ${resources.name})`,
			selectionSubtitle: sql<
				string | null
			>`coalesce(${resources.selectionSubtitle}, ${resources.abbrev})`,
			language: resources.language,
			canon: resources.canon,
			direction: resources.direction,
			sortOrder: resources.sortOrder,
			hasStrongs: resources.hasStrongs,
			hasMorphology: resources.hasMorphology,
			licenseHtml: resources.licenseHtml,
			usageNotesHtml: resources.usageNotesHtml
		})
		.from(resources)
		.where(readableResourceCondition(userId, channel))
		.orderBy(asc(resources.sortOrder), asc(resources.name));

	if (channel === 'reader' && !userId) cache = { at: Date.now(), resources: rows };
	return rows;
}

/** Translations available to this viewer. */
export async function listBibles(
	db: Database,
	userId?: string | null,
	channel: ResourceAccessChannel = 'reader'
): Promise<ReadableResource[]> {
	return (await listResources(db, userId, channel)).filter((resource) => resource.kind === 'bible');
}

/** Resources this viewer can open as workspace tabs. */
export async function listReaderResources(
	db: Database,
	userId?: string | null
): Promise<ReadableResource[]> {
	return (await listResources(db, userId)).filter((resource) =>
		(['bible', 'commentary', 'xrefs', 'lexicon'] as const).includes(
			resource.kind as 'bible' | 'commentary' | 'xrefs' | 'lexicon'
		)
	);
}

export async function listLexicons(
	db: Database,
	userId?: string | null
): Promise<ReadableResource[]> {
	return (await listResources(db, userId)).filter((resource) => resource.kind === 'lexicon');
}

/**
 * Which books each of the given resources contains. Used to grey out a translation that has no Old
 * Testament rather than showing an empty column.
 */
export async function bookCoverage(
	db: Database,
	resourceIds: string[]
): Promise<Map<string, Set<number>>> {
	if (resourceIds.length === 0) return new Map();

	const rows = await db
		.select({ resourceId: resourceBooks.resourceId, bookId: resourceBooks.bookId })
		.from(resourceBooks)
		.where(inArray(resourceBooks.resourceId, resourceIds));

	const coverage = new Map<string, Set<number>>();
	for (const row of rows) {
		const books = coverage.get(row.resourceId) ?? new Set<number>();
		books.add(row.bookId);
		coverage.set(row.resourceId, books);
	}
	return coverage;
}

/**
 * Highest chapter number any of the given resources has for a book, or 0 when none contains it.
 *
 * Navigation clamps against this, so it has to be the highest chapter *present*, not how many chapters
 * exist — see the note in `ingest-bible.ts`.
 */
export async function chapterCount(
	db: Database,
	resourceIds: string[],
	bookId: number
): Promise<number> {
	if (resourceIds.length === 0) return 0;

	const rows = await db
		.select({ chapterCount: resourceBooks.chapterCount })
		.from(resourceBooks)
		.where(and(inArray(resourceBooks.resourceId, resourceIds), eq(resourceBooks.bookId, bookId)));

	return rows.reduce((max, row) => Math.max(max, row.chapterCount), 0);
}
