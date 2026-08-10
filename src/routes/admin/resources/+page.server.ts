import { fail } from '@sveltejs/kit';
import { asc, count, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { resources, verseComments } from '$lib/server/db/schema';
import { invalidateResourceCache } from '$lib/server/repositories/resources';
import { deleteResource } from '$lib/server/import';
import { refreshStrongStatistics } from '$lib/server/db/statistics';

/**
 * Resource management: name, column title, order, visibility and licence text.
 *
 * These are the values the old version hardcoded in `BIBLES_IN_VIEW` and `BIBLE_HINTS_IN_VIEW`, which
 * meant adding a translation or correcting a rights notice required a code change and a deployment.
 */
export async function load() {
	const db = getDb();

	const [rows, counts] = await Promise.all([
		db
			.select()
			.from(resources)
			.orderBy(asc(resources.kind), asc(resources.sortOrder), asc(resources.name)),
		db
			.select({ resourceId: verseComments.resourceId, value: count() })
			.from(verseComments)
			.groupBy(verseComments.resourceId)
	]);
	const countByResource = new Map(counts.map((entry) => [entry.resourceId, entry.value]));

	return {
		resources: rows.map((resource) => ({
			...resource,
			commentCount: countByResource.get(resource.id) ?? 0
		}))
	};
}

export const actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'missing id' });

		await getDb()
			.update(resources)
			.set({
				coverTitle: String(form.get('coverTitle') ?? '').trim() || null,
				tabTitle: String(form.get('tabTitle') ?? '').trim() || null,
				selectionTitle: String(form.get('selectionTitle') ?? '').trim() || null,
				// An empty subtitle is meaningful; null is reserved for imported legacy resources whose
				// abbreviation is still used as the fallback.
				selectionSubtitle: String(form.get('selectionSubtitle') ?? '').trim(),
				isPublic: form.get('isPublic') === 'on',
				licenseHtml: String(form.get('licenseHtml') ?? '').trim() || null,
				updatedAt: new Date()
			})
			.where(eq(resources.id, id));

		invalidateResourceCache();
		return { saved: id };
	},

	move: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const direction = String(form.get('direction') ?? '');
		if (!id || !['up', 'down'].includes(direction)) return fail(400, { error: 'move' });

		const db = getDb();
		await db.transaction(async (tx) => {
			const [current] = await tx
				.select({ kind: resources.kind })
				.from(resources)
				.where(eq(resources.id, id))
				.limit(1);
			if (!current) return;

			const ordered = await tx
				.select({ id: resources.id })
				.from(resources)
				.where(eq(resources.kind, current.kind))
				.orderBy(asc(resources.sortOrder), asc(resources.name));
			const index = ordered.findIndex((item) => item.id === id);
			const target = direction === 'up' ? index - 1 : index + 1;
			if (index < 0 || target < 0 || target >= ordered.length) return;
			const moved = ordered[index]!;
			ordered[index] = ordered[target]!;
			ordered[target] = moved;
			for (const [position, item] of ordered.entries()) {
				await tx
					.update(resources)
					.set({ sortOrder: (position + 1) * 10, updatedAt: new Date() })
					.where(eq(resources.id, item.id));
			}
		});

		invalidateResourceCache();
		return { moved: id };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const replacementId = String(form.get('replacementId') ?? '');
		// Deleting a resource discards a lot of work, so the name has to be typed to confirm it.
		if (!id || String(form.get('confirm') ?? '') !== id) {
			return fail(400, { error: 'confirm' });
		}

		const db = getDb();
		let transferredComments: number;
		try {
			transferredComments = await deleteResource(db, id, replacementId || undefined);
		} catch (cause) {
			if (cause instanceof Error && cause.message.includes('replacement Bible')) {
				return fail(400, { error: 'replacement', deleting: id });
			}
			throw cause;
		}
		invalidateResourceCache();
		// Verse and word counts changed, so the statistics views have to be rebuilt.
		await refreshStrongStatistics(db);

		return { deleted: id, transferredComments };
	},

	/** Rebuilds the derived views by hand, for when something looks stale. */
	refresh: async () => {
		const db = getDb();
		await refreshStrongStatistics(db);
		await db.execute(sql`analyze`);
		return { refreshed: true };
	}
};
