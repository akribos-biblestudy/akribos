import { json } from '@sveltejs/kit';
import { MAX_ATTACHMENT_BYTES } from '$lib/notes/attachments';
import { getDb } from '$lib/server/db';
import {
	isUuid,
	parseRequiredRevision,
	setPrivateNoStore
} from '$lib/server/documents/application';
import { getDocument } from '$lib/server/repositories/documents';
import {
	listDocumentAttachments,
	mutateDocumentAttachment
} from '$lib/server/repositories/document-attachments';
import {
	InvalidFormBodyError,
	readBoundedFormData,
	RequestBodyTooLargeError
} from '$lib/server/http/bounded-form-data';

export async function GET({ params, locals, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return json({ error: 'authenticationRequired' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'notFound' }, { status: 404 });
	const db = getDb();
	const document = await getDocument(db, locals.user.id, params.id);
	if (document?.kind !== 'sermon') return json({ error: 'notFound' }, { status: 404 });
	return json({ attachments: await listDocumentAttachments(db, locals.user.id, params.id) });
}

export async function POST({ params, locals, request, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return json({ error: 'authenticationRequired' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'notFound' }, { status: 404 });
	const db = getDb();
	// Check ownership before reading a potentially large body; the transaction rechecks under lock.
	const document = await getDocument(db, locals.user.id, params.id);
	if (document?.kind !== 'sermon') return json({ error: 'notFound' }, { status: 404 });
	let form: FormData;
	try {
		form = await readBoundedFormData(request, MAX_ATTACHMENT_BYTES + 64 * 1024);
	} catch (caught) {
		if (caught instanceof RequestBodyTooLargeError)
			return json({ error: 'fileTooLarge' }, { status: 413 });
		if (caught instanceof InvalidFormBodyError)
			return json({ error: 'invalidFile' }, { status: 400 });
		throw caught;
	}
	const revision = parseRequiredRevision(form.get('revision'));
	if (revision === null) return json({ error: 'revision' }, { status: 400 });
	const files = form.getAll('file');
	const file = files[0];
	if (files.length !== 1 || !(file instanceof File) || !file.size)
		return json({ error: 'invalidFile' }, { status: 400 });
	if (file.size > MAX_ATTACHMENT_BYTES) return json({ error: 'fileTooLarge' }, { status: 413 });
	const result = await mutateDocumentAttachment(db, locals.user.id, params.id, revision, {
		type: 'add',
		filename: file.name,
		mediaType: file.type,
		content: Buffer.from(await file.arrayBuffer())
	});
	if (result.ok) return json(result, { status: 201 });
	return json(
		{
			error: result.reason,
			...('currentRevision' in result ? { currentRevision: result.currentRevision } : {})
		},
		{
			status:
				result.reason === 'conflict'
					? 409
					: result.reason === 'notFound'
						? 404
						: result.reason === 'fileTooLarge'
							? 413
							: 400
		}
	);
}
