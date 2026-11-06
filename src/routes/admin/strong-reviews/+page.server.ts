import { error, fail } from '@sveltejs/kit';
import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { resources, users, verses } from '$lib/server/db/schema';
import { strongAssignmentReviews } from '$lib/server/db/strong-review-schema';
import { listReaderResources, readableResourceCondition } from '$lib/server/repositories/resources';
import {
	currentVerse,
	fingerprint,
	matchesCurrentVerse
} from '$lib/server/strong-review/repository';

const PAGE_SIZE = 25;

export async function load({ locals, url, setHeaders }) {
	if (locals.user?.role !== 'admin') error(403);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDb();
	const available = await listReaderResources(db, locals.user.id);
	const readableBibles = new Set(
		available.filter((resource) => resource.kind === 'bible').map((resource) => resource.id)
	);
	const lexicons = available
		.filter((resource) => resource.kind === 'lexicon')
		.map(({ id, name }) => ({ id, name }));
	const requestedFilter = url.searchParams.get('filter');
	const filter =
		requestedFilter === 'approved' || requestedFilter === 'all' ? requestedFilter : 'pending';
	const condition =
		filter === 'pending'
			? isNull(strongAssignmentReviews.approvedAt)
			: filter === 'approved'
				? isNotNull(strongAssignmentReviews.approvedAt)
				: undefined;
	const [{ total } = { total: 0 }] = await db
		.select({ total: count() })
		.from(strongAssignmentReviews)
		.where(condition);
	const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page =
		Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
	const rows = await db
		.select({
			review: strongAssignmentReviews,
			resource: resources.name,
			author: users.displayName,
			email: users.email,
			segments: verses.segments
		})
		.from(strongAssignmentReviews)
		.innerJoin(resources, eq(resources.id, strongAssignmentReviews.resourceId))
		.leftJoin(users, eq(users.id, strongAssignmentReviews.authorId))
		.leftJoin(
			verses,
			and(
				eq(verses.resourceId, strongAssignmentReviews.resourceId),
				readableResourceCondition(locals.user.id),
				eq(verses.bookId, strongAssignmentReviews.bookId),
				eq(verses.chapter, strongAssignmentReviews.chapter),
				eq(verses.verse, strongAssignmentReviews.verse)
			)
		)
		.where(condition)
		.orderBy(desc(strongAssignmentReviews.createdAt), desc(strongAssignmentReviews.id))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);
	return {
		filter,
		page,
		pages,
		total,
		lexicons,
		reviews: rows.map(({ segments, ...row }) => {
			const readable = readableBibles.has(row.review.resourceId);
			return {
				...row,
				review: readable ? row.review : { ...row.review, word: '' },
				readable,
				segments: readable ? segments : null,
				current:
					!!segments &&
					readable &&
					fingerprint(segments) === row.review.verseFingerprint &&
					matchesCurrentVerse(row.review, segments)
			};
		})
	};
}
export const actions = {
	approve: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);
		const id = String((await request.formData()).get('id') ?? '');
		if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, { error: 'Ungültige Prüfung.' });
		const db = getDb();
		const [review] = await db
			.select()
			.from(strongAssignmentReviews)
			.where(eq(strongAssignmentReviews.id, id))
			.limit(1);
		if (!review || review.approvedAt)
			return fail(409, { error: 'Die Prüfung ist nicht mehr offen.' });
		if (
			!(await listReaderResources(db, locals.user.id)).some(
				(resource) => resource.kind === 'bible' && resource.id === review.resourceId
			)
		)
			return fail(403, { error: 'Für diese Bibel ist eine Lesefreigabe erforderlich.' });
		const verse = await currentVerse(db, review);
		if (
			!verse ||
			fingerprint(verse.segments) !== review.verseFingerprint ||
			!matchesCurrentVerse(review, verse.segments)
		)
			return fail(409, {
				error: 'Die Bibelstelle wurde seit der Prüfung geändert. Sie muss erneut geprüft werden.'
			});
		const [updated] = await db
			.update(strongAssignmentReviews)
			.set({ approvedAt: new Date(), approvedBy: locals.user!.id, updatedAt: new Date() })
			.where(
				and(
					eq(strongAssignmentReviews.id, id),
					isNull(strongAssignmentReviews.approvedAt),
					eq(strongAssignmentReviews.verseFingerprint, review.verseFingerprint),
					eq(strongAssignmentReviews.decision, review.decision),
					review.authorId
						? eq(strongAssignmentReviews.authorId, review.authorId)
						: isNull(strongAssignmentReviews.authorId)
				)
			)
			.returning({ id: strongAssignmentReviews.id });
		if (!updated) return fail(409, { error: 'Die Prüfung wurde zwischenzeitlich geändert.' });
		return { saved: true };
	}
};
