/**
 * Who a public API request is acting as, for endpoints that serve personal data.
 *
 * A trusted (same-origin) request follows the ordinary session cookie, exactly like the rest of the
 * site — logged in or not. A keyed request follows the key: its owner, and only 'personal' scope
 * reaches their own verse lists and notes.
 */
export type ApiIdentity = { userId: string | null; scope: 'public' | 'personal' };

export function resolveApiIdentity(locals: App.Locals): ApiIdentity {
	if (locals.apiAuth?.kind === 'key') {
		return { userId: locals.apiAuth.apiKey.userId, scope: locals.apiAuth.apiKey.scope };
	}
	return { userId: locals.user?.id ?? null, scope: 'personal' };
}

/** Public-scope keys never inherit their owner's private resource grants. */
export function resourceViewerId(locals: App.Locals): string | null {
	const identity = resolveApiIdentity(locals);
	return identity.scope === 'personal' ? identity.userId : null;
}
