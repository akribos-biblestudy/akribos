import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { lockLoginEmail } from '../auth/email-login.ts';
import type { Database } from '../db/client.ts';
import { emailLogins, loginAttempts, users, verseListInvites } from '../db/schema.ts';

type AccountDeletionResult = 'deleted' | 'unavailable' | 'lastAdmin';

export async function deleteAccount(
	db: Database,
	userId: string,
	email: string
): Promise<AccountDeletionResult> {
	return db.transaction(async (tx) => {
		// Concurrent self-deletions must agree which administrator stays.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('account-deletion', 0))`);
		await lockLoginEmail(tx, email);
		const [account] = await tx
			.select({ role: users.role })
			.from(users)
			.where(and(eq(users.id, userId), eq(users.email, email), isNull(users.disabledAt)))
			.for('update');
		if (!account) return 'unavailable';

		if (account.role === 'admin') {
			const [otherAdmin] = await tx
				.select({ id: users.id })
				.from(users)
				.where(and(eq(users.role, 'admin'), ne(users.id, userId), isNull(users.disabledAt)))
				.limit(1)
				.for('no key update');
			if (!otherAdmin) return 'lastAdmin';
		}

		// Sign-in links issued before registration and list invitations can be keyed by email alone.
		await tx.delete(emailLogins).where(eq(emailLogins.email, email));
		await tx.delete(verseListInvites).where(eq(verseListInvites.email, email));
		// Sign-in can already be pruning expired attempts while it waits for the email lock.
		const attempts = tx
			.select({ id: loginAttempts.id })
			.from(loginAttempts)
			.where(
				inArray(loginAttempts.subject, [
					`email:${email}`,
					`email-login-start:email:${email}`,
					`email-login-send:email:${email}`,
					`list-invite:${userId}`
				])
			)
			.for('update', { skipLocked: true });
		await tx.delete(loginAttempts).where(inArray(loginAttempts.id, attempts));

		// Account-owned data and sessions cascade. Feedback and Strong reviews lose their author link.
		await tx.delete(users).where(eq(users.id, userId));
		return 'deleted';
	});
}
