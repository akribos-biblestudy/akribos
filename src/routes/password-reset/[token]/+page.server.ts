import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { checkPasswordStrength, MIN_PASSWORD_LENGTH } from '$lib/server/auth/password';
import { createSession, destroyAllSessions } from '$lib/server/auth/session';
import { consumePasswordReset, updatePassword } from '$lib/server/repositories/users';

export function load() {
	// The token is not checked here: doing so would consume it, and mail clients follow links.
	return { minPasswordLength: MIN_PASSWORD_LENGTH };
}

export const actions = {
	default: async ({ request, params, cookies }) => {
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const repeat = String(form.get('passwordRepeat') ?? '');

		if (password !== repeat) return fail(400, { error: 'mismatch' as const });
		if (checkPasswordStrength(password)) return fail(400, { error: 'weak' as const });

		const db = getDb();
		const reset = await consumePasswordReset(db, params.token);
		if (!reset) return fail(400, { error: 'token' as const });

		if (!(await updatePassword(db, reset.userId, password)))
			return fail(400, { error: 'token' as const });
		// Every other session is dropped: a password reset is also how someone locks an intruder out.
		await destroyAllSessions(db, reset.userId);
		await createSession(db, cookies, reset.userId, request.headers.get('user-agent') ?? undefined);

		redirect(303, '/account');
	}
};
