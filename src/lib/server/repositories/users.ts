/**
 * Account queries.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { config } from '../config.ts';
import type { Database } from '../db/client.ts';
import { emailVerifications, passwordResets, users, type User } from '../db/schema.ts';
import { hashPassword } from '../auth/password.ts';
import { normalizeFontScale } from '../reader-preferences.ts';
import type { ReaderWorkspace } from '../../reader/workspace.ts';

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function findUserByEmail(db: Database, email: string): Promise<User | undefined> {
	const [row] = await db
		.select()
		.from(users)
		.where(eq(users.email, normalizeEmail(email)))
		.limit(1);
	return row;
}

export type CreateUserResult = { ok: true; user: User } | { ok: false; reason: 'emailTaken' };

/**
 * Creates an account.
 *
 * The first account registered with `BOOTSTRAP_ADMIN_EMAIL` becomes an admin, which is how a fresh
 * deployment gets its first administrator without anyone editing the database by hand.
 */
export async function createUser(
	db: Database,
	input: { email: string; password: string; displayName?: string }
): Promise<CreateUserResult> {
	const email = normalizeEmail(input.email);
	const bootstrapAdmin = config().BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();

	const existing = await findUserByEmail(db, email);
	if (existing) return { ok: false, reason: 'emailTaken' };

	const [user] = await db
		.insert(users)
		.values({
			email,
			passwordHash: await hashPassword(input.password),
			displayName: input.displayName?.trim() || null,
			role: bootstrapAdmin && bootstrapAdmin === email ? 'admin' : 'user'
		})
		.returning();

	// A concurrent registration with the same address loses the unique index race.
	if (!user) return { ok: false, reason: 'emailTaken' };

	return { ok: true, user };
}

