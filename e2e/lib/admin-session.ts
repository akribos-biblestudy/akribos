import type { BrowserContext } from '@playwright/test';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { createSession, SESSION_COOKIE } from '../../src/lib/server/auth/session.ts';
import { createDb } from '../../src/lib/server/db/client.ts';
import { users } from '../../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../../scripts/lib/test-database.ts';

/** Authenticate an existing test account without consuming the login rate limit. */
async function createTestSession(context: BrowserContext, email: string): Promise<void> {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	try {
		const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
		if (!user) throw new Error(`Test account not found in E2E database: ${email}`);
		let token = '';
		const cookies = {
			set: (_name: string, value: string) => {
				token = value;
			}
		} as unknown as Cookies;
		await createSession(db, cookies, user.id);
		await context.addCookies([
			{
				name: SESSION_COOKIE,
				value: token,
				url: 'http://localhost:4173',
				httpOnly: true,
				sameSite: 'Lax'
			}
		]);
	} finally {
		await client.end();
	}
}

export async function seedAdminSession(context: BrowserContext): Promise<void> {
	await createTestSession(context, 'admin@example.com');
}

/** Sign in a test account created by the caller, which remains responsible for cleanup. */
export async function testUserSession(context: BrowserContext, email: string): Promise<void> {
	await createTestSession(context, email);
}
