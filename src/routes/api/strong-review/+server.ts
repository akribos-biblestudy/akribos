import { error, json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { normalizeStrongId } from '$lib/bible/strong';
import { normalizeWordPosition } from '$lib/bible/strong-assignment';
import { getDb } from '$lib/server/db';
import { readWorkspaceJson } from '$lib/server/saved-reader-workspaces';
import { isLocalReaderRequest } from '$lib/server/app/reader-mode';
import { strongAssignmentReviews } from '$lib/server/db/strong-review-schema';
import { listReaderResources } from '$lib/server/repositories/resources';
import {
	canReview,
	currentVerse,
	deleteOwnPending,
	fingerprint,
	matchesCurrentVerse,
	occurrenceCondition,
	type ReviewLocation
} from '$lib/server/strong-review/repository';

export async function POST({ request, locals, setHeaders, url }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	const origin = request.headers.get('origin');
	if (
		(origin && origin !== url.origin) ||
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		isLocalReaderRequest(request)
	)
		error(403, 'Ungültiger Ursprung');
	const db = getDb();
	if (!locals.user || !(await canReview(db, locals.user))) error(403, 'Keine Prüfberechtigung');
	const body = await readWorkspaceJson(request);
	if (!body || typeof body !== 'object' || Array.isArray(body)) error(400, 'Ungültige Eingabe');
	const input = body as Record<string, unknown>;
	const resourceId = typeof input.resourceId === 'string' ? input.resourceId : '';
	const strong = typeof input.strong === 'string' ? normalizeStrongId(input.strong) : null;
	const wordPosition = normalizeWordPosition(input.wordPosition);
	const word = typeof input.word === 'string' ? input.word.trim().slice(0, 200) : '';
	const integers = [input.bookId, input.chapter, input.verse];
	if (
		!strong ||
		wordPosition === undefined ||
		!word ||
		!integers.every(
			(value) =>
				typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 250
		)
	)
		error(400, 'Ungültige Stelle');
	const location: ReviewLocation = {
		resourceId,
		strong,
		word,
		wordPosition,
		bookId: input.bookId as number,
		chapter: input.chapter as number,
		verse: input.verse as number
	};
	const available = await listReaderResources(db, locals.user.id);
	if (!available.some((resource) => resource.id === resourceId && resource.kind === 'bible'))
		error(403, 'Übersetzung nicht verfügbar');
	const verse = await currentVerse(db, location);
	if (!verse || !matchesCurrentVerse(location, verse.segments))
		error(409, 'Die Zuordnung ist nicht mehr aktuell');
	const [existing] = await db
		.select()
		.from(strongAssignmentReviews)
		.where(occurrenceCondition(location))
		.limit(1);
	if (input.decision === 'withdraw') {
		if (!existing || !(await deleteOwnPending(db, existing.id, locals.user.id)).length)
			error(409, 'Die Prüfung kann nicht zurückgezogen werden');
		return json({ saved: true });
	}
	if (input.decision !== 'confirmed' && input.decision !== 'incorrect')
		error(400, 'Ungültige Entscheidung');
	const hash = fingerprint(verse.segments);
	if (existing) {
		if (
			existing.verseFingerprint === hash &&
			(existing.approvedAt || existing.authorId !== locals.user.id)
		)
			error(409, 'Für diese Zuordnung liegt bereits eine Prüfung vor');
		const updated = await db
			.update(strongAssignmentReviews)
			.set({
				decision: input.decision,
				authorId: locals.user.id,
				word,
				verseFingerprint: hash,
				approvedAt: null,
				approvedBy: null,
				updatedAt: new Date()
			})
			.where(
				and(
					eq(strongAssignmentReviews.id, existing.id),
					eq(strongAssignmentReviews.verseFingerprint, existing.verseFingerprint),
					existing.verseFingerprint === hash
						? isNull(strongAssignmentReviews.approvedAt)
						: undefined
				)
			)
			.returning({ id: strongAssignmentReviews.id });
		if (!updated.length) error(409, 'Die Prüfung wurde zwischenzeitlich geändert');
	} else {
		const inserted = await db
			.insert(strongAssignmentReviews)
			.values({
				...location,
				decision: input.decision,
				authorId: locals.user.id,
				verseFingerprint: hash
			})
			.onConflictDoNothing()
			.returning({ id: strongAssignmentReviews.id });
		if (!inserted.length) error(409, 'Für diese Zuordnung liegt bereits eine Prüfung vor');
	}
	return json({ saved: true });
}
