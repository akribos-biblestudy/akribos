import { error, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	readerWorkspaceBibleColumns,
	resolveReaderWorkspaceContext
} from '$lib/server/reader-workspace-context';
import { listBibles } from '$lib/server/repositories/resources';
import { listHighlightedVerses } from '$lib/server/repositories/verse-highlights';

export async function load({ params, locals, cookies }) {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(`/account/highlights/${params.style}`)}`);
	}

	const db = getDb();
	const bibles = await listBibles(db, locals.user?.id);
	const context = await resolveReaderWorkspaceContext({ cookies, locals });
	const primary = readerWorkspaceBibleColumns(context, bibles)[0] ?? null;
	const result = await listHighlightedVerses(db, locals.user.id, params.style, primary);
	if (!result) error(404, 'Markierungsfarbe nicht gefunden');

	return {
		...result,
		resource: bibles.find((bible) => bible.id === primary) ?? null,
		title: result.style.name ?? 'Versmarkierungen'
	};
}
