import { error } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { verses } from '$lib/server/db/schema';
import { strongAssignmentReviews } from '$lib/server/db/strong-review-schema';
import { listReaderResources } from '$lib/server/repositories/resources';
import { canReview } from '$lib/server/strong-review/repository';
import { assignmentPage, openAssignments } from '$lib/server/strong-review/open-assignments';

const VERSE_BATCH_SIZE = 500;

export async function load({ locals, url, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDb();
	if (!locals.user || !(await canReview(db, locals.user))) error(403, 'Keine Prüfberechtigung.');
	const viewerId = locals.user.id;
	const available = await listReaderResources(db, viewerId);
	const bibles = available.filter((item) => item.kind === 'bible' && item.hasStrongs);
	const lexicons = available.filter((item) => item.kind === 'lexicon');
	const requested = url.searchParams.get('resource');
	const resourceId = requested ? bibles.find((item) => item.id === requested)?.id : bibles[0]?.id;
	if (requested && !resourceId) error(400, 'Die Übersetzung ist nicht verfügbar.');
	const requestedBook = Number(url.searchParams.get('book') ?? 0);
	const book =
		Number.isSafeInteger(requestedBook) && requestedBook >= 1 && requestedBook <= 66
			? requestedBook
			: 0;
	const rawPage = Number(url.searchParams.get('page') ?? 1);
	const requestedPage =
		Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 100000 ? rawPage : 1;
	if (!resourceId)
		return { bibles, lexicons, resourceId: null, book, page: 1, pages: 1, total: 0, items: [] };

	// Paginate actual assignments only after applying the same note and fingerprint rules as the
	// Reader. A verse may contain multiple uncertain words or no remaining open assignments.
	// Keyset batches and an accumulator keep memory bounded even for a complete Bible; read-only
	// repeatable-read keeps the count and the displayed page consistent during concurrent reviews.
	const result = await db.transaction(
		async (tx) => {
			const page = assignmentPage(requestedPage);
			let cursor: { bookId: number; chapter: number; verse: number } | undefined;
			while (true) {
				const rows = await tx
					.select({
						bookId: verses.bookId,
						chapter: verses.chapter,
						verse: verses.verse,
						segments: verses.segments
					})
					.from(verses)
					.where(
						and(
							eq(verses.resourceId, resourceId),
							book ? eq(verses.bookId, book) : undefined,
							cursor
								? sql`(${verses.bookId}, ${verses.chapter}, ${verses.verse}) > (${cursor.bookId}, ${cursor.chapter}, ${cursor.verse})`
								: undefined,
							// Broad prefilter only: whitespace, marker and word adjacency are checked in JS.
							sql`exists (select 1 from jsonb_path_query(${verses.segments}, '$.** ? (@.kind == "note")') as note where position('Wortzuordnung' in coalesce(note->>'text', '')) > 0)`
						)
					)
					.orderBy(asc(verses.bookId), asc(verses.chapter), asc(verses.verse))
					.limit(VERSE_BATCH_SIZE);
				if (!rows.length) break;
				const first = rows[0]!;
				const last = rows[rows.length - 1]!;
				const reviews = await tx
					.select({
						bookId: strongAssignmentReviews.bookId,
						chapter: strongAssignmentReviews.chapter,
						verse: strongAssignmentReviews.verse,
						wordPosition: strongAssignmentReviews.wordPosition,
						strong: strongAssignmentReviews.strong,
						word: strongAssignmentReviews.word,
						verseFingerprint: strongAssignmentReviews.verseFingerprint,
						approvedAt: strongAssignmentReviews.approvedAt,
						authorId: strongAssignmentReviews.authorId,
						decision: strongAssignmentReviews.decision
					})
					.from(strongAssignmentReviews)
					.where(
						and(
							eq(strongAssignmentReviews.resourceId, resourceId),
							sql`(${strongAssignmentReviews.bookId}, ${strongAssignmentReviews.chapter}, ${strongAssignmentReviews.verse}) >= (${first.bookId}, ${first.chapter}, ${first.verse})`,
							sql`(${strongAssignmentReviews.bookId}, ${strongAssignmentReviews.chapter}, ${strongAssignmentReviews.verse}) <= (${last.bookId}, ${last.chapter}, ${last.verse})`
						)
					);
				page.add(openAssignments(resourceId, viewerId, rows, reviews));
				if (rows.length < VERSE_BATCH_SIZE) break;
				cursor = last;
			}
			return page.result();
		},
		{ isolationLevel: 'repeatable read', accessMode: 'read only' }
	);
	return { bibles, lexicons, resourceId, book, ...result };
}
