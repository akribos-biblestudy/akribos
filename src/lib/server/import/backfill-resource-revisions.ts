import { and, asc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { config } from '../config.ts';
import type { Database } from '../db/client.ts';
import { resources } from '../db/schema.ts';
import { invalidateResourceCache } from '../repositories/resources.ts';
import { readArchivedZefaniaRevision } from './archived-source-revision.ts';

/** Recover explicit revisions from each resource's own upload without reading/reimporting verses. */
export async function backfillResourceRevisions(
	db: Database,
	uploadDirectory = config().UPLOAD_DIR
): Promise<number> {
	let afterId = '';
	let updated = 0;
	while (true) {
		const candidates = await db
			.select({
				id: resources.id,
				sourceFile: resources.sourceFile,
				// PostgreSQL's row version avoids timestamp precision loss and also detects any intervening edit.
				rowVersion: sql<string>`${resources}.xmin::text`
			})
			.from(resources)
			.where(
				and(
					gt(resources.id, afterId),
					eq(resources.kind, 'bible'),
					eq(resources.sourceFormat, 'zefania'),
					eq(resources.status, 'ready'),
					isNull(resources.sourceRevision),
					isNotNull(resources.sourceFile)
				)
			)
			.orderBy(asc(resources.id))
			.limit(50);
		if (candidates.length === 0) break;
		for (const candidate of candidates) {
			const revision = await readArchivedZefaniaRevision(candidate.sourceFile!, uploadDirectory);
			if (!revision) continue;
			const changed = await db
				.update(resources)
				.set({ sourceRevision: revision })
				.where(
					and(
						eq(resources.id, candidate.id),
						eq(resources.kind, 'bible'),
						eq(resources.sourceFormat, 'zefania'),
						eq(resources.sourceFile, candidate.sourceFile!),
						eq(resources.status, 'ready'),
						isNull(resources.sourceRevision),
						sql`${resources}.xmin::text = ${candidate.rowVersion}`
					)
				)
				.returning({ id: resources.id });
			updated += changed.length;
		}
		afterId = candidates.at(-1)!.id;
	}
	if (updated) invalidateResourceCache();
	return updated;
}
