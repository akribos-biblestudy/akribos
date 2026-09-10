import { resourceViewerId } from '$lib/server/api/identity';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api/errors';
import { resolveApiIdentity } from '$lib/server/api/identity';
import { listBibles } from '$lib/server/repositories/resources';
import { listHighlightStyles } from '$lib/server/repositories/highlight-styles';
import { listHighlightedVerses } from '$lib/server/repositories/verse-highlights';

/** The caller's own highlighted verses, filtered by one palette style. */
export async function GET({ url, locals }) {
	const identity = resolveApiIdentity(locals);
	if (identity.scope !== 'personal' || !identity.userId) {
		return apiError(
			403,
			'personal_scope_required',
			'Reading highlights needs a signed-in session or a personal-scope API key.'
		);
	}

	const db = getDb();
	const requestedStyle = url.searchParams.get('style')?.trim() || undefined;
	const requestedColor = url.searchParams.get('color')?.trim().toLocaleLowerCase();
	const styles = await listHighlightStyles(db, identity.userId);
	const styleId =
		requestedStyle ??
		styles.find((style) => style.color.toLocaleLowerCase() === requestedColor)?.id;
	if (!styleId) {
		return apiError(
			400,
			'missing_style',
			'The style or color query parameter must name one of your highlight styles.'
		);
	}

	const bibles = await listBibles(db, resourceViewerId(locals));
	const requestedResource = url.searchParams.get('resource')?.trim();
	const resource = requestedResource
		? bibles.find((bible) => bible.id === requestedResource)
		: bibles[0];
	if (requestedResource && !resource) {
		return apiError(404, 'unknown_bible', `No bible with id "${requestedResource}".`);
	}

	const result = await listHighlightedVerses(db, identity.userId, styleId, resource?.id ?? null);
	if (!result) return apiError(404, 'unknown_highlight_style', 'No such highlight style.');

	return json({ ...result, resource: resource?.id ?? null });
}