export async function recordLogin(db: Database, userId: string): Promise<void> {
	await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function updatePassword(
	db: Database,
	userId: string,
	password: string
): Promise<void> {
	await db
		.update(users)
		.set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
		.where(eq(users.id, userId));
}

export async function updateProfile(
	db: Database,
	userId: string,
	displayName: string | null
): Promise<void> {
	await db
		.update(users)
		.set({ displayName: displayName?.trim() || null, updatedAt: new Date() })
		.where(eq(users.id, userId));
}

export async function updateReaderColumns(
	db: Database,
	userId: string,
	columns: string[]
): Promise<void> {
	await db
		.update(users)
		.set({ readerColumns: columns.slice(0, 5), updatedAt: new Date() })
		.where(eq(users.id, userId));
}

/** Saves the complete workspace and its compact compatibility projection atomically. */
export async function updateReaderWorkspace(
	db: Database,
	userId: string,
	workspace: ReaderWorkspace,
	columns: string[]
): Promise<void> {
	await db
		.update(users)
		.set({
			readerWorkspace: workspace,
			readerColumns: columns.slice(0, 5),
			updatedAt: new Date()
		})
		.where(eq(users.id, userId));
}

export async function updateReaderFontScale(
	db: Database,
	userId: string,
	scale: number
): Promise<number> {
	const normalized = normalizeFontScale(scale);
	await db
		.update(users)
		.set({ readerFontScale: normalized, updatedAt: new Date() })
		.where(eq(users.id, userId));
	return normalized;
}

export async function updateTheme(
	db: Database,
	userId: string,
	theme: 'light' | 'dark'
): Promise<void> {
	await db.update(users).set({ theme, updatedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Marks the product tour as done for this account — finished or actively closed, which count the
 * same — so it stops offering itself automatically on every device this person signs in on.
 */
export async function completeTour(db: Database, userId: string): Promise<void> {
	await db
		.update(users)
		.set({ tourCompletedAt: new Date(), updatedAt: new Date() })
		.where(eq(users.id, userId));
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a password-reset token.
 *
 * Only the hash is stored, exactly as for sessions, so the token in the email is the only copy.
 */
export async function createPasswordReset(db: Database, userId: string): Promise<string> {
	const token = randomBytes(32).toString('base64url');

	await db.insert(passwordResets).values({
		id: createHash('sha256').update(token).digest('hex'),
		userId,
		expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
	});

	return token;
}

/** Consumes a reset token, returning the user it belongs to. Single use. */
export async function consumePasswordReset(
	db: Database,
	token: string
): Promise<{ userId: string } | null> {
	const id = createHash('sha256').update(token).digest('hex');

	const [row] = await db
		.update(passwordResets)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(passwordResets.id, id),
				isNull(passwordResets.usedAt),
				gt(passwordResets.expiresAt, new Date())
			)
		)
		.returning({ userId: passwordResets.userId });

	return row ?? null;
}

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Issues an account-activation token.
 *
 * Same idea as `createPasswordReset`: only the hash is stored, so the mailed link is the only copy.
 * The TTL is generous compared to a password reset, since nobody is expected to check their mail
 * within minutes of registering.
 */
export async function createEmailVerification(db: Database, userId: string): Promise<string> {
	const token = randomBytes(32).toString('base64url');

	await db.insert(emailVerifications).values({
		id: createHash('sha256').update(token).digest('hex'),
		userId,
		expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS)
	});

	return token;
}

/**
 * True when a token exists, is unused and unexpired. Read-only — used only to decide what the
 * confirmation page shows before the person has clicked the button, so it must not burn the token
 * itself (mail clients and link scanners prefetch links).
 */
export async function peekEmailVerification(db: Database, token: string): Promise<boolean> {
	const id = createHash('sha256').update(token).digest('hex');

	const [row] = await db
		.select({ id: emailVerifications.id })
		.from(emailVerifications)
		.where(
			and(
				eq(emailVerifications.id, id),
				isNull(emailVerifications.usedAt),
				gt(emailVerifications.expiresAt, new Date())
			)
		)
		.limit(1);

	return row !== undefined;
}

/** Consumes an activation token, returning the user it belongs to. Single use. */
export async function consumeEmailVerification(
	db: Database,
	token: string
): Promise<{ userId: string } | null> {
	const id = createHash('sha256').update(token).digest('hex');

	const [row] = await db
		.update(emailVerifications)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(emailVerifications.id, id),
				isNull(emailVerifications.usedAt),
				gt(emailVerifications.expiresAt, new Date())
			)
		)
		.returning({ userId: emailVerifications.userId });

	return row ?? null;
}

/** Marks an account's email address as confirmed, activating it. */
export async function markEmailVerified(db: Database, userId: string): Promise<void> {
	await db
		.update(users)
		.set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
		.where(eq(users.id, userId));
}

/** Admin listing, with a count of each account's verse lists. */
export async function listUsers(db: Database): Promise<
	{
		id: string;
		email: string;
		displayName: string | null;
		role: string;
		createdAt: Date;
		lastLoginAt: Date | null;
		disabledAt: Date | null;
		emailVerifiedAt: Date | null;
		listCount: number;
	}[]
> {
	const rows = await db.execute<{
		id: string;
		email: string;
		display_name: string | null;
		role: string;
		created_at: string;
		last_login_at: string | null;
		disabled_at: string | null;
		email_verified_at: string | null;
		list_count: number;
	}>(sql`
		select u.id, u.email, u.display_name, u.role, u.created_at, u.last_login_at, u.disabled_at,
		       u.email_verified_at, count(l.id)::int as list_count
		from users u
		left join verse_lists l on l.user_id = u.id
		group by u.id
		order by u.created_at desc
	`);

	return rows.map((row) => ({
		id: row.id,
		email: row.email,
		displayName: row.display_name,
		role: row.role,
		createdAt: new Date(row.created_at),
		lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
		disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
		emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at) : null,
		listCount: Number(row.list_count)
	}));
}

export async function setUserRole(
	db: Database,
	userId: string,
	role: 'user' | 'admin'
): Promise<void> {
	await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function setUserDisabled(
	db: Database,
	userId: string,
	disabled: boolean
): Promise<void> {
	await db
		.update(users)
		.set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
		.where(eq(users.id, userId));
}
