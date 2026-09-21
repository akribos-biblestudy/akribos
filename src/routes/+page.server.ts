import { redirect } from '@sveltejs/kit';
import { parseReference, referencePath } from '$lib/bible/reference';

import {
	readBoundReaderResume,
	resolveReaderWorkspaceContext
} from '$lib/server/reader-workspace-context';
import { activeReaderTab } from '$lib/reader/workspace';
import { readerUrl } from '$lib/reader/url-state';

import { persistReaderWorkspace } from '$lib/server/repositories/saved-reader-workspaces';
import { getDb } from '$lib/server/db';

const LOCATION_COOKIE = 'location';

/**
 * The public entry point goes straight to the reader for every visitor. Signed-in readers resume
 * where they last read; signed-out visitors and new accounts start at John 1. The marketing page
 * itself lives on at `/about`.
 *
 * This response must never be shared by a CDN because its outcome depends on the session cookie.
 */
export async function load({ cookies, locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });

	if (locals.user) {
		const context = await resolveReaderWorkspaceContext({ cookies, locals });
		if (context.activeSaved && context.snapshot) {
			const resume = readBoundReaderResume(cookies, context);
			if (resume && context.guard) {
				const result = await persistReaderWorkspace(getDb(), locals.user.id, resume.workspace, {
					guard: context.guard,
					readerState: resume.snapshot.readerState
				});
				// Another device may have changed the content while this request was resolving it.
				if (!result.saved) redirect(307, '/');
			}
			const workspace = resume?.workspace ?? context.workspace;
			const snapshot = resume?.snapshot ?? context.snapshot;
			const tile = workspace.tiles.find((entry) => entry.id === workspace.focusedTileId);
			const reference = tile && activeReaderTab(tile)?.reference;
			if (reference) redirect(307, readerUrl(referencePath(reference), snapshot.readerState));
		}
	}
	const stored = locals.user ? cookies.get(LOCATION_COOKIE) : null;
	const reference = stored ? parseReference(stored) : null;
	redirect(307, referencePath(reference ?? { book: 43, chapter: 1 }));
}
