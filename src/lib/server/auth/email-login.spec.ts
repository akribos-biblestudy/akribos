import { randomUUID } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { emailLogins, loginAttempts, users } from '../db/schema.ts';
import {
	createUser,
	findUserByEmail,
	setUserDisabled,
	updatePassword
} from '../repositories/users.ts';
import {
	beginEmailLogin,
	consumeEmailLogin,
	peekEmailLogin,
	validLoginEmail
} from './email-login.ts';
import { loginRedirect } from './redirect.ts';
import { actions } from '../../../routes/login/+page.server.ts';
import { setMailer } from '../mail/index.ts';

describe('email sign-in', () => {
	const db = getDb();
	const prefix = `email-login-${randomUUID()}`;
	const emails: string[] = [];
	function email() {
		const value = `${prefix}-${emails.length}@example.com`;
		emails.push(value);
		return value;
	}
	async function issue(address = email()) {
		const result = await beginEmailLogin(
			db,
			address,
			`${prefix}-${randomUUID()}`,
			'/notes?year=2026'
		);
		if (result.kind !== 'email') throw new Error(`Unexpected sign-in step: ${result.kind}`);
		return { ...result, email: address };
	}
	afterAll(async () => {
		if (emails.length) {
			await db.delete(emailLogins).where(inArray(emailLogins.email, emails));
			await db.delete(users).where(inArray(users.email, emails));
		}
		await db.delete(loginAttempts).where(like(loginAttempts.subject, `%${prefix}%`));
		await closeDb();
	});

	it('normalizes addresses and rejects malformed emails and off-site redirects', () => {
		expect(validLoginEmail(' Person@EXAMPLE.COM ')).toBe('person@example.com');
		for (const invalid of [
			'no-address',
			'a@',
			'a\nb@example.com',
			`${'a'.repeat(255)}@example.com`
		])
			expect(validLoginEmail(invalid)).toBeNull();
		for (const unsafe of [
			'//',
			'//[invalid',
			'//evil.example',
			'/\\evil.example',
			'https://evil.example',
			'/\n/evil.example'
		])
			expect(loginRedirect(unsafe)).toBe('/account');
		expect(loginRedirect('/notes?year=2026')).toBe('/notes?year=2026');
	});

	it('reports a delivery failure without leaving a usable login or creating an account', async () => {
		const address = email();
		setMailer({
			send: async () => {
				throw new Error('Provider unavailable');
			}
		});
		try {
			const response = await actions.start({
				request: new Request('http://localhost/login?/start', {
					method: 'POST',
					body: new URLSearchParams({ email: address })
				}),
				getClientAddress: () => `${prefix}-${randomUUID()}`,
				cookies: {
					set: () => {
						throw new Error('Must not set a login cookie');
					}
				}
			} as unknown as RequestEvent);
			expect(response).toMatchObject({ status: 503, data: { error: 'mail' } });
			expect(await findUserByEmail(db, address)).toBeUndefined();
			const [row] = await db.select().from(emailLogins).where(eq(emailLogins.email, address));
			expect(row?.usedAt).toBeInstanceOf(Date);
		} finally {
			setMailer(undefined);
		}
	});

	it('stores neither secret and creates a verified passwordless account only on consumption', async () => {
		const attempt = await issue();
		expect(await findUserByEmail(db, attempt.email)).toBeUndefined();
		const [stored] = await db.select().from(emailLogins).where(eq(emailLogins.id, attempt.id));
		expect(JSON.stringify(stored)).not.toContain(attempt.token);
		expect(stored!.codeHash).not.toBe(attempt.code);
		expect(await peekEmailLogin(db, attempt.token)).toEqual({ email: attempt.email });
		expect(await findUserByEmail(db, attempt.email)).toBeUndefined();
		const result = await consumeEmailLogin(db, { id: attempt.id, code: attempt.code });
		expect(result?.user.email).toBe(attempt.email);
		expect(result?.user.passwordHash).toBeNull();
		expect(result?.user.emailVerifiedAt).toBeInstanceOf(Date);
		expect(result?.redirectTo).toBe('/notes?year=2026');
		expect(await consumeEmailLogin(db, { token: attempt.token })).toBeNull();
	});

	it('lets an existing passwordless account sign in without duplicating the account', async () => {
		const first = await issue();
		const user = (await consumeEmailLogin(db, { token: first.token }))!.user;
		const second = await issue(first.email);
		expect((await consumeEmailLogin(db, { token: second.token }))?.user.id).toBe(user.id);
	});

	it('allows exactly one winner when link and code are submitted concurrently', async () => {
		const attempt = await issue();
		const results = await Promise.all([
			consumeEmailLogin(db, { token: attempt.token }),
			consumeEmailLogin(db, { id: attempt.id, code: attempt.code })
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('binds a code to its own request and keeps invalidated account access unavailable', async () => {
		const first = await issue();
		const other = await issue();
		// Different requests can coincidentally draw the same six digits; make the negative test deterministic.
		const wrongCode = first.code === other.code ? 'invalid' : first.code;
		expect(await consumeEmailLogin(db, { id: other.id, code: wrongCode })).toBeNull();
		expect(await consumeEmailLogin(db, { id: first.id, code: first.code })).not.toBeNull();
		expect(await consumeEmailLogin(db, { id: other.id, code: other.code })).not.toBeNull();
	});

	it('rolls back consumption and account creation if session creation fails', async () => {
		const attempt = await issue();
		await expect(
			consumeEmailLogin(db, { token: attempt.token }, async () => {
				throw new Error('session write failed');
			})
		).rejects.toThrow('session write failed');
		expect(await findUserByEmail(db, attempt.email)).toBeUndefined();
		expect(await consumeEmailLogin(db, { token: attempt.token })).not.toBeNull();
	});

	it('rejects expired attempts through both the link and code', async () => {
		const attempt = await issue();
		await db
			.update(emailLogins)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(emailLogins.id, attempt.id));
		expect(await peekEmailLogin(db, attempt.token)).toBeNull();
		expect(await consumeEmailLogin(db, { token: attempt.token })).toBeNull();
		expect(await consumeEmailLogin(db, { id: attempt.id, code: attempt.code })).toBeNull();
	});

	it('locks both ways after five wrong guesses even when guesses race', async () => {
		const attempt = await issue();
		const wrong = attempt.code === '000000' ? '000001' : '000000';
		await Promise.all(
			Array.from({ length: 8 }, () => consumeEmailLogin(db, { id: attempt.id, code: wrong }))
		);
		const [row] = await db.select().from(emailLogins).where(eq(emailLogins.id, attempt.id));
		expect(row!.attempts).toBe(5);
		expect(await consumeEmailLogin(db, { token: attempt.token })).toBeNull();
		expect(await consumeEmailLogin(db, { id: attempt.id, code: attempt.code })).toBeNull();
	});

	it('replaces old links and codes on resend and limits messages across IP addresses', async () => {
		const first = await issue();
		const second = await issue(first.email);
		expect(await consumeEmailLogin(db, { token: first.token })).toBeNull();
		expect(await consumeEmailLogin(db, { id: first.id, code: first.code })).toBeNull();
		expect(await peekEmailLogin(db, second.token)).not.toBeNull();
		const attempts = await Promise.all(
			Array.from({ length: 3 }, () =>
				beginEmailLogin(db, first.email, `${prefix}-${randomUUID()}`, '/account')
			)
		);
		expect(attempts.filter((a) => a.kind === 'email')).toHaveLength(1);
		expect(attempts.filter((a) => a.kind === 'throttled')).toHaveLength(2);
	});

	it('rejects password accounts, including a password set after the message was sent', async () => {
		const first = await issue();
		const user = (await consumeEmailLogin(db, { token: first.token }))!.user;
		const pending = await issue(first.email);
		expect(await updatePassword(db, user.id, 'a-secure-new-password', null)).toBe(true);
		expect(await consumeEmailLogin(db, { token: pending.token })).toBeNull();
		expect(await consumeEmailLogin(db, { id: pending.id, code: pending.code })).toBeNull();
		expect((await beginEmailLogin(db, first.email, prefix, '/account')).kind).toBe('password');
		expect(await updatePassword(db, user.id, 'cannot-overwrite-it', null)).toBe(false);
	});

	it('never overwrites a password account registered after the email was requested', async () => {
		const attempt = await issue();
		await createUser(db, { email: attempt.email, password: 'a-secure-new-password' });
		expect(await consumeEmailLogin(db, { token: attempt.token })).toBeNull();
	});

	it('rejects disabled and deleted accounts even with a previously issued link', async () => {
		const first = await issue();
		const user = (await consumeEmailLogin(db, { token: first.token }))!.user;
		const pending = await issue(first.email);
		await setUserDisabled(db, user.id, true);
		expect(await consumeEmailLogin(db, { token: pending.token })).toBeNull();
		expect((await beginEmailLogin(db, first.email, prefix, '/account')).kind).toBe('unavailable');
		await db.delete(users).where(eq(users.id, user.id));
		expect(await consumeEmailLogin(db, { token: pending.token })).toBeNull();
	});
});
