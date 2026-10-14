import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { loadReaderNavigation } from '$lib/server/repositories/reader-navigation';

export async function GET({ params, locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const books = await loadReaderNavigation(getDb(), params.resource, locals.user?.id);
	if (!books) error(404, 'Unbekannte Ressource');
	return json({ books });
}
