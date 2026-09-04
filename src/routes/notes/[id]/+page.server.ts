import { error, fail } from '@sveltejs/kit';
import {
	formatPassage,
	parsePassage,
	passageFromDbEndpoints,
	passageToDbEndpoints
} from '$lib/bible/passage';
import { isDocumentVisibility } from '$lib/notes/documents';
import {
	isUuid,
	normalizeExcerpt,
	parseCalendarDate,
	parseRequiredRevision,
	requireDocumentUser,
	safeReturnTo,
	setPrivateNoStore,
	slugifyArticle
} from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	InvalidTagPathError,
	listDocumentTags,
	listDocumentTagTree,
	syncDocumentTags
} from '$lib/server/repositories/document-tags';
import {
	getOwnedDocumentPublication,
	publishArticle,
	unpublishArticle
} from '$lib/server/repositories/document-publications';
import {
	getDocument,
	InvalidDocumentInputError,
	listDocumentPassages,
	replaceDocumentPassages,
	type DocumentPassageInput,
	type DocumentRevisionResult
} from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';
import {
	addSermonDelivery,
	listSermonDeliveries,
	removeSermonDelivery
} from '$lib/server/repositories/sermon-deliveries';

function requireDocumentId(value: string): string {
	if (!isUuid(value)) error(404, 'Dokument nicht gefunden');
	return value;
}

function displayPassage(row: DocumentPassageInput): string {
	const passage = passageFromDbEndpoints(row);
	return (passage && formatPassage(passage)) || '';
}

function passageInput(row: DocumentPassageInput): DocumentPassageInput {
	return {
		startBookId: row.startBookId,
		startChapter: row.startChapter,
		startVerse: row.startVerse,
		endBookId: row.endBookId,
		endChapter: row.endChapter,
		endVerse: row.endVerse,
		startKey: row.startKey,
		endKey: row.endKey,
		resourceId: row.resourceId ?? null,
		position: row.position
	};
}

function revisionFailure(result: Exclude<DocumentRevisionResult, { ok: true }>) {
	if (result.reason === 'conflict') {
		return fail(409, { error: 'conflict' as const, currentRevision: result.currentRevision });
	}
	if (result.reason === 'invalidResource') {
		return fail(400, { error: 'invalidResource' as const, resourceId: result.resourceId });
	}
	return fail(404, { error: 'notFound' as const });
}

async function ownedEditor(locals: App.Locals, id: string, url: URL) {
	const user = requireDocumentUser(locals.user, url);
	const documentId = requireDocumentId(id);
	const document = await getDocument(getDb(), user.id, documentId);
	if (!document) error(404, 'Dokument nicht gefunden');
	return { user, documentId, document };
}

