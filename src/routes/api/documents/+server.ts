import { json } from '@sveltejs/kit';
import { isReferenceInCanon, parseReference } from '$lib/bible/reference';
import { MAX_PASSAGE_VERSE, parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import { isDocumentKind } from '$lib/notes/documents';
import { MAX_DOCUMENT_QUERY_LENGTH, setPrivateNoStore } from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	InvalidTagPathError,
	normalizeTagPath,
	listDocumentTagTreeWithCounts
} from '$lib/server/repositories/document-tags';
import {
	listDocumentLibraryIndex,
	listDocumentAnchorReferenceIndex,
	listDocumentLibrarySummaries
} from '$lib/server/repositories/document-reference-index';
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
		resourceId ? listBibles(db, locals.user?.id) : Promise.resolve([])
	]);
	if (resourceId && !bibles.some((bible) => bible.id === resourceId)) {
		return responseError(400, 'resource');
	}

	let normalizedTagPath: string | undefined;
	try {
		if (tag) normalizedTagPath = normalizeTagPath(tag).normalizedPath;
	} catch (caught) {
		if (caught instanceof InvalidTagPathError) return responseError(400, 'tag');
		throw caught;
	}
	let endpoints: ReturnType<typeof passageToDbEndpoints> = null;
	if (passageText) {
		const reference = parseReference(passageText);
		const passage =
			parsePassage(passageText) ??
			(reference && isReferenceInCanon(reference) && reference.verse === undefined
				? { start: { ...reference, verse: 1 }, end: { ...reference, verse: MAX_PASSAGE_VERSE } }
				: null);
		endpoints = passage && passageToDbEndpoints(passage);
		if (!endpoints) return responseError(400, 'passage');
	}
	let rows = await listDocumentLibraryIndex(db, locals.user.id, {
		kind,
		query: query || undefined,
		normalizedTagPath,
		order: 'updated'
	});
	if (endpoints) {
		const range = endpoints;
		const anchors = await listDocumentAnchorReferenceIndex(db, locals.user.id, { kind });
		const overlappingIds = new Set(
			anchors
				.filter(
					(anchor) =>
						anchor.startKey <= range.endKey &&
						anchor.endKey >= range.startKey &&
						(!resourceId || anchor.resourceId === null || anchor.resourceId === resourceId)
				)
				.map((anchor) => anchor.documentId)
		);
		rows = rows.filter(
			(document) =>
				overlappingIds.has(document.id) ||
				document.ranges.some(
					(reference) => reference.startKey <= range.endKey && reference.endKey >= range.startKey
				)
		);
	}

	const truncated = rows.length > READER_LIBRARY_LIMIT;
	const ids = rows.slice(0, READER_LIBRARY_LIMIT).map((row) => row.id);
	const summaries = new Map(
		(await listDocumentLibrarySummaries(db, locals.user.id, ids)).map((row) => [row.id, row])
	);
	return json({
		documents: ids.flatMap((id) => {
			const document = summaries.get(id);
			return document
				? [
						{
							id: document.id,
							kind: document.kind,
							title: document.title,
							excerpt: excerpt(document.plainText),
							source: document.source,
							updatedAt: document.updatedAt
						}
					]
				: [];
		}),
		tags: tags
			.filter((tagEntry) => tagEntry.documentCount > 0)
			.map((tagEntry) => ({ id: tagEntry.id, path: tagEntry.path })),
		truncated
	});
}
