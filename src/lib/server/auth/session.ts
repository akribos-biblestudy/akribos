/**
 * Session management.
 *
 * The cookie carries a random token; the database stores only its SHA-256. A leaked database dump
 * therefore cannot be used to impersonate anyone, which is the same reason passwords are hashed.
 *
 * Sessions last 30 days and are renewed once they are more than halfway through, so an active reader
 * is never logged out mid-study while an abandoned session still expires.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '../db/client.ts';
import { sessions, users, type User } from '../db/schema.ts';

export const SESSION_COOKIE = 'session';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = SESSION_DURATION_MS / 2;

export type SessionUser = Pick<
	User,
	| 'id'
	| 'email'
	| 'displayName'
	| 'role'
	| 'readerColumns'
	| 'readerWorkspace'
	| 'readerFontScale'
	| 'defaultBibleId'
	| 'theme'
	| 'tourCompletedAt'
>;

function tokenToId(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Creates a session and sets the cookie. Returns the token, for tests. */
export async function createSession(
	db: Database,
	cookies: Cookies,
	userId: string,
	userAgent?: string
): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	await db.insert(sessions).values({
		id: tokenToId(token),
		userId,
		expiresAt,
		userAgent: userAgent?.slice(0, 400) ?? null
	});

	setSessionCookie(cookies, token, expiresAt);
	return token;
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		// Secure in production only, so development over plain HTTP still works.
		secure: process.env.NODE_ENV === 'production',
		expires: expiresAt
	});
}

/**
 * Resolves the session cookie to a user, renewing the session when it is past its halfway point.
 *
 * Returns null for a missing, unknown, expired or disabled account's session, and clears the cookie in
 * that case so the browser stops sending it.
 */
export async function resolveSession(
	db: Database,
	cookies: Cookies
): Promise<{ user: SessionUser; sessionId: string } | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;

	const sessionId = tokenToId(token);

	const [row] = await db
		.select({
			sessionId: sessions.id,
			expiresAt: sessions.expiresAt,
			id: users.id,
			email: users.email,
			displayName: users.displayName,
			role: users.role,
			readerColumns: users.readerColumns,
			readerWorkspace: users.readerWorkspace,
			readerFontScale: users.readerFontScale,
			defaultBibleId: users.defaultBibleId,
			theme: users.theme,
			tourCompletedAt: users.tourCompletedAt,
			disabledAt: users.disabledAt
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
		.limit(1);

	if (!row || row.disabledAt) {
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return null;
	}

	if (row.expiresAt.getTime() - Date.now() < RENEW_AFTER_MS) {
		const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
		await db
			.update(sessions)
			.set({ expiresAt, lastSeenAt: new Date() })
			.where(eq(sessions.id, sessionId));
		setSessionCookie(cookies, token, expiresAt);
	}

	return {
		sessionId,
		user: {
			id: row.id,
			email: row.email,
			displayName: row.displayName,
			role: row.role,
			readerColumns: row.readerColumns,
			readerWorkspace: row.readerWorkspace,
			readerFontScale: row.readerFontScale,
			defaultBibleId: row.defaultBibleId,
			theme: row.theme,
			tourCompletedAt: row.tourCompletedAt
		}
	};
}

export async function destroySession(
	db: Database,
	cookies: Cookies,
	sessionId: string | null
): Promise<void> {
	if (sessionId) await db.delete(sessions).where(eq(sessions.id, sessionId));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Signs the user out everywhere, used after a password change. */
export async function destroyAllSessions(db: Database, userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Housekeeping: drop expired rows. Called opportunistically, not on a schedule. */
export async function pruneExpiredSessions(db: Database): Promise<void> {
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
