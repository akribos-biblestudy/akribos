import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '../db/client.ts';
import { users } from '../db/schema.ts';
import { listBibles } from '../repositories/resources.ts';
import { readColumns } from '../columns.ts';
import { createSession } from './session.ts';
import { consumeEmailLogin, EMAIL_LOGIN_COOKIE } from './email-login.ts';

export async function completeEmailLogin(
	db: Database,
	credential: Parameters<typeof consumeEmailLogin>[1],
	cookies: Cookies,
	request: Request
) {
	const columns = readColumns(cookies, await listBibles(db));
	const result = await consumeEmailLogin(db, credential, async (tx, user) => {
		if (user.readerColumns.length === 0)
			await tx.update(users).set({ readerColumns: columns }).where(eq(users.id, user.id));
		await createSession(tx, cookies, user.id, request.headers.get('user-agent') ?? undefined);
	});
	if (result) cookies.delete(EMAIL_LOGIN_COOKIE, { path: '/login' });
	return result;
}
