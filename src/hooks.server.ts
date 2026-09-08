import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { resolveSession } from '$lib/server/auth/session';
import { failInterruptedJobs } from '$lib/server/import/jobs';
import { pruneExpiredSessions } from '$lib/server/auth/session';
import { logger } from '$lib/server/logger';
import { authenticateApiRequest, type ApiAuth } from '$lib/server/api/gate';
import { checkApiRateLimit, KEYED_LIMIT, TRUSTED_LIMIT } from '$lib/server/api/rate-limit';
import { apiError } from '$lib/server/api/errors';
import { cleanStaleStagedFiles, failInterruptedBackupJobs } from '$lib/server/backup/jobs';
import { startBackupScheduler } from '$lib/server/backup/scheduler';
import { backfillHebrewTranslations } from '$lib/server/import/backfill-hebrew-translations';
import { backfillDocumentBodyReferenceIndexes } from '$lib/server/repositories/document-reference-index';

/**
 * Runs once when the server starts.
 *
 * An import that was running when the process stopped can neither continue nor be trusted, so it is
 * marked as failed; leaving it at "running" would be indistinguishable from one that is working.
 */
export const init: ServerInit = async () => {
	const db = getDb();
	try {
		await failInterruptedJobs(db);
		await failInterruptedBackupJobs(db);
		await pruneExpiredSessions(db);
		await cleanStaleStagedFiles();
	} catch (error) {
		// A database that is not up yet must not stop the server from booting: the healthcheck will
		// report unhealthy until it is, which is the signal the deployment watches.
		logger.warn({ err: error }, 'startup housekeeping skipped');
	}
	try {
		const indexedDocuments = await backfillDocumentBodyReferenceIndexes(db);
		if (indexedDocuments > 0) {
			logger.info({ indexedDocuments }, 'document Bible-reference index backfilled');
		}
	} catch (error) {
		// Missing/outdated index rows have a read-only parsing fallback, so an unexpected legacy body must
		// not prevent the server from starting or the unrelated housekeeping above from completing.
		logger.warn({ err: error }, 'document Bible-reference index backfill skipped');
	}

	try {
		const translatedEntries = await backfillHebrewTranslations(db);
		if (translatedEntries > 0)
			logger.info({ translatedEntries }, 'Hebrew lexicon translations backfilled');
	} catch (error) {
		// The original edition stays readable when enrichment is temporarily unavailable.
		logger.warn({ err: error }, 'Hebrew lexicon translation backfill skipped');
	}

	// Outside the try/catch above: a database that is briefly unreachable at boot must not permanently
	// leave the site without a scheduler until the next deploy.
	startBackupScheduler(db);
};

/**
 * Request pipeline: resolve the session, guard the admin area, log slow requests.
 *
 * The admin guard lives here rather than in each route so a new admin page cannot be added without
 * protection by forgetting a check.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const recovered = recoverMalformedUri(event.url);
	// A plain Response rather than `redirect()`: thrown this early, before any `await`, it turns into
	// an unhandled rejection instead of a redirect — `redirect()` further down (past the session
	// lookup's `await`) is unaffected.
	if (recovered) return new Response(null, { status: 301, headers: { location: recovered } });

	const session = await resolveSession(getDb(), event.cookies);
	event.locals.user = session?.user ?? null;
	event.locals.sessionId = session?.sessionId ?? null;

	if (event.url.pathname.startsWith('/admin')) {
		if (!event.locals.user) {
			redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`);
		}
		if (event.locals.user.role !== 'admin') {
			// 404 rather than 403: the existence of the admin area is not worth confirming.
			return protectAuthenticatedResponse(
				event.locals.user,
				new Response('Not found', { status: 404 })
			);
		}
	}

	event.locals.apiAuth = null;
	if (event.url.pathname.startsWith('/api/v1/')) {
		const gated = await guardApiRequest(event.request, event.getClientAddress());
		if (gated instanceof Response) return protectAuthenticatedResponse(event.locals.user, gated);
		event.locals.apiAuth = gated;
	}

	const started = Date.now();
	const response = await resolve(event);
	const duration = Date.now() - started;

	// The root layout contains the signed-in user's identity and reader preferences. A child route can
	// legitimately make its anonymous representation publicly cacheable (reader chapters, published
	// published notes, and so on), but that header must never make the personalised SSR response eligible for
	// a shared cache. Keeping this final guard in the request pipeline makes the privacy invariant apply
	// to new routes automatically instead of relying on every page author to remember it.
	protectAuthenticatedResponse(event.locals.user, response);

	if (duration > 500) {
		logger.warn({ path: event.url.pathname, duration, status: response.status }, 'slow request');
	}

	return response;
};

/** Applies the shared-cache guard even to responses that short-circuit before `resolve()`. */
function protectAuthenticatedResponse(user: App.Locals['user'], response: Response): Response {
	if (user) response.headers.set('cache-control', 'private, no-store');
	return response;
}

/**
 * Authenticates and rate-limits a request to the public API, returning either the resolved
 * `ApiAuth` to stash on `event.locals` or a `Response` to short-circuit with (401 or 429).
 */
async function guardApiRequest(
	request: Request,
	clientAddress: string
): Promise<ApiAuth | Response> {
	const db = getDb();
	const gate = await authenticateApiRequest(db, request, clientAddress);
	if (!gate.ok) {
		const message =
			gate.code === 'missing_api_key'
				? 'This request needs an API key. See https://akribos.de/api for how to get one.'
				: 'This API key is invalid or has been revoked.';
		return apiError(gate.status, gate.code, message);
	}

	const limit = gate.auth.kind === 'key' ? KEYED_LIMIT : TRUSTED_LIMIT;
	const rate = await checkApiRateLimit(db, gate.rateLimitSubject, limit);
	if (!rate.allowed) {
		const response = apiError(429, 'rate_limited', 'Too many requests. Try again shortly.');
		response.headers.set('Retry-After', String(rate.retryAfterSeconds));
		return response;
	}

	return gate.auth;
}

/**
 * Some old browsers and stale bookmarked links percent-encode non-ASCII characters as Latin-1 (e.g.
 * "ö" as `%F6`) instead of UTF-8 (`%C3%B6`). SvelteKit's router rejects that outright with a 400
 * before any route runs, so it has to be recovered here: reinterpret the escapes as Latin-1 — whose
 * codepoints (0–255) already agree with Unicode — and redirect to the correctly UTF-8-encoded URL.
 */
function recoverMalformedUri(url: URL): string | null {
	try {
		decodeURI(url.pathname);
		return null;
	} catch {
		const recovered = url.pathname.replace(/%[0-9A-Fa-f]{2}/g, (hex) =>
			String.fromCharCode(parseInt(hex.slice(1), 16))
		);
		return `${encodeURI(recovered)}${url.search}`;
	}
}
