import { fail, redirect } from '@sveltejs/kit';
import { parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import {
	GERMAN_SERMON_STARTER_TEMPLATE,
	isDocumentKind,
	type DocumentKind
} from '$lib/notes/documents';
import {
	documentEditorUrl,
	isUuid,
	MAX_DOCUMENT_QUERY_LENGTH,
	parseOptionalRevision,
	prepareDocumentBody,
	requireDocumentUser,
	setPrivateNoStore
} from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	InvalidTagPathError,
	listDocumentsByTag,
	listDocumentTagTreeWithCounts,
	normalizeTagPath
} from '$lib/server/repositories/document-tags';
import {
	createDocumentWithPassages,
	findDocumentsOverlappingPassage,
	InvalidDocumentInputError,
	listDocuments,
	restoreDocument,
	softDeleteDocument
} from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';

function cleanQuery(value: string | null): string {
	return (value ?? '').trim().slice(0, MAX_DOCUMENT_QUERY_LENGTH);
}

function defaultTitle(kind: DocumentKind): string {
	if (kind === 'sermon') return 'Neue Predigt';
	return 'Neue Notiz';
}

function readExpectedRevision(form: FormData): number | undefined | null {
	const raw = form.get('revision');
	if (raw === null || raw === '') return undefined;
	return parseOptionalRevision(raw) ?? null;
}

function revisionFailure(
	result:
		| { ok: false; reason: 'notFound' }
		| { ok: false; reason: 'conflict'; currentRevision: number }
		| { ok: false; reason: 'invalidResource'; resourceId: string }
) {
	if (result.reason === 'conflict') {
		return fail(409, { error: 'conflict' as const, currentRevision: result.currentRevision });
	}
	if (result.reason === 'invalidResource') {
		return fail(400, { error: 'invalidResource' as const, resourceId: result.resourceId });
	}
	return fail(404, { error: 'notFound' as const });
}

