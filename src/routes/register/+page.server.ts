import { redirect } from '@sveltejs/kit';
import { loginRedirect } from '$lib/server/auth/redirect';

/** Registration and sign-in share one email-first entry point. Old activation links remain valid. */
export function load({ url }) {
	redirect(
		303,
		`/login?restart=1&redirectTo=${encodeURIComponent(loginRedirect(url.searchParams.get('redirectTo')))}`
	);
}
