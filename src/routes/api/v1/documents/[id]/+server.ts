import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/api/errors';
import { resolveApiIdentity } from '$lib/server/api/identity';
import { getDb } from '$lib/server/db';
import type { Document } from '$lib/server/db/schema';
import { isUuid } from '$lib/server/documents/application';
import { listDocumentTags } from '$lib/server/repositories/document-tags';
import { getDocument, listDocumentPassages } from '$lib/server/repositories/documents';

/** One owned document working copy. A foreign UUID is deliberately indistinguishable from a miss. */
export async function GET({ locals, params, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });

	const identity = resolveApiIdentity(locals);
	if (identity.scope !== 'personal' || !identity.userId) {
		return apiError(
			403,
			'personal_scope_required',
			'Reading documents needs a signed-in session or a personal-scope API key.'
		);
	}

	if (!isUuid(params.id)) {
		return apiError(404, 'document_not_found', 'No document with this id.');
	}

	const db = getDb();
	const document = await getDocument(db, identity.userId, params.id);
	if (!document) {
		return apiError(404, 'document_not_found', 'No document with this id.');
	}

	const [passages, tags] = await Promise.all([
		listDocumentPassages(db, identity.userId, document.id),
		listDocumentTags(db, identity.userId, document.id)
	]);

	return json({
		...toDocumentSummary(document),
		bodyMarkdown: document.bodyMarkdown,
		bodyHtml: document.bodyHtml,
		passages: passages.map((passage) => ({
			resourceId: passage.resourceId,
			start: {
				book: passage.startBookId,
				chapter: passage.startChapter,
				verse: passage.startVerse
			},
			end: {
				book: passage.endBookId,
				chapter: passage.endChapter,
				verse: passage.endVerse
			},
			position: passage.position
		})),
		tags: tags.map((tag) => tag.path)
	});
}

function toDocumentSummary(document: Document) {
	return {
		id: document.id,
		kind: document.kind,
		title: document.title,
		plainText: document.plainText,
		visibility: document.visibility,
		revision: document.revision,
		source: document.source,
		sourceFilename: document.sourceFilename,
		legacyVerseCommentId: document.legacyVerseCommentId,
		sermonStatus: document.sermonStatus,
		sermonDate: document.sermonDate?.toISOString().slice(0, 10) ?? null,
		sermonSeries: document.sermonSeries,
		deletedAt: document.deletedAt,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt
	};
}
