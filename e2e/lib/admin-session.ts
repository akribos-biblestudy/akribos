import type { BrowserContext } from '@playwright/test';
import type { Cookies } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { createSession, SESSION_COOKIE } from '../../src/lib/server/auth/session.ts';
import { createDb } from '../../src/lib/server/db/client.ts';
import { users } from '../../src/lib/server/db/schema.ts';
import { testDatabaseUrl } from '../../scripts/lib/test-database.ts';

/** Authenticate the seeded admin without consuming the production login rate limit in every UI test. */
export async function seedAdminSession(context: BrowserContext): Promise<void> {
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			)
	);
	try {
		const [admin] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, 'admin@example.com'));
		if (!admin) throw new Error('Seed administrator not found in E2E database');
		let token = '';
		const cookies = {
			set: (_name: string, value: string) => {
				token = value;
			}
		} as unknown as Cookies;
		await createSession(db, cookies, admin.id);
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
