import { json } from '@sveltejs/kit';
import { isUuid, setPrivateNoStore } from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import { listDocumentRelations } from '$lib/server/repositories/document-links';
import { getDocument } from '$lib/server/repositories/documents';

function responseError(status: number, error: string) {
	return json({ error }, { status });
}

/** Relationship summaries never cross the same owner boundary as the working copies themselves. */
export async function GET({ params, locals, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return responseError(401, 'authenticationRequired');
	if (!isUuid(params.id)) return responseError(404, 'notFound');
	const db = getDb();
	if (!(await getDocument(db, locals.user.id, params.id))) return responseError(404, 'notFound');
	return json(await listDocumentRelations(db, locals.user.id, params.id));
}