export async function load({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const user = requireDocumentUser(locals.user, url);
	const db = getDb();

	const q = cleanQuery(url.searchParams.get('q'));
	const rawKind = url.searchParams.get('kind');
	const kind = rawKind && isDocumentKind(rawKind) ? rawKind : undefined;
	const tag = (url.searchParams.get('tag') ?? '').trim();
	const passageText = (url.searchParams.get('passage') ?? '').trim();
	const rawResourceId = (url.searchParams.get('resource') ?? '').trim();
	const deleted = url.searchParams.get('deleted') === '1';
	const filterErrors: Array<'kind' | 'tag' | 'passage' | 'resource'> = [];
	if (rawKind && !kind) filterErrors.push('kind');

	const [tagTree, bibles] = await Promise.all([
		listDocumentTagTreeWithCounts(db, user.id, deleted ? 'only' : 'exclude'),
		listBibles(db)
	]);
	const validBibleIds = new Set(bibles.map((bible) => bible.id));
	let resourceId: string | null | undefined;
	if (rawResourceId === 'canonical') resourceId = null;
	else if (rawResourceId) {
		if (validBibleIds.has(rawResourceId)) resourceId = rawResourceId;
		else filterErrors.push('resource');
	}

	let documents: Awaited<ReturnType<typeof listDocuments>>;
	if (tag) {
		try {
			normalizeTagPath(tag);
			documents = await listDocumentsByTag(db, user.id, tag, {
				kind,
				query: q || undefined,
				deleted: deleted ? 'only' : 'exclude'
			});
		} catch (caught) {
			if (!(caught instanceof InvalidTagPathError)) throw caught;
			filterErrors.push('tag');
			documents = await listDocuments(db, user.id, {
				kind,
				query: q || undefined,
				deleted: 'exclude'
			});
		}
	} else {
		documents = await listDocuments(db, user.id, {
			kind,
			query: q || undefined,
			deleted: deleted ? 'only' : 'exclude'
		});
	}
	// Notes and legacy article working copies form one product area. Sermons have their own board.
	documents = documents.filter((document) => document.kind !== 'sermon');

	if (passageText) {
		const passage = parsePassage(passageText);
		const endpoints = passage && passageToDbEndpoints(passage);
		if (!endpoints) {
			filterErrors.push('passage');
		} else if (!rawResourceId || rawResourceId === 'canonical' || resourceId !== undefined) {
			const overlapping = await findDocumentsOverlappingPassage(db, user.id, {
				startKey: endpoints.startKey,
				endKey: endpoints.endKey,
				resourceId,
				kind,
				deleted: deleted ? 'only' : 'exclude'
			});
			const overlappingIds = new Set(overlapping.map((document) => document.id));
			documents = documents.filter((document) => overlappingIds.has(document.id));
		}
	}
	if (filterErrors.length > 0) documents = [];

	return {
		// The library needs searchable excerpts, never complete private bodies in its SSR payload.
		documents: documents.map((document) => ({
			id: document.id,
			kind: document.kind,
			title: document.title,
			plainText: document.plainText,
			visibility: document.visibility,
			revision: document.revision,
			source: document.source,
			updatedAt: document.updatedAt
		})),
		tags: tagTree,
		tagTree,
		bibles,
		filters: {
			q,
			kind: kind ?? null,
			tag,
			passage: passageText,
			resourceId: rawResourceId || null,
			deleted
		},
		filterError: filterErrors[0] ?? null,
		filterErrors
	};
}

export const actions = {
	create: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const rawKind = String(form.get('kind') ?? 'note');
		if (!isDocumentKind(rawKind)) return fail(400, { error: 'kind' as const });

		const rawPassage = String(form.get('passage') ?? form.get('reference') ?? '').trim();
		const parsedPassage = rawPassage ? parsePassage(rawPassage) : null;
		const endpoints = parsedPassage ? passageToDbEndpoints(parsedPassage) : null;
		if (rawPassage && !endpoints) return fail(400, { error: 'passage' as const });

		const resourceId = String(form.get('resourceId') ?? form.get('resource') ?? '').trim() || null;
		if (resourceId && !endpoints) return fail(400, { error: 'passage' as const });
		const db = getDb();
		if (resourceId) {
			const bibles = await listBibles(db);
			if (!bibles.some((bible) => bible.id === resourceId)) {
				return fail(400, { error: 'invalidResource' as const, resourceId });
			}
		}

		const title = String(form.get('title') ?? '').trim() || defaultTitle(rawKind);
		const markdown = rawKind === 'sermon' ? GERMAN_SERMON_STARTER_TEMPLATE : '';
		try {
			const created = await createDocumentWithPassages(
				db,
				user.id,
				{
					kind: rawKind,
					title,
					visibility: 'private',
					source: 'native',
					sermonStatus: rawKind === 'sermon' ? 'idea' : undefined,
					...prepareDocumentBody(markdown)
				},
				endpoints ? [{ ...endpoints, resourceId, position: 0 }] : []
			);
			if (!created.ok) return revisionFailure(created);
			const document = created.document;
			// An enhanced Reader form keeps the private id in component memory and opens the same working
			// copy in the notes sidecar. Every other create workflow retains the established redirect.
			if (form.get('readerSidecar') === '1') {
				return {
					created: true,
					documentId: document.id,
					documentTitle: document.title,
					documentKind: document.kind,
					documentSource: document.source
				};
			}
			redirect(303, documentEditorUrl(document.id, form.get('returnTo')));
		} catch (caught) {
			if (caught instanceof InvalidDocumentInputError) {
				return fail(400, { error: caught.code });
			}
			throw caught;
		}
	},

	softDelete: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!isUuid(id)) return fail(404, { error: 'notFound' as const });
		const revision = readExpectedRevision(form);
		if (revision === null) return fail(400, { error: 'revision' as const });
		const result = await softDeleteDocument(getDb(), user.id, id, revision);
		if (!result.ok) return revisionFailure(result);
		return { saved: true, id, revision: result.revision };
	},

	restore: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!isUuid(id)) return fail(404, { error: 'notFound' as const });
		const revision = readExpectedRevision(form);
		if (revision === null) return fail(400, { error: 'revision' as const });
		const result = await restoreDocument(getDb(), user.id, id, revision);
		if (!result.ok) return revisionFailure(result);
		return { saved: true, id, revision: result.revision };
	}
};
