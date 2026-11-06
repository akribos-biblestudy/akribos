import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { destroyAllSessions } from '$lib/server/auth/session';
import {
	createEmailVerification,
	createPasswordReset,
	listUsers,
	setUserDisabled,
	setUserRole
} from '$lib/server/repositories/users';
import { config } from '$lib/server/config';
import { eq } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';
import { strongReviewGrants } from '$lib/server/db/strong-review-schema';

export async function load() {
	const db = getDb();
	const [accounts, grants] = await Promise.all([
		listUsers(db),
		db.select({ userId: strongReviewGrants.userId }).from(strongReviewGrants)
	]);
	const ids = new Set(grants.map((grant) => grant.userId));
	return { users: accounts.map((user) => ({ ...user, strongReview: ids.has(user.id) })) };
}

export const actions = {
	strongReview: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail(400, { error: 'invalid' as const });
		const db = getDb();
		const [user] = await db
			.select({ id: users.id, disabledAt: users.disabledAt })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user || user.disabledAt) return fail(400, { error: 'invalid' as const });
		if (form.get('enabled') === 'true')
			await db.insert(strongReviewGrants).values({ userId }).onConflictDoNothing();
		else await db.delete(strongReviewGrants).where(eq(strongReviewGrants.userId, userId));
		return { saved: true };
	},
	role: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const role = String(form.get('role') ?? '') === 'admin' ? 'admin' : 'user';

		// An admin cannot demote themselves, which is the easiest way to lock everyone out.
		if (userId === locals.user!.id) return fail(400, { error: 'self' as const });

		await setUserRole(getDb(), userId, role);
		return { saved: true };
	},

	disable: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const disabled = form.get('disabled') === 'true';

		if (userId === locals.user!.id) return fail(400, { error: 'self' as const });

		const db = getDb();
		await setUserDisabled(db, userId, disabled);
		// Disabling has to take effect immediately, not when the session happens to expire.
		if (disabled) await destroyAllSessions(db, userId);

		return { saved: true };
	},

	/**
	 * Issues a reset link for an account, for when someone cannot receive mail.
	 *
	 * The link is shown to the admin rather than emailed, so it can be passed on through whatever
	 * channel actually works.
	 */
	reset: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const token = await createPasswordReset(getDb(), userId);

		return {
			resetLink: new URL(`/password-reset/${token}`, config().ORIGIN).toString(),
			resetFor: userId
		};
	},

	/**
	 * Issues a fresh account-activation link, for when someone never received (or lost) the original
	 * one. Shown to the admin rather than emailed, same reasoning as `reset` above.
	 */
	verify: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const token = await createEmailVerification(getDb(), userId);

		return {
			verifyLink: new URL(`/register/verify/${token}`, config().ORIGIN).toString(),
			verifyFor: userId
		};
	}
};
