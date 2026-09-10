import { and, eq, inArray } from 'drizzle-orm';
import { isSwordTsk } from '../../bible/parse/resource-kind.ts';
import type { Database } from '../db/client.ts';
import { resources } from '../db/schema.ts';
import { invalidateResourceCache } from '../repositories/resources.ts';

/** Keep existing TSK text, annotations, IDs and workspace references; only correct its category. */
export async function backfillTskResourceKind(db: Database): Promise<number> {
	const candidates = await db
		.select({
			id: resources.id,
			abbrev: resources.abbrev,
			name: resources.name,
			sourceFormat: resources.sourceFormat
		})
		.from(resources)
		.where(
			and(
				eq(resources.kind, 'commentary'),
				eq(resources.sourceFormat, 'sword-commentary'),
				eq(resources.status, 'ready')
			)
		);
	const ids = candidates.filter(isSwordTsk).map((resource) => resource.id);
	if (!ids.length) return 0;
	const changed = await db
		.update(resources)
		.set({ kind: 'xrefs' })
		.where(
			and(
				inArray(resources.id, ids),
				eq(resources.kind, 'commentary'),
				eq(resources.status, 'ready')
			)
		)
		.returning({ id: resources.id });
	if (changed.length) invalidateResourceCache();
	return changed.length;
}
