import { json } from '@sveltejs/kit';
import {
	isDocumentKind,
	isDocumentVisibility,
	type DocumentKind,
	type DocumentVisibility
} from '$lib/notes/documents';
import { apiError } from '$lib/server/api/errors';
import { resolveApiIdentity } from '$lib/server/api/identity';
import { getDb } from '$lib/server/db';
import type { Document } from '$lib/server/db/schema';
import { listDocuments, type ListDocumentFilters } from '$lib/server/repositories/documents';

const DELETED_FILTERS = ['exclude', 'only', 'include'] as const;
type DeletedFilter = (typeof DELETED_FILTERS)[number];

/** The caller's private document working copies, never public publication snapshots. */
export async function GET({ locals, setHeaders, url }) {
	setHeaders({ 'cache-control': 'private, no-store' });

	const identity = resolveApiIdentity(locals);
	if (identity.scope !== 'personal' || !identity.userId) {
		return apiError(
			403,
			'personal_scope_required',
			'Reading documents needs a signed-in session or a personal-scope API key.'
		);
	}

	const kind = url.searchParams.get('kind')?.trim() || undefined;
	if (kind && !isDocumentKind(kind)) {
		return invalidFilter('kind', kind, 'note or sermon');
	}

	const visibility = url.searchParams.get('visibility')?.trim() || undefined;
	if (visibility && !isDocumentVisibility(visibility)) {
		return invalidFilter('visibility', visibility, 'private, unlisted, or public');
	}

	const deleted = url.searchParams.get('deleted')?.trim() || undefined;
	if (deleted && !isDeletedFilter(deleted)) {
		return invalidFilter('deleted', deleted, 'exclude, only, or include');
	}

	const filters: ListDocumentFilters = {
		kind: kind as DocumentKind | undefined,
		visibility: visibility as DocumentVisibility | undefined,
		query: url.searchParams.get('q')?.trim() || undefined,
		deleted: deleted as DeletedFilter | undefined
	};
	const documents = await listDocuments(getDb(), identity.userId, filters);

	return json({ documents: documents.map(toDocumentSummary) });
}

function isDeletedFilter(value: string): value is DeletedFilter {
	return (DELETED_FILTERS as readonly string[]).includes(value);
}

function invalidFilter(name: string, value: string, expected: string): Response {
	return apiError(
		400,
		'invalid_document_filter',
		`The "${name}" filter value "${value}" must be ${expected}.`
	);
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
		sermonFormat: document.sermonFormat,
		deletedAt: document.deletedAt,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt
	};
}
