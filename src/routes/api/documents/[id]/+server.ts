import { json } from '@sveltejs/kit';
import { DocumentMarkdownError } from '$lib/notes/document-markdown';
import { isDocumentVisibility, isSermonWorkflowState } from '$lib/notes/documents';
import {
	isUuid,
	MAX_DOCUMENT_JSON_BYTES,
	parseCalendarDate,
	parseOptionalRevision,
	parseRequiredRevision,
	prepareDocumentBody,
	setPrivateNoStore
} from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	getDocument,
	InvalidDocumentInputError,
	softDeleteDocument,
	updateDocument,
	type DocumentMutationResult,
	type DocumentRevisionResult,
	type UpdateDocumentInput
} from '$lib/server/repositories/documents';

function responseError(status: number, error: string, extra: Record<string, unknown> = {}) {
	return json({ error, ...extra }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mutationResponse(result: DocumentMutationResult): Response {
	if (result.ok) return json({ document: result.document });
	if (result.reason === 'conflict') {
		return responseError(409, 'conflict', { currentRevision: result.currentRevision });
	}
	return responseError(404, 'notFound');
}

function deletionResponse(result: DocumentRevisionResult): Response {
	if (result.ok) return json({ deleted: true, revision: result.revision });
	if (result.reason === 'conflict') {
		return responseError(409, 'conflict', { currentRevision: result.currentRevision });
	}
	if (result.reason === 'invalidResource') {
		return responseError(400, 'invalidResource', { resourceId: result.resourceId });
	}
	return responseError(404, 'notFound');
}

export async function GET({ params, locals, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return responseError(401, 'authenticationRequired');
	if (!isUuid(params.id)) return responseError(404, 'notFound');

	const document = await getDocument(getDb(), locals.user.id, params.id);
	return document ? json({ document }) : responseError(404, 'notFound');
}

export async function PATCH({ params, locals, request, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return responseError(401, 'authenticationRequired');
	if (!isUuid(params.id)) return responseError(404, 'notFound');
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		return responseError(415, 'jsonRequired');
	}

	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_JSON_BYTES) {
		return responseError(413, 'requestTooLarge');
	}
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > MAX_DOCUMENT_JSON_BYTES) {
		return responseError(413, 'requestTooLarge');
	}

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return responseError(400, 'invalidJson');
	}
	if (!isRecord(payload)) return responseError(400, 'invalidPayload');
	if ('kind' in payload) return responseError(400, 'kindImmutable');

	const revision = parseRequiredRevision(payload.revision);
	if (revision === null) return responseError(400, 'revision');
	if (typeof payload.title !== 'string') return responseError(400, 'title');
	if (typeof payload.markdown !== 'string') return responseError(400, 'markdown');
	const requestedVisibility = payload.visibility;
	if (requestedVisibility !== undefined && !isDocumentVisibility(requestedVisibility)) {
		return responseError(400, 'visibility');
	}

	const db = getDb();
	const current = await getDocument(db, locals.user.id, params.id);
	if (!current) return responseError(404, 'notFound');

	const hasSermonMetadata =
		'sermonStatus' in payload || 'sermonDate' in payload || 'sermonSeries' in payload;
	if (current.kind !== 'sermon' && hasSermonMetadata) {
		return responseError(400, 'sermonFields');
	}

	let input: UpdateDocumentInput;
	try {
		input = {
			title: payload.title,
			body: prepareDocumentBody(payload.markdown),
			// Autosave never publishes. It preserves a note's current snapshot visibility and
			// keeps sermon workflow documents private; only the admin publication action changes it.
			visibility: current.kind === 'sermon' ? 'private' : current.visibility
		};
	} catch (caught) {
		if (caught instanceof DocumentMarkdownError) {
			return responseError(caught.code === 'file_too_large' ? 413 : 400, caught.code);
		}
		throw caught;
	}
	if (current.kind === 'sermon') {
		if (payload.sermonStatus !== undefined) {
			if (!isSermonWorkflowState(payload.sermonStatus)) {
				return responseError(400, 'sermonStatus');
			}
			input.sermonStatus = payload.sermonStatus;
		}
		if (payload.sermonDate !== undefined) {
			const date = parseCalendarDate(payload.sermonDate);
			if (!date.ok) return responseError(400, 'sermonDate');
			input.sermonDate = date.value;
		}
		if (payload.sermonSeries !== undefined) {
			if (payload.sermonSeries !== null && typeof payload.sermonSeries !== 'string') {
				return responseError(400, 'sermonSeries');
			}
			const series = payload.sermonSeries?.trim() || null;
			if (series && Array.from(series).length > 200) {
				return responseError(400, 'sermonSeries');
			}
			input.sermonSeries = series;
		}
	}

	try {
		return mutationResponse(await updateDocument(db, locals.user.id, params.id, revision, input));
	} catch (caught) {
		if (caught instanceof DocumentMarkdownError) {
			return responseError(caught.code === 'file_too_large' ? 413 : 400, caught.code);
		}
		if (caught instanceof InvalidDocumentInputError) {
			return responseError(400, caught.code);
		}
		throw caught;
	}
}

export async function DELETE({ params, locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return responseError(401, 'authenticationRequired');
	if (!isUuid(params.id)) return responseError(404, 'notFound');

	const rawRevision = url.searchParams.get('revision');
	const revision = parseOptionalRevision(rawRevision);
	if (rawRevision !== null && revision === undefined) return responseError(400, 'revision');
	return deletionResponse(await softDeleteDocument(getDb(), locals.user.id, params.id, revision));
}