export async function load({ params, locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const { user, documentId, document } = await ownedEditor(locals, params.id, url);
	const db = getDb();
	const [passageRows, tags, tagTree, bibles, publication, sermonDeliveries] = await Promise.all([
		listDocumentPassages(db, user.id, documentId),
		listDocumentTags(db, user.id, documentId),
		listDocumentTagTree(db, user.id),
		listBibles(db),
		getOwnedDocumentPublication(db, user.id, documentId),
		document.kind === 'sermon' ? listSermonDeliveries(db, user.id, documentId) : []
	]);

	return {
		document,
		passages: passageRows.map((passage) => ({
			...passage,
			reference: displayPassage(passage)
		})),
		tags,
		tagTree,
		bibles,
		publication: publication ?? null,
		sermonDeliveries,
		isAdmin: user.role === 'admin',
		returnTo: safeReturnTo(url.searchParams.get('returnTo'))
	};
}

export const actions = {
	syncTags: async ({ request, params, locals, url }) => {
		const { user, documentId } = await ownedEditor(locals, params.id, url);
		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('revision'));
		if (revision === null) return fail(400, { error: 'revision' as const });
		const paths = String(form.get('tags') ?? '')
			.split(',')
			.map((path) => path.trim())
			.filter(Boolean);

		try {
			const result = await syncDocumentTags(getDb(), user.id, documentId, paths, revision);
			if (!result.ok) return revisionFailure(result);
			return { saved: true, revision: result.revision, tags: result.tags };
		} catch (caught) {
			if (caught instanceof InvalidTagPathError) {
				return fail(400, { error: 'tags' as const });
			}
			throw caught;
		}
	},

	addPassage: async ({ request, params, locals, url }) => {
		const { user, documentId } = await ownedEditor(locals, params.id, url);
		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('revision'));
		if (revision === null) return fail(400, { error: 'revision' as const });
		const reference = String(form.get('passage') ?? form.get('reference') ?? '').trim();
		const parsed = parsePassage(reference);
		const endpoints = parsed && passageToDbEndpoints(parsed);
		if (!endpoints) return fail(400, { error: 'passage' as const });

		const resourceId = String(form.get('resourceId') ?? form.get('resource') ?? '').trim() || null;
		const db = getDb();
		if (resourceId && !(await listBibles(db)).some((bible) => bible.id === resourceId)) {
			return fail(400, { error: 'invalidResource' as const, resourceId });
		}

		const current = await listDocumentPassages(db, user.id, documentId);
		const duplicate = current.some(
			(passage) =>
				passage.startKey === endpoints.startKey &&
				passage.endKey === endpoints.endKey &&
				passage.resourceId === resourceId
		);
		if (duplicate) return fail(400, { error: 'duplicatePassage' as const });

		try {
			const result = await replaceDocumentPassages(
				db,
				user.id,
				documentId,
				[...current.map(passageInput), { ...endpoints, resourceId, position: current.length }],
				revision
			);
			if (!result.ok) return revisionFailure(result);
			return {
				saved: true,
				revision: result.revision,
				passage: { reference: displayPassage(endpoints), resourceId }
			};
		} catch (caught) {
			if (caught instanceof InvalidDocumentInputError) {
				return fail(400, { error: caught.code });
			}
			throw caught;
		}
	},

	removePassage: async ({ request, params, locals, url }) => {
		const { user, documentId } = await ownedEditor(locals, params.id, url);
		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('revision'));
		if (revision === null) return fail(400, { error: 'revision' as const });
		const passageId = String(form.get('passageId') ?? form.get('id') ?? '');
		if (!isUuid(passageId)) return fail(404, { error: 'passageNotFound' as const });

		const db = getDb();
		const current = await listDocumentPassages(db, user.id, documentId);
		if (!current.some((passage) => passage.id === passageId)) {
			return fail(404, { error: 'passageNotFound' as const });
		}
		const kept = current
			.filter((passage) => passage.id !== passageId)
			.map((passage, position) => ({ ...passageInput(passage), position }));
		const result = await replaceDocumentPassages(db, user.id, documentId, kept, revision);
		if (!result.ok) return revisionFailure(result);
		return { saved: true, revision: result.revision, passageId };
	},

	addDelivery: async ({ request, params, locals, url }) => {
		const { user, documentId, document } = await ownedEditor(locals, params.id, url);
		if (document.kind !== 'sermon') return fail(400, { error: 'notSermon' as const });
		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('revision'));
		const date = parseCalendarDate(form.get('date'));
		const location = String(form.get('location') ?? '').trim();
		if (revision === null || !date.ok || !date.value || !location) {
			return fail(400, { error: 'delivery' as const });
		}
		const result = await addSermonDelivery(getDb(), user.id, documentId, revision, {
			date: date.value,
			location
		});
		if (!result.ok) return revisionFailure(result);
		return { saved: true, revision: result.revision, delivery: result.delivery };
	},

	removeDelivery: async ({ request, params, locals, url }) => {
		const { user, documentId, document } = await ownedEditor(locals, params.id, url);
		if (document.kind !== 'sermon') return fail(400, { error: 'notSermon' as const });
		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('revision'));
		const deliveryId = form.get('deliveryId');
		if (revision === null || !isUuid(deliveryId)) {
			return fail(400, { error: 'delivery' as const });
		}
		const result = await removeSermonDelivery(getDb(), user.id, documentId, deliveryId, revision);
		if (!result.ok) return revisionFailure(result);
		return { saved: true, revision: result.revision, deliveryId };
	},

	publish: async ({ request, params, locals, url }) => {
		const {
			user,
			documentId,
			document: initialDocument
		} = await ownedEditor(locals, params.id, url);
		if (user.role !== 'admin') return fail(403, { error: 'forbidden' as const });
		if (initialDocument.kind === 'sermon') {
			return fail(400, { error: 'notArticle' as const });
		}

		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('revision'));
		if (revision === null) return fail(400, { error: 'revision' as const });
		const visibility = String(form.get('visibility') ?? 'public');
		if (!isDocumentVisibility(visibility) || visibility === 'private') {
			return fail(400, { error: 'visibility' as const });
		}

		const rawSlug = String(form.get('slug') ?? '').trim() || initialDocument.title;
		const slug = slugifyArticle(rawSlug);
		const result = await publishArticle(getDb(), user.id, documentId, {
			slug,
			excerpt: normalizeExcerpt(form.get('excerpt')),
			visibility,
			expectedRevision: revision
		});
		if (!result.ok) {
			if (result.reason === 'conflict') {
				return fail(409, {
					error: 'conflict' as const,
					currentRevision: result.currentRevision
				});
			}
			const status = result.reason === 'forbidden' ? 403 : result.reason === 'notFound' ? 404 : 400;
			return fail(status, { error: result.reason });
		}
		return {
			published: true,
			publication: result.publication,
			revision: result.publication.publicationRevision
		};
	},

	unpublish: async ({ params, locals, url }) => {
		const { user, documentId } = await ownedEditor(locals, params.id, url);
		if (user.role !== 'admin') return fail(403, { error: 'forbidden' as const });
		const result = await unpublishArticle(getDb(), user.id, documentId);
		if (!result.ok) {
			return fail(result.reason === 'forbidden' ? 403 : 404, { error: result.reason });
		}
		return { unpublished: true, existed: result.unpublished };
	}
};
