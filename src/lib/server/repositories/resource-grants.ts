import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { resources, resourceUserGrants, users } from '../db/schema.ts';

/** Called only by the guarded admin action. Serialize edits for the same resource. */
export async function replaceResourceUserGrants(
	db: Database,
	resourceId: string,
	userIds: string[]
): Promise<'saved' | 'resource' | 'users'> {
	return db.transaction(async (tx) => {
		const [resource] = await tx
			.select({ id: resources.id })
			.from(resources)
			.where(eq(resources.id, resourceId))
			.for('update');
		if (!resource) return 'resource';
		const ids = [...new Set(userIds)];
		const eligible = ids.length
			? await tx
					.select({ id: users.id })
					.from(users)
					.where(and(inArray(users.id, ids), isNull(users.disabledAt)))
			: [];
		if (eligible.length !== ids.length) return 'users';
		await tx.delete(resourceUserGrants).where(eq(resourceUserGrants.resourceId, resourceId));
		if (ids.length)
			await tx.insert(resourceUserGrants).values(ids.map((userId) => ({ resourceId, userId })));
		return 'saved';
	});
}
