import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { bibleDownloadGrants, resources } from '$lib/server/db/schema';

export async function load() {
	return {
		bibles: await getDb()
			.select({
				id: resources.id,
				name: resources.name,
				abbrev: resources.abbrev,
				language: resources.language,
				sourceRevision: resources.sourceRevision
			})
			.from(resources)
			.innerJoin(bibleDownloadGrants, eq(resources.id, bibleDownloadGrants.resourceId))
			.where(
				and(
					eq(resources.kind, 'bible'),
					eq(resources.status, 'ready'),
					eq(resources.isPublic, true)
				)
			)
			.orderBy(asc(resources.name))
	};
}
