import type { Cookies } from '@sveltejs/kit';
import { normalizeFontScale } from '../reader/font-scale.ts';

export {
	FONT_SCALE_STEP,
	MAX_FONT_SCALE,
	MIN_FONT_SCALE,
	normalizeFontScale
} from '../reader/font-scale.ts';

/**
 * Device-local reader preferences: font size and colour scheme.
 *
 * Each is a cookie so server rendering already knows the choice, plus an account column that is used
 * only to seed a device that has not set its own cookie yet — the first time a reader opens the site
 * and signs in. After that first seed, this device's cookie is authoritative even while signed in, so
 * a phone and a desktop can keep different settings instead of one overwriting the other on every
 * visit. Changes still get written back to the account (see the `?/...` actions in the reader), which
 * is what lets a *new* device pick them up.
 */

export const FONT_SCALE_COOKIE = 'reader-font-scale';
export const THEME_COOKIE = 'theme';
export type Theme = 'light' | 'dark';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** This device's cookie wins when set; otherwise the account's value seeds it; otherwise 100%. */
export function readFontScale(cookies: Cookies, accountScale?: number | null): number {
	const stored = cookies.get(FONT_SCALE_COOKIE);
	if (stored !== undefined) return normalizeFontScale(Number(stored));
	if (accountScale !== undefined && accountScale !== null) return normalizeFontScale(accountScale);
	return 100;
}

export function writeFontScale(cookies: Cookies, scale: number): void {
	cookies.set(FONT_SCALE_COOKIE, String(normalizeFontScale(scale)), {
		path: '/',
		maxAge: COOKIE_MAX_AGE_SECONDS,
		httpOnly: false,
		sameSite: 'lax'
	});
}

/**
 * This device's cookie wins when set; otherwise the account's value seeds it; otherwise `undefined`,
 * meaning "follow the operating system", which only the client can decide.
 */
export function readTheme(cookies: Cookies, accountTheme?: Theme | null): Theme | undefined {
	const stored = cookies.get(THEME_COOKIE);
	if (stored === 'light' || stored === 'dark') return stored;
	if (accountTheme === 'light' || accountTheme === 'dark') return accountTheme;
	return undefined;
}

export function writeTheme(cookies: Cookies, theme: Theme): void {
	cookies.set(THEME_COOKIE, theme, {
		path: '/',
		maxAge: COOKIE_MAX_AGE_SECONDS,
		httpOnly: false,
		sameSite: 'lax'
	});
}
