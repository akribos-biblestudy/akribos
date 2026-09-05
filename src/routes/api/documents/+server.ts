import { json } from '@sveltejs/kit';
import { parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import { isDocumentKind } from '$lib/notes/documents';
import { documentBodyOverlapsPassage } from '$lib/notes/document-markdown';
import { MAX_DOCUMENT_QUERY_LENGTH, setPrivateNoStore } from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	InvalidTagPathError,
	listDocumentsByTag,
	listDocumentTagTreeWithCounts
} from '$lib/server/repositories/document-tags';
import { findDocumentsOverlappingPassage, listDocuments } from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';

const READER_LIBRARY_LIMIT = 100;
const READER_EXCERPT_LENGTH = 180;

function responseError(status: number, error: string) {
	return json({ error }, { status });
}

function excerpt(value: string): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized.length > READER_EXCERPT_LENGTH
		? `${normalized.slice(0, READER_EXCERPT_LENGTH).trimEnd()}…`
		: normalized;
}

/**
 * Owner-only document summaries for the Reader sidecar. Complete private bodies stay behind the
 * single-document endpoint and the result is bounded even for very large personal libraries.
 */
export async function GET({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	if (!locals.user) return responseError(401, 'authenticationRequired');

	const query = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_DOCUMENT_QUERY_LENGTH);
	const rawKind = (url.searchParams.get('kind') ?? '').trim();
	if (rawKind && !isDocumentKind(rawKind)) return responseError(400, 'kind');
	const kind = rawKind && isDocumentKind(rawKind) ? rawKind : undefined;
	const tag = (url.searchParams.get('tag') ?? '').trim();
	const passageText = (url.searchParams.get('passage') ?? '').trim();
	const resourceId = (url.searchParams.get('resource') ?? '').trim() || undefined;

	const db = getDb();
	const [tags, bibles] = await Promise.all([
		listDocumentTagTreeWithCounts(db, locals.user.id),
		resourceId ? listBibles(db) : Promise.resolve([])
	]);
	if (resourceId && !bibles.some((bible) => bible.id === resourceId)) {
		return responseError(400, 'resource');
	}

	let rows: Awaited<ReturnType<typeof listDocuments>>;
	try {
		rows = tag
			? await listDocumentsByTag(db, locals.user.id, tag, { kind, query: query || undefined })
			: await listDocuments(db, locals.user.id, { kind, query: query || undefined });
	} catch (caught) {
		if (caught instanceof InvalidTagPathError) return responseError(400, 'tag');
		throw caught;
	}

	if (passageText) {
		const passage = parsePassage(passageText);
		const endpoints = passage && passageToDbEndpoints(passage);
		if (!endpoints) return responseError(400, 'passage');
		const overlapping = await findDocumentsOverlappingPassage(db, locals.user.id, {
			startKey: endpoints.startKey,
			endKey: endpoints.endKey,
			resourceId,
			kind
		});
		const overlappingIds = new Set(overlapping.map((document) => document.id));
		rows = rows.filter(
			(document) =>
				overlappingIds.has(document.id) || documentBodyOverlapsPassage(document.bodyHtml, endpoints)
		);
	}

	const truncated = rows.length > READER_LIBRARY_LIMIT;
	return json({
		documents: rows.slice(0, READER_LIBRARY_LIMIT).map((document) => ({
			id: document.id,
			kind: document.kind,
			title: document.title,
			excerpt: excerpt(document.plainText),
			source: document.source,
			updatedAt: document.updatedAt
		})),
		tags: tags
			.filter((tagEntry) => tagEntry.documentCount > 0)
			.map((tagEntry) => ({ id: tagEntry.id, path: tagEntry.path })),
		truncated
	});
}
