import { error, json } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { assertAppRequest } from '$lib/server/app/adapter';
import { checkApiRateLimit } from '$lib/server/api/rate-limit';
import { getDb } from '$lib/server/db';
import { lexiconEntries, resources } from '$lib/server/db/schema';
import { readableResourceCondition } from '$lib/server/repositories/resources';
import type { RequestHandler } from './$types';

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;

/** A consistent, permission-checked snapshot of one explicitly offline-licensed lexicon. */
export const GET: RequestHandler = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store', vary: 'Cookie' });
	assertAppRequest(event);
	const rate = await checkApiRateLimit(getDb(), `offline:ip:${event.getClientAddress()}`, 30);
	if (!rate.allowed) {
		event.setHeaders({ 'retry-after': String(rate.retryAfterSeconds) });
		error(429, 'Zu viele Offline-Anfragen. Bitte später erneut versuchen.');
	}
	const owner = event.locals.user?.id ?? null;
	const result = await getDb().transaction(
		async (tx) => {
			const [resource] = await tx
				.select({
					id: resources.id,
					kind: resources.kind,
					name: resources.name,
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
					usageNotesHtml: resources.usageNotesHtml,
					sourceRevision: resources.sourceRevision,
					updatedAt: resources.updatedAt
				})
				.from(resources)
				.where(
					and(
						eq(resources.id, event.params.resource),
						eq(resources.kind, 'lexicon'),
						readableResourceCondition(owner, 'offline')
					)
				)
				.limit(1);
			if (!resource) error(404, 'Lexikon nicht für Offline-Nutzung verfügbar');

			// Bound the source in the database before loading all articles into memory.
			const [size] = await tx
				.select({
					bytes: sql<number>`coalesce(sum(octet_length(to_jsonb(${lexiconEntries})::text) + 256), 0)`
				})
				.from(lexiconEntries)
				.where(eq(lexiconEntries.resourceId, resource.id));
			if (Number(size?.bytes ?? 0) > MAX_PACKAGE_BYTES) error(413, 'Lexikon ist zu groß');

			const entries = await tx
				.select({
					strong: lexiconEntries.strong,
					language: lexiconEntries.language,
					lemma: lexiconEntries.lemma,
					transliteration: lexiconEntries.transliteration,
					pronunciation: lexiconEntries.pronunciation,
					definitionHtml: lexiconEntries.definitionHtml,
					derivationHtml: lexiconEntries.derivationHtml,
					kjvDefinitionHtml: lexiconEntries.kjvDefinitionHtml,
					germanTranslation: lexiconEntries.germanTranslation,
					seeAlso: lexiconEntries.seeAlso
				})
				.from(lexiconEntries)
				.where(eq(lexiconEntries.resourceId, resource.id))
				.orderBy(asc(lexiconEntries.strong));
			return { version: 2, owner, resource, entries };
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
	if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PACKAGE_BYTES)
		error(413, 'Lexikon ist zu groß');
	return json(result);
};
