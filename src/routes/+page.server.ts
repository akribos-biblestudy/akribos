import { redirect } from '@sveltejs/kit';
import { parseReference, referencePath } from '$lib/bible/reference';

const LOCATION_COOKIE = 'location';

/**
 * The public entry point goes straight to the reader for every visitor. Signed-in readers resume
 * where they last read; signed-out visitors and new accounts start at John 1. The marketing page
 * itself lives on at `/about`.
 *
 * This response must never be shared by a CDN because its outcome depends on the session cookie.
 */
export function load({ cookies, locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });

	const stored = locals.user ? cookies.get(LOCATION_COOKIE) : null;
	const reference = stored ? parseReference(stored) : null;
	redirect(307, referencePath(reference ?? { book: 43, chapter: 1 }));
}
