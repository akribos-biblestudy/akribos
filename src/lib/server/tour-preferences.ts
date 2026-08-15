import type { Cookies } from '@sveltejs/kit';

/**
 * Device-local record of the product tour's signed-out part, the same idea as the `theme` and
 * `reader-font-scale` cookies in `reader-preferences.ts`: a plain, non-`httpOnly` cookie so a later
 * sign-in on the same browser can tell whether the signed-out steps were already shown, and only add
 * the signed-in-only ones. The signed-in "done" state itself lives on the account
 * (`users.tourCompletedAt`), not here, so it follows a reader across devices.
 */
export const TOUR_GUEST_COOKIE = 'tour-guest-done';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readTourGuestDone(cookies: Cookies): boolean {
	return cookies.get(TOUR_GUEST_COOKIE) === '1';
}

export function writeTourGuestDone(cookies: Cookies): void {
	cookies.set(TOUR_GUEST_COOKIE, '1', {
		path: '/',
		maxAge: COOKIE_MAX_AGE_SECONDS,
		httpOnly: false,
		sameSite: 'lax'
	});
}
