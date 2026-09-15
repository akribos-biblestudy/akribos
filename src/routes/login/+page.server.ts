import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { dummyHash, verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/session';
import {
	clearFailedLogins,
	countRecent,
	isLoginThrottled,
	pruneLoginAttempts,
	recordFailedLogin
} from '$lib/server/auth/rate-limit';
import { mailer } from '$lib/server/mail';
import { emailLoginMail, emailVerificationMail } from '$lib/server/mail/templates';
import { logger } from '$lib/server/logger';
import {
	createEmailVerification,
	findUserByEmail,
	recordLogin
} from '$lib/server/repositories/users';
import { updateReaderColumns } from '$lib/server/repositories/users';
import { listBibles } from '$lib/server/repositories/resources';
import { readColumns } from '$lib/server/columns';
import {
	allowEmailLoginVerification,
	beginEmailLogin,
	EMAIL_LOGIN_COOKIE,
	EMAIL_LOGIN_TTL_MS,
	pendingEmailLogin,
	validLoginEmail
} from '$lib/server/auth/email-login';
import { completeEmailLogin } from '$lib/server/auth/complete-email-login';
import { loginRedirect } from '$lib/server/auth/redirect';
import { emailLogins } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function load({ locals, url, cookies, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' });
	const redirectTo = loginRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);
	const pending = url.searchParams.has('restart')
		? null
		: await pendingEmailLogin(getDb(), cookies.get(EMAIL_LOGIN_COOKIE));
	return { redirectTo: pending?.redirectTo ?? redirectTo, pending };
}

async function start({ request, cookies, getClientAddress }: RequestEvent) {
	const form = await request.formData();
	const email = validLoginEmail(String(form.get('email') ?? ''));
	const redirectTo = loginRedirect(form.get('redirectTo'));
	if (!email)
		return fail(400, {
			step: 'email' as const,
			email: String(form.get('email') ?? '').slice(0, 254),
			error: 'email' as const
		});
	if (String(form.get('company') ?? '').trim()) {
		cookies.set(EMAIL_LOGIN_COOKIE, randomBytes(32).toString('base64url'), {
			path: '/login',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: EMAIL_LOGIN_TTL_MS / 1000
		});
		return { step: 'code' as const, email, redirectTo };
	}
	const db = getDb();
	const result = await beginEmailLogin(db, email, getClientAddress(), redirectTo);
	if (result.kind === 'password') {
		cookies.delete(EMAIL_LOGIN_COOKIE, { path: '/login' });
		return { step: 'password' as const, email, redirectTo };
	}
	if (result.kind === 'throttled')
		return fail(429, { step: 'email' as const, email, error: 'throttled' as const });
	if (result.kind !== 'email')
		return fail(400, { step: 'email' as const, email, error: 'unavailable' as const });
	const link = new URL(`/login/verify/${result.token}`, config().ORIGIN).toString();
	try {
		if (
			process.env.NODE_ENV === 'production' &&
			!config().BREVO_API_KEY &&
			!config().MAIL_TEST_OUTBOX
		)
			throw new Error('Transactional delivery is not configured');
		await mailer().send({ to: email, ...emailLoginMail(link, result.code) });
	} catch {
		logger.error('sending the email sign-in message failed');
		await db.update(emailLogins).set({ usedAt: new Date() }).where(eq(emailLogins.id, result.id));
		return fail(503, { step: 'email' as const, email, error: 'mail' as const });
	}
	cookies.set(EMAIL_LOGIN_COOKIE, result.id, {
		path: '/login',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		expires: result.expiresAt
	});
	redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
}

export const actions = {
	start,
	code: async ({ request, cookies, getClientAddress }) => {
		const db = getDb();
		const id = cookies.get(EMAIL_LOGIN_COOKIE) ?? '';
		const pending = await pendingEmailLogin(db, id);
		if (!pending) return fail(400, { step: 'email' as const, error: 'code' as const });
		if (!(await allowEmailLoginVerification(db, getClientAddress())))
			return fail(429, {
				step: 'code' as const,
				email: pending.email,
				error: 'throttled' as const
			});
		const form = await request.formData();
		const result = await completeEmailLogin(
			db,
			{ id, code: String(form.get('code') ?? '').slice(0, 100) },
			cookies,
			request
		);
		if (!result)
			return fail(400, { step: 'code' as const, email: pending.email, error: 'code' as const });
		redirect(303, result.redirectTo);
	},
	// Named rather than default: SvelteKit forbids mixing a default action with named ones in the
	// same route, and `resend` below needs to be named. The form in +page.svelte points at this
	// explicitly via `action="?/login"`.
	login: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = validLoginEmail(String(form.get('email') ?? '')) ?? '';
		const password = String(form.get('password') ?? '');
		const redirectTo = loginRedirect(form.get('redirectTo'));

		if (!email || !password) {
			return fail(400, { step: 'password' as const, email, error: 'missing' as const });
		}

		const db = getDb();
		const address = getClientAddress();

		if (await isLoginThrottled(db, email, address)) {
			return fail(429, { step: 'password' as const, email, error: 'throttled' as const });
		}

		const user = await findUserByEmail(db, email);

		// Verify even when there is no such account, so "unknown address" and "wrong password" take the
		// same time and account existence cannot be read off the response.
		const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);

		if (!user || !valid || user.disabledAt) {
			await recordFailedLogin(db, email, address);
			return fail(400, { step: 'password' as const, email, error: 'invalid' as const });
		}

		if (!user.emailVerifiedAt) {
			// The password was correct, so this can say exactly what is wrong without helping anyone
			// probe for which addresses are registered — that question is already answered by getting
			// this far instead of "invalid".
			return fail(400, { step: 'password' as const, email, error: 'unverified' as const });
		}

		await clearFailedLogins(db, email, address);
		await pruneLoginAttempts(db);
		if (user.readerColumns.length === 0) {
			await updateReaderColumns(db, user.id, readColumns(cookies, await listBibles(db)));
		}
		await createSession(db, cookies, user.id, request.headers.get('user-agent') ?? undefined);
		await recordLogin(db, user.id);

		// Only same-site paths, so a crafted link cannot bounce someone off the site after signing in.
		cookies.delete(EMAIL_LOGIN_COOKIE, { path: '/login' });
		redirect(303, redirectTo);
	},

	/**
	 * Re-sends the account-activation mail, offered once login fails with `unverified`.
	 *
	 * Same shape as the password-reset request: the response never says whether the address exists
	 * or is already verified, and IP throttling stands in for a per-account limit since there is no
	 * failed-login history to key on before the account is even active.
	 */
	resend: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email.includes('@')) return fail(400, { error: 'email' as const });

		const db = getDb();
		const address = getClientAddress();

		if ((await countRecent(db, `ip:${address}`)) >= 10) {
			return fail(429, { error: 'throttled' as const });
		}
		await recordFailedLogin(db, email, address);

		const user = await findUserByEmail(db, email);

		if (user && !user.disabledAt && !user.emailVerifiedAt) {
			const token = await createEmailVerification(db, user.id);
			const link = new URL(`/register/verify/${token}`, config().ORIGIN).toString();

			try {
				await mailer().send({
					to: user.email,
					...emailVerificationMail(link, { resent: true })
				});
			} catch (error) {
				logger.error({ err: error }, 'sending the verification mail failed');
			}
		}

		return { step: 'password' as const, email, resent: true };
	}
};
