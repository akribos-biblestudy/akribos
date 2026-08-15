import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	acceptVerseListInvite,
	peekVerseListInvite
} from '$lib/server/repositories/verse-list-members';
import { normalizeEmail } from '$lib/server/repositories/users';

/**
 * Landing page for a mailed verse-list invite.
 *
 * Does not consume the token on `load` — mail clients and link scanners prefetch links, the same
 * reason `register/verify/[token]` only peeks. Acceptance is a separate, explicit click.
 */
export async function load({ params, locals }) {
	const invite = await peekVerseListInvite(getDb(), params.token);
	if (!invite) return { invite: null, emailMismatch: false };

	const emailMismatch = !!locals.user && normalizeEmail(locals.user.email) !== invite.email;
	return { invite, emailMismatch };
}

export const actions = {
	default: async ({ params, locals, url }) => {
		if (!locals.user) {
			redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
		}

		const result = await acceptVerseListInvite(getDb(), params.token, {
			id: locals.user.id,
			email: locals.user.email
		});
		if (!result.ok) return fail(400, { error: result.reason });

		redirect(303, `/lists/${result.listId}`);
	}
};
