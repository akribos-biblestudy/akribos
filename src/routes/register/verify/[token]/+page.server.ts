import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createSession } from '$lib/server/auth/session';
import {
	consumeEmailVerification,
	markEmailVerified,
	peekEmailVerification,
	updateReaderColumns
} from '$lib/server/repositories/users';
import { listBibles } from '$lib/server/repositories/resources';
import { readColumns } from '$lib/server/columns';

export async function load({ params, locals }) {
	if (locals.user) redirect(303, '/');

	// Not consumed here: doing so would burn a single-use token, and mail clients and link scanners
	// follow links on their own before a person ever clicks anything (see password-reset's `load` for
	// the same reasoning). This only decides what the confirmation button below says.
	const valid = await peekEmailVerification(getDb(), params.token);
	return { valid };
}

export const actions = {
	default: async ({ params, cookies, request }) => {
		const db = getDb();
		const result = await consumeEmailVerification(db, params.token);
		if (!result) return fail(400, { error: 'token' as const });

		await markEmailVerified(db, result.userId);
		await updateReaderColumns(db, result.userId, readColumns(cookies, await listBibles(db)));
		await createSession(db, cookies, result.userId, request.headers.get('user-agent') ?? undefined);

		redirect(303, '/');
	}
};
