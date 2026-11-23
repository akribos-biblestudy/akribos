import { redirect } from '@sveltejs/kit';
import { parseReference, referencePath } from '$lib/bible/reference';
import { resolveReaderWorkspaceContext } from '$lib/server/reader-workspace-context';
import { activeReaderTab } from '$lib/reader/workspace';
import { readerUrl } from '$lib/reader/url-state';

const LOCATION_COOKIE = 'location';

export async function load({ cookies, locals, setHeaders }) {
	// Guests see the landing page. A signed-in visitor resumes their reader, so this response
	// cannot be shared across sessions.
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) return;

	const context = await resolveReaderWorkspaceContext({ cookies, locals });
	if (context.activeSaved && context.snapshot) {
		const workspace = context.workspace;
		const snapshot = context.snapshot;
		const tile = workspace.tiles.find((entry) => entry.id === workspace.focusedTileId);
		const reference = tile && activeReaderTab(tile)?.reference;
		if (reference)
			redirect(
				307,
				readerUrl(referencePath(reference), snapshot.readerState) +
					(locals.readerBrowserTabId ? '' : '&readerResume=1')
			);
	}

	const stored = !locals.localReader ? cookies.get(LOCATION_COOKIE) : null;
	const reference = stored ? parseReference(stored) : null;
	redirect(307, referencePath(reference ?? { book: 43, chapter: 1 }));
}
