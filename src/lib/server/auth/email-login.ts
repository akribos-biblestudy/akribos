import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { emailLogins, loginAttempts, users, type User } from '../db/schema.ts';
import { config } from '../config.ts';
import { normalizeEmail } from '../repositories/users.ts';
import { loginRedirect } from './redirect.ts';

export const EMAIL_LOGIN_COOKIE = 'email-login';
export const EMAIL_LOGIN_TTL_MS = 15 * 60 * 1000;
export const EMAIL_LOGIN_MAX_ATTEMPTS = 5;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function validLoginEmail(value: string): string | null {
	const email = normalizeEmail(value);
	return email.length <= 254 && z.email().safeParse(email).success ? email : null;
}

function tokenHash(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function codeHash(id: string, code: string): string {
	return createHmac('sha256', config().SESSION_SECRET).update(`${id}:${code}`).digest('hex');
}

/** Shared with password changes, so an issued mail cannot race a newly set password. */
export async function lockLoginEmail(tx: Transaction, email: string): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${`auth-email:${email}`}, 0))`
	);
}

/** Locks the counters before checking/incrementing; parallel requests cannot bypass the limit. */
async function allowAttempts(
	tx: Transaction,
	subjects: { key: string; limit: number }[]
): Promise<boolean> {
	for (const subject of [...subjects].sort((a, b) => a.key.localeCompare(b.key))) {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${subject.key}, 0))`);
	}
	for (const subject of subjects) {
		const [row] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(loginAttempts)
			.where(
				and(
					eq(loginAttempts.subject, subject.key),
					gt(loginAttempts.attemptedAt, new Date(Date.now() - EMAIL_LOGIN_TTL_MS))
				)
			);
		if (Number(row?.count) >= subject.limit) return false;
	}
	await tx.insert(loginAttempts).values(subjects.map(({ key }) => ({ subject: key })));
	return true;
}

export async function allowEmailLoginVerification(db: Database, address: string): Promise<boolean> {
	return db.transaction((tx) =>
		allowAttempts(tx, [{ key: `email-login-verify:${address}`, limit: 100 }])
	);
}

type BeginResult =
	| { kind: 'password' | 'throttled' | 'unavailable' }
	| { kind: 'email'; id: string; token: string; code: string; expiresAt: Date };

/** No account is created until the recipient proves ownership of the address. */
export async function beginEmailLogin(
	db: Database,
	email: string,
	address: string,
	redirectTo: string
): Promise<BeginResult> {
	email = normalizeEmail(email);
	return db.transaction(async (tx) => {
		await tx
			.delete(loginAttempts)
			.where(lt(loginAttempts.attemptedAt, new Date(Date.now() - EMAIL_LOGIN_TTL_MS)));
		if (
			!(await allowAttempts(tx, [
				{ key: `email-login-start:ip:${address}`, limit: 200 },
				{ key: `email-login-start:email:${email}`, limit: 30 }
			]))
		)
			return { kind: 'throttled' };
		await lockLoginEmail(tx, email);
		const [user] = await tx.select().from(users).where(eq(users.email, email));
		if (user?.passwordHash) return { kind: 'password' };
		if (user?.disabledAt) return { kind: 'unavailable' };
		if (
			!(await allowAttempts(tx, [
				{ key: `email-login-send:ip:${address}`, limit: 50 },
				{ key: `email-login-send:email:${email}`, limit: 3 }
			]))
		)
			return { kind: 'throttled' };

		const id = randomBytes(32).toString('base64url');
		const token = randomBytes(32).toString('base64url');
		const code = String(randomInt(1_000_000)).padStart(6, '0');
		const expiresAt = new Date(Date.now() + EMAIL_LOGIN_TTL_MS);
		await tx
			.update(emailLogins)
			.set({ usedAt: new Date() })
			.where(and(eq(emailLogins.email, email), isNull(emailLogins.usedAt)));
		await tx.delete(emailLogins).where(lt(emailLogins.expiresAt, new Date()));
		await tx.insert(emailLogins).values({
			id,
			email,
			userId: user?.id ?? null,
			tokenHash: tokenHash(token),
			codeHash: codeHash(id, code),
			expiresAt,
			redirectTo: loginRedirect(redirectTo)
		});
		return { kind: 'email', id, token, code, expiresAt };
	});
}

