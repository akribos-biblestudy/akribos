import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { MAX_SERMON_DELIVERY_LOCATION_LENGTH } from '$lib/notes/documents';
import type { Database } from '$lib/server/db/client';
import { documents, sermonDeliveries, type SermonDelivery } from '$lib/server/db/schema';

export type SermonDeliveryMutationResult =
	| { ok: true; revision: number; delivery?: SermonDelivery }
	| { ok: false; reason: 'notFound' }
	| { ok: false; reason: 'conflict'; currentRevision: number };

function cleanLocation(value: string): string | null {
	const location = value.replace(/\s+/gu, ' ').trim();
	return location && Array.from(location).length <= MAX_SERMON_DELIVERY_LOCATION_LENGTH
		? location
		: null;
}

async function lockedSermon(
	db: Parameters<Parameters<Database['transaction']>[0]>[0],
	userId: string,
	documentId: string
) {
	const [document] = await db
		.select({ revision: documents.revision })
		.from(documents)
		.where(
			and(
				eq(documents.id, documentId),
				eq(documents.userId, userId),
				eq(documents.kind, 'sermon'),
				isNull(documents.deletedAt)
			)
		)
		.limit(1)
		.for('update');
	return document;
}

async function incrementRevision(
	db: Parameters<Parameters<Database['transaction']>[0]>[0],
	userId: string,
	documentId: string,
	revision: number
): Promise<number> {
	const [updated] = await db
		.update(documents)
		.set({ revision: sql`${documents.revision} + 1`, updatedAt: new Date() })
		.where(
			and(
				eq(documents.id, documentId),
				eq(documents.userId, userId),
				eq(documents.revision, revision)
			)
		)
		.returning({ revision: documents.revision });
	if (!updated) throw new Error('sermon changed while updating delivery history');
	return updated.revision;
}

export async function listSermonDeliveries(
	db: Database,
	userId: string,
	documentId: string
): Promise<SermonDelivery[]> {
	return db
		.select({
			id: sermonDeliveries.id,
			documentId: sermonDeliveries.documentId,
			userId: sermonDeliveries.userId,
			date: sermonDeliveries.date,
			location: sermonDeliveries.location,
			createdAt: sermonDeliveries.createdAt,
			updatedAt: sermonDeliveries.updatedAt
		})
		.from(sermonDeliveries)
		.innerJoin(
			documents,
			and(
				eq(documents.id, sermonDeliveries.documentId),
				eq(documents.userId, userId),
				eq(documents.kind, 'sermon'),
				isNull(documents.deletedAt)
			)
		)
		.where(and(eq(sermonDeliveries.documentId, documentId), eq(sermonDeliveries.userId, userId)))
		.orderBy(desc(sermonDeliveries.date), desc(sermonDeliveries.id));
}

export async function addSermonDelivery(
	db: Database,
	userId: string,
	documentId: string,
	expectedRevision: number,
	input: { date: Date; location: string }
): Promise<SermonDeliveryMutationResult> {
	const location = cleanLocation(input.location);
	if (!location || !Number.isFinite(input.date.getTime())) return { ok: false, reason: 'notFound' };

	return db.transaction(async (tx) => {
		const document = await lockedSermon(tx, userId, documentId);
		if (!document) return { ok: false, reason: 'notFound' };
		if (document.revision !== expectedRevision) {
			return { ok: false, reason: 'conflict', currentRevision: document.revision };
		}
		const [delivery] = await tx
			.insert(sermonDeliveries)
			.values({ documentId, userId, date: input.date, location })
			.returning();
		const revision = await incrementRevision(tx, userId, documentId, document.revision);
		return { ok: true, revision, delivery: delivery! };
	});
}

export async function removeSermonDelivery(
	db: Database,
	userId: string,
	documentId: string,
	deliveryId: string,
	expectedRevision: number
): Promise<SermonDeliveryMutationResult> {
	return db.transaction(async (tx) => {
		const document = await lockedSermon(tx, userId, documentId);
		if (!document) return { ok: false, reason: 'notFound' };
		if (document.revision !== expectedRevision) {
			return { ok: false, reason: 'conflict', currentRevision: document.revision };
		}
		const deleted = await tx
			.delete(sermonDeliveries)
			.where(
				and(
					eq(sermonDeliveries.id, deliveryId),
					eq(sermonDeliveries.documentId, documentId),
					eq(sermonDeliveries.userId, userId)
				)
			)
			.returning({ id: sermonDeliveries.id });
		if (deleted.length === 0) return { ok: false, reason: 'notFound' };
		return {
			ok: true,
			revision: await incrementRevision(tx, userId, documentId, document.revision)
		};
	});
}
