import { redirect } from '@sveltejs/kit';
import { parseReference, referencePath } from '$lib/bible/reference';
import { normalizeStrongId } from '$lib/bible/strong';
import { isValidBookId } from '$lib/bible/books';
import { getDb } from '$lib/server/db';
import {
	readerWorkspaceBibleColumns,
	resolveReaderWorkspaceContext
} from '$lib/server/reader-workspace-context';
import { listBibles } from '$lib/server/repositories/resources';
import { search } from '$lib/server/repositories/search';

/**
 * Search results.
 *
 * An input that turns out to be a reference or a Strong's number is redirected rather than searched,
 * so pasting "Joh 3,16" into the search box lands on the chapter — the behaviour of the old catch-all
 * view, now in one place.
 */
export async function load({ url, cookies, setHeaders, locals }) {
	const query = (url.searchParams.get('q') ?? '').trim();
	const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
	const requestedBook = Number.parseInt(url.searchParams.get('book') ?? '', 10);
	const book = isValidBookId(requestedBook) ? requestedBook : undefined;

	if (!query) {
		return { query: '', results: null, columns: [] };
	}

	const strong = normalizeStrongId(query);
	if (strong) redirect(303, `/${strong}`);

	const reference = parseReference(query);
	if (reference) redirect(303, referencePath(reference));

	const db = getDb();
	const bibles = await listBibles(db, locals.user?.id);
	const context = await resolveReaderWorkspaceContext({ cookies, locals });
	const columnIds = readerWorkspaceBibleColumns(context, bibles);
	const byId = new Map(bibles.map((bible) => [bible.id, bible]));

	const results = await search(db, query, { resourceIds: columnIds, page, book });

	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=600' });

	return {
		query,
		book: book ?? null,
		results,
		title: query,
		columns: columnIds.flatMap((id) => {
			const resource = byId.get(id);
			return resource ? [resource] : [];
		})
	};
}
