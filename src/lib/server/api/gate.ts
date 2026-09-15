/**
 * Public API authentication gate.
 *
 * Decides, for a request under `/api/v1`, whether it may proceed without an API key (the
 * Akribos frontend itself) or must present one — and if it presents one, resolves its owner
 * and scope.
 *
 * A caveat worth being explicit about: `Origin` and `Sec-Fetch-Site` are only unspoofable for an
 * actual browser — a browser will not let page JavaScript override them, but any non-browser HTTP
 * client (curl, a server-to-server integration) can set either header to whatever it likes. That
 * makes this check meaningful for its real purpose — recognising genuine same-origin browser
 * traffic from the site's own frontend so it is not made to register for a key — but it is not a
 * confidentiality boundary: the "trusted" path only ever reaches already-public content. Someone
 * spoofing their way into it gains nothing but a different (more generous) rate-limit bucket, not
 * access to another user's data — that still requires a real session cookie or a `personal`-scope
 * key, checked separately by whichever endpoint needs it.
 */

import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { config } from '../config.ts';
import type { Database } from '../db/client.ts';
import { apiKeys, users, type ApiKey } from '../db/schema.ts';
import { logger } from '../logger.ts';

export type ApiAuth =
	{ kind: 'trusted' } | { kind: 'key'; apiKey: Pick<ApiKey, 'id' | 'userId' | 'scope'> };

export type ApiGateResult =
	| { ok: true; auth: ApiAuth; rateLimitSubject: string }
	| { ok: false; status: 401; code: 'missing_api_key' | 'invalid_api_key' };

function hashKey(key: string): string {
	return createHash('sha256').update(key).digest('hex');
}

function isTrustedRequest(request: Request): boolean {
	const origin = request.headers.get('origin');
	if (origin && origin === config().ORIGIN) return true;
	// A same-origin fetch does not always carry `Origin`, but current browsers reliably attach
	// `Sec-Fetch-Site` and cannot be scripted into lying about it.
	return request.headers.get('sec-fetch-site') === 'same-origin';
}

export async function authenticateApiRequest(
	db: Database,
	request: Request,
	clientAddress: string
): Promise<ApiGateResult> {
	if (isTrustedRequest(request)) {
		return { ok: true, auth: { kind: 'trusted' }, rateLimitSubject: `ip:${clientAddress}` };
	}

	const header = request.headers.get('authorization');
	const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
	if (!token) return { ok: false, status: 401, code: 'missing_api_key' };

	const id = hashKey(token);
	const [row] = await db
		.select({ id: apiKeys.id, userId: apiKeys.userId, scope: apiKeys.scope })
		.from(apiKeys)
		.innerJoin(users, eq(users.id, apiKeys.userId))
		.where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt), isNull(users.disabledAt)))
		.limit(1);
	if (!row) return { ok: false, status: 401, code: 'invalid_api_key' };

	// Awaiting executes Drizzle's lazy query; a statistics failure must not deny a valid reader.
	await db
		.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKeys.id, id))
		.catch((error) => logger.warn({ err: error }, 'could not record API key usage'));

	return {
		ok: true,
		auth: { kind: 'key', apiKey: { id: row.id, userId: row.userId, scope: row.scope } },
		rateLimitSubject: `key:${row.id}`
	};
}
