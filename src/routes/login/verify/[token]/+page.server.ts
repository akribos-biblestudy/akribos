import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { allowEmailLoginVerification, peekEmailLogin } from '$lib/server/auth/email-login';
import { completeEmailLogin } from '$lib/server/auth/complete-email-login';

export async function load({ params, locals, setHeaders }) {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow',
		'referrer-policy': 'same-origin'
	});
	if (locals.user) redirect(303, '/account');
	return { pending: await peekEmailLogin(getDb(), params.token) };
}

export const actions = {
	default: async ({ params, cookies, request, getClientAddress }) => {
		const db = getDb();
		if (!(await allowEmailLoginVerification(db, getClientAddress())))
			return fail(429, { error: 'throttled' as const });
		const result = await completeEmailLogin(db, { token: params.token }, cookies, request);
		if (!result) return fail(400, { error: 'token' as const });
		redirect(303, result.redirectTo);
	}
};
