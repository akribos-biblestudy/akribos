import { error } from '@sveltejs/kit';
import { isUuid, requireDocumentUser, setPrivateNoStore } from '$lib/server/documents/application';
import { createPdfExport, loadOwnedDocumentExport } from '$lib/server/documents/export';
import { getDb } from '$lib/server/db';

export const prerender = false;

export async function GET({ params, locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const user = requireDocumentUser(locals.user, url);
	if (!isUuid(params.id)) error(404, 'Dokument nicht gefunden');
	const data = await loadOwnedDocumentExport(getDb(), user.id, params.id);
	if (!data) error(404, 'Dokument nicht gefunden');
	const exported = await createPdfExport(data);
	return new Response(new Uint8Array(exported.buffer), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': exported.contentDisposition,
			'content-length': String(exported.buffer.byteLength),
			'x-content-type-options': 'nosniff'
		}
	});
}
