import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	checkPasswordStrength,
	MIN_PASSWORD_LENGTH,
	verifyPassword
} from '$lib/server/auth/password';
import { destroyAllSessions, createSession } from '$lib/server/auth/session';
import {
	findUserByEmail,
	updatePassword,
	updateProfile,
	updateReaderFontScale
} from '$lib/server/repositories/users';
import {
	countApiKeys,
	createApiKey,
	listApiKeys,
	MAX_API_KEYS,
	revokeApiKey,
	type ApiKeyScope
} from '$lib/server/repositories/api-keys';
import {
	addHighlightStyle,
	countHighlightStyles,
	listHighlightStyles,
	MAX_STYLES,
	renameHighlightStyle
} from '$lib/server/repositories/highlight-styles';
import { writeFontScale } from '$lib/server/reader-preferences';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export async function load({ locals, url }) {
	if (!locals.user) redirect(303, '/login?redirectTo=%2Faccount');
	if (url.searchParams.get('tab') === 'lists') redirect(303, '/lists');

	const db = getDb();
	const [apiKeys, highlightStyles] = await Promise.all([
		listApiKeys(db, locals.user.id),
		listHighlightStyles(db, locals.user.id)
	]);

	return {
		readerFontScale: locals.user.readerFontScale,
		minPasswordLength: MIN_PASSWORD_LENGTH,
		apiKeys,
		maxApiKeys: MAX_API_KEYS,
		highlightStyles,
		maxHighlightStyles: MAX_STYLES
	};
}

export const actions = {
	profile: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		await updateProfile(getDb(), locals.user.id, String(form.get('displayName') ?? ''));
		return { saved: true };
	},

	reader: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const scale = Number(form.get('fontScale'));
		if (!Number.isFinite(scale)) return fail(400, { readerError: true });
		const savedScale = await updateReaderFontScale(getDb(), locals.user.id, scale);
		writeFontScale(cookies, savedScale);
		return { readerSaved: true };
	},

	password: async ({ request, locals, cookies }) => {
		if (!locals.user) redirect(303, '/login');

		const form = await request.formData();
		const current = String(form.get('currentPassword') ?? '');
		const next = String(form.get('password') ?? '');
		const repeat = String(form.get('passwordRepeat') ?? '');

		const db = getDb();
		const user = await findUserByEmail(db, locals.user.email);
		if (!user || !(await verifyPassword(user.passwordHash, current))) {
			return fail(400, { passwordError: 'current' as const });
		}
		if (next !== repeat) return fail(400, { passwordError: 'mismatch' as const });
		if (checkPasswordStrength(next)) return fail(400, { passwordError: 'weak' as const });

		await updatePassword(db, user.id, next);
		// Other devices are signed out, then this one is signed back in.
		await destroyAllSessions(db, user.id);
		await createSession(db, cookies, user.id, request.headers.get('user-agent') ?? undefined);

		return { passwordSaved: true };
	},

	createApiKey: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const db = getDb();

		const form = await request.formData();
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 100);
		const scope = form.get('scope') === 'personal' ? 'personal' : ('public' as ApiKeyScope);
		if (!name) return fail(400, { apiKeyError: 'name' as const });

		const existing = await countApiKeys(db, locals.user.id);
		if (existing >= MAX_API_KEYS) return fail(400, { apiKeyError: 'limit' as const });

		const { apiKey, key } = await createApiKey(db, locals.user.id, name, scope);
		return { createdApiKey: { id: apiKey.id, key } };
	},

	revokeApiKey: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (id) await revokeApiKey(getDb(), locals.user.id, id);
		return { apiKeyRevoked: true };
	},

	renameHighlightStyle: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 60);
		if (!id) return fail(400, { highlightStyleError: 'unknown' as const });

		await renameHighlightStyle(getDb(), locals.user.id, id, name);
		return { highlightStyleRenamed: true };
	},

	addHighlightStyle: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const db = getDb();

		const form = await request.formData();
		const color = String(form.get('color') ?? '');
		const name = String(form.get('name') ?? '')
			.trim()
			.slice(0, 60);
		if (!HEX_COLOR.test(color)) return fail(400, { highlightStyleError: 'color' as const });

		const existing = await countHighlightStyles(db, locals.user.id);
		if (existing >= MAX_STYLES) return fail(400, { highlightStyleError: 'limit' as const });

		await addHighlightStyle(db, locals.user.id, color, name);
		return { highlightStyleAdded: true };
	}
};
