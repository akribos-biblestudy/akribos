import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { writeTourGuestDone } from '$lib/server/tour-preferences';
import { completeTour } from '$lib/server/repositories/users';

/**
 * Records the product tour as seen: this device's cookie always, and — when signed in — the account
 * too, so a later sign-in (on this browser or another) knows not to show it again. Mirrors
 * `/api/theme`: the client already updated its own state before this request goes out; this only makes
 * it stick.
 */
export async function POST({ cookies, locals }) {
	writeTourGuestDone(cookies);
	if (locals.user) await completeTour(getDb(), locals.user.id);

	return json({ success: true });
}
