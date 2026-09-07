import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	isUuid,
	parseRequiredRevision,
	setPrivateNoStore
} from '$lib/server/documents/application';
import {
	getDocumentAttachment,
	mutateDocumentAttachment
} from '$lib/server/repositories/document-attachments';

export async function GET({ params, locals, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return json({ error: 'authenticationRequired' }, { status: 401 });
	if (!isUuid(params.id) || !isUuid(params.attachmentId))
		return json({ error: 'notFound' }, { status: 404 });
	const file = await getDocumentAttachment(getDb(), locals.user.id, params.id, params.attachmentId);
	if (!file) return json({ error: 'notFound' }, { status: 404 });
	const filename = encodeURIComponent(file.filename).replace(
		/['()*]/gu,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return new Response(new Uint8Array(file.content), {
		headers: {
			'content-type': file.mediaType,
			'content-length': String(file.sizeBytes),
			'content-disposition': `attachment; filename="download"; filename*=UTF-8''${filename}`,
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; sandbox"
		}
	});
}

export async function DELETE({ params, locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return json({ error: 'authenticationRequired' }, { status: 401 });
	if (!isUuid(params.id) || !isUuid(params.attachmentId))
		return json({ error: 'notFound' }, { status: 404 });
	const revision = parseRequiredRevision(url.searchParams.get('revision'));
	if (revision === null) return json({ error: 'revision' }, { status: 400 });
	const result = await mutateDocumentAttachment(getDb(), locals.user.id, params.id, revision, {
		type: 'remove',
		id: params.attachmentId
	});
	if (result.ok) return json(result);
	return json(
		{
			error: result.reason,
			...('currentRevision' in result ? { currentRevision: result.currentRevision } : {})
		},
		{ status: result.reason === 'conflict' ? 409 : 404 }
	);
}
