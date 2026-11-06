import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeStrongId } from '../../bible/strong.ts';
import { STRONG_ASSIGNMENT_NOTE_TEXT } from '../../bible/strong-assignment.ts';
import { isContainerSegment, taggedWordSegments, type VerseSegment } from '../../bible/segments.ts';

export const USX_REVIEW_MANIFEST_MAX_BYTES = 128 * 1024 * 1024;
export const USX_REVIEW_MANIFEST_MAX_REVIEWS = 500_000;
export const USX_BOOK_MAX_BYTES = 32 * 1024 * 1024;
export const USX_TOTAL_MAX_BYTES = 256 * 1024 * 1024;
export const USX_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;

export const usxDecisionSchema = z
	.object({
		bookId: z.number().int().min(1).max(66),
		chapter: z.number().int().min(1).max(200),
		verse: z.number().int().min(1).max(250),
		wordPosition: z.number().int().min(0).max(100000),
		strong: z
			.string()
			.max(6)
			.refine((value) => normalizeStrongId(value) === value),
		word: z.string().min(1).max(20000),
		decision: z.enum(['confirmed', 'incorrect']),
		approvedAt: z.iso.datetime()
	})
	.strict();

export const usxReviewManifestSchema = z
	.object({
		format: z.literal('akribos-usx-reviews'),
		version: z.literal(1),
		resource: z.string().min(1).max(200),
		books: z
			.array(
				z
					.object({ name: z.string().min(1).max(512), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
					.strict()
			)
			.min(1)
			.max(66),
		reviews: z.array(usxDecisionSchema).max(USX_REVIEW_MANIFEST_MAX_REVIEWS)
	})
	.strict();

export type UsxDecision = z.infer<typeof usxDecisionSchema>;
export const usxHash = (content: string) =>
	createHash('sha256').update(content, 'utf8').digest('hex');
/** PostgreSQL jsonb may reorder object keys; compare the semantic structure, not key order. */
export const canonicalVerseHash = (segments: readonly VerseSegment[]) =>
	usxHash(
		JSON.stringify(segments, (_key, value: unknown) =>
			value && typeof value === 'object' && !Array.isArray(value)
				? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
				: value
		)
	);
export const decisionNote = (review: Pick<UsxDecision, 'strong' | 'decision'>) =>
	review.decision === 'confirmed'
		? `Akribos: Strong-Zuordnung ${review.strong} fachlich bestätigt.`
		: `Akribos: Strong-Zuordnung ${review.strong} fachlich als fehlerhaft markiert.`;

/** Restore the canonical uncertain-word marker while removing only manifest-bound notes.
 * Every decision must match its exact word and Strong ID after parsing. */
export function restoreReviewMarkers(
	segments: VerseSegment[],
	reviews: UsxDecision[]
): VerseSegment[] {
	const words = taggedWordSegments(segments);
	const byWord = new Map<object, UsxDecision[]>();
	for (const review of reviews) {
		const word = words[review.wordPosition];
		if (
			!word ||
			word.text !== review.word ||
			!(word.strongs ?? [word.strong]).includes(review.strong)
		)
			throw new Error('Prüfung passt nicht zur angegebenen Wortposition.');
		const group = byWord.get(word) ?? [];
		group.push(review);
		byWord.set(word, group);
	}
	function transform(input: readonly VerseSegment[]): VerseSegment[] {
		const output: VerseSegment[] = [];
		for (let i = 0; i < input.length; i++) {
			const segment = input[i]!;
			if (isContainerSegment(segment)) {
				output.push({ ...segment, children: transform(segment.children) });
				continue;
			}
			output.push(segment);
			if (typeof segment === 'string' || segment.kind !== 'w') continue;
			const decisions = byWord.get(segment);
			if (!decisions) continue;
			for (const decision of decisions) {
				const note = input[++i];
				if (
					!note ||
					typeof note === 'string' ||
					note.kind !== 'note' ||
					note.marker !== '' ||
					note.text !== decisionNote(decision)
				)
					throw new Error('Prüfungshinweis stimmt nicht mit dem Manifest überein.');
			}
			output.push({ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT });
			// The exported generic warning remains for partially reviewed multi-Strong words.
			let nextIndex = i + 1;
			while (typeof input[nextIndex] === 'string' && !(input[nextIndex] as string).trim())
				nextIndex++;
			const next = input[nextIndex];
			if (
				next &&
				typeof next !== 'string' &&
				next.kind === 'note' &&
				next.marker.trim() === '' &&
				next.text.trim().replace(/\s+/gu, ' ') === STRONG_ASSIGNMENT_NOTE_TEXT
			) {
				for (let k = i + 1; k < nextIndex; k++) output.push(input[k]!);
				i = nextIndex;
			}
		}
		return output;
	}
	return transform(segments);
}
