import { fail } from '@sveltejs/kit';
import { EMAIL_LOGIN_COOKIE } from '$lib/server/auth/email-login';
import { SESSION_COOKIE } from '$lib/server/auth/session';
import { getDb } from '$lib/server/db';
import { logger } from '$lib/server/logger';
import { deleteAccount } from '$lib/server/repositories/account-deletion';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
};

export const actions = {
	deleteAccount: async ({ request, locals, cookies }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'signIn' as const });

		const form = await request.formData();
		if (form.get('userId') !== user.id) return fail(409, { error: 'wrongAccount' as const });
		if (form.get('confirm') !== 'yes') return fail(400, { error: 'confirmation' as const });

		try {
			const result = await deleteAccount(getDb(), user.id, user.email);
			if (result === 'lastAdmin') return fail(409, { error: 'lastAdmin' as const });
			if (result === 'unavailable') return fail(409, { error: 'unavailable' as const });
		} catch (error) {
			// Database errors can contain SQL parameters. Keep the address out of the log.
			logger.error(
				{ kind: error instanceof Error ? error.name : undefined },
				'account deletion failed'
			);
			return fail(500, { error: 'failed' as const });
		}

		cookies.delete(SESSION_COOKIE, { path: '/' });
		cookies.delete(EMAIL_LOGIN_COOKIE, { path: '/login' });
		locals.user = null;
		locals.sessionId = null;
		return { deleted: true };
	}
} satisfies Actions;