export async function pendingEmailLogin(db: Database, id: string | undefined) {
	if (!id || !/^[\w-]{43}$/.test(id)) return null;
	const [row] = await db
		.select({ email: emailLogins.email, redirectTo: emailLogins.redirectTo })
		.from(emailLogins)
		.where(
			and(
				eq(emailLogins.id, id),
				isNull(emailLogins.usedAt),
				gt(emailLogins.expiresAt, new Date()),
				lt(emailLogins.attempts, EMAIL_LOGIN_MAX_ATTEMPTS)
			)
		);
	return row ?? null;
}

/** Read-only, so previews and mail scanners cannot consume the link or start a session. */
export async function peekEmailLogin(db: Database, token: string) {
	if (!/^[\w-]{43}$/.test(token)) return null;
	const [row] = await db
		.select({ email: emailLogins.email })
		.from(emailLogins)
		.where(
			and(
				eq(emailLogins.tokenHash, tokenHash(token)),
				isNull(emailLogins.usedAt),
				gt(emailLogins.expiresAt, new Date()),
				lt(emailLogins.attempts, EMAIL_LOGIN_MAX_ATTEMPTS)
			)
		);
	return row ?? null;
}

/** Link and code contend for the same row. Account/session creation commits with consumption. */
export async function consumeEmailLogin(
	db: Database,
	credential: { token: string } | { id: string; code: string },
	onVerified?: (tx: Transaction, user: User) => Promise<void>
): Promise<{ user: User; redirectTo: string } | null> {
	const selector =
		'token' in credential
			? eq(emailLogins.tokenHash, tokenHash(credential.token))
			: eq(emailLogins.id, credential.id);
	return db.transaction(async (tx) => {
		const [candidate] = await tx
			.select({ email: emailLogins.email })
			.from(emailLogins)
			.where(selector);
		if (!candidate) return null;
		await lockLoginEmail(tx, candidate.email);
		const [row] = await tx.select().from(emailLogins).where(selector).for('update');
		if (
			!row ||
			row.usedAt ||
			row.expiresAt.getTime() <= Date.now() ||
			row.attempts >= EMAIL_LOGIN_MAX_ATTEMPTS
		)
			return null;
		if ('code' in credential) {
			const code = credential.code.replace(/\s/g, '');
			if (
				!/^\d{6}$/.test(code) ||
				!timingSafeEqual(
					Buffer.from(codeHash(row.id, code), 'hex'),
					Buffer.from(row.codeHash, 'hex')
				)
			) {
				await tx
					.update(emailLogins)
					.set({ attempts: row.attempts + 1 })
					.where(eq(emailLogins.id, row.id));
				return null;
			}
		}
		let [user] = await tx.select().from(users).where(eq(users.email, row.email)).for('update');
		if (user?.disabledAt || user?.passwordHash || (row.userId && user?.id !== row.userId))
			return null;
		if (!user) {
			[user] = await tx
				.insert(users)
				.values({
					email: row.email,
					emailVerifiedAt: new Date(),
					role:
						normalizeEmail(config().BOOTSTRAP_ADMIN_EMAIL ?? '') === row.email ? 'admin' : 'user'
				})
				.onConflictDoNothing({ target: users.email })
				.returning();
			// A concurrent legacy registration must never be overwritten or signed in without its password.
			if (!user) return null;
		} else if (!user.emailVerifiedAt) {
			[user] = await tx
				.update(users)
				.set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
				.where(eq(users.id, user.id))
				.returning();
		}
		if (!user) return null;
		await tx
			.update(emailLogins)
			.set({ usedAt: new Date(), userId: user.id })
			.where(eq(emailLogins.id, row.id));
		await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
		if (onVerified) await onVerified(tx, user);
		return { user, redirectTo: row.redirectTo };
	});
}
