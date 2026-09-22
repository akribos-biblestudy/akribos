import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listBibles } from '$lib/server/repositories/resources';

/** Only the labels needed by internal verse previews and quotations. */
export async function GET({ locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const resources = await listBibles(getDb(), locals.user?.id);
	return json({ resources: resources.map(({ id, tabTitle }) => ({ id, tabTitle })) });
}
