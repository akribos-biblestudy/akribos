import { formatPassage, parsePassage, MAX_PASSAGE_VERSE } from '$lib/bible/passage';
import {
	formatReference,
	isReferenceInCanon,
	parseReference,
	type VerseRef
} from '$lib/bible/reference';

export function parseContextReference(
	value: string
): { reference: VerseRef; passage: string } | null {
	const passage = parsePassage(value);
	const direct = parseReference(value);
	if (!passage) {
		return direct && isReferenceInCanon(direct)
			? { reference: direct, passage: formatReference(direct) }
			: null;
	}
	const reference: VerseRef =
		direct && isReferenceInCanon(direct)
			? direct
			: {
					book: passage.start.book,
					chapter: passage.start.chapter,
					verse: passage.start.verse,
					...(passage.end.book === passage.start.book &&
					passage.end.chapter === passage.start.chapter &&
					passage.end.verse > passage.start.verse &&
					passage.end.verse < MAX_PASSAGE_VERSE
						? { verseEnd: passage.end.verse }
						: {})
				};
	return { reference, passage: formatPassage(passage) ?? formatReference(reference) };
}

export function contextReferenceFromHref(href: string, origin: string) {
	try {
		const url = new URL(href, origin);
		if (url.origin !== origin) return null;
		const path = decodeURIComponent(url.pathname).replace(/^\/|\/$/g, '');
		return path.includes('/') ? null : parseContextReference(path);
	} catch {
		return null;
	}
}

/** Shared by rendered verses, search cards, imported reference links and editor decorations. */
export function findReferenceContext(target: EventTarget | null, origin: string) {
	if (!(target instanceof Element) || target.closest('input, textarea, select')) return null;
	const selector = '[data-reference], [data-verse-key], .verse-ref, a[href]';
	for (
		let anchor = target.closest<HTMLElement>(selector);
		anchor;
		anchor = anchor.parentElement?.closest<HTMLElement>(selector) ?? null
	) {
		let parsed = anchor.dataset.reference ? parseContextReference(anchor.dataset.reference) : null;
		if (!parsed && anchor.dataset.verseKey) {
			const [book, chapter, verse] = anchor.dataset.verseKey.split(':').map(Number);
			if (book && chapter && verse)
				parsed = parseContextReference(
					formatReference({
						book,
						chapter,
						verse,
						...(anchor.dataset.verseEnd ? { verseEnd: Number(anchor.dataset.verseEnd) } : {})
					})
				);
		}
		if (!parsed && anchor.dataset.book && anchor.dataset.chapter) {
			parsed = parseContextReference(
				formatReference({
					book: Number(anchor.dataset.book),
					chapter: Number(anchor.dataset.chapter),
					...(anchor.dataset.verse ? { verse: Number(anchor.dataset.verse) } : {}),
					...(anchor.dataset.verseEnd ? { verseEnd: Number(anchor.dataset.verseEnd) } : {})
				})
			);
		}
		if (!parsed && anchor instanceof HTMLAnchorElement)
			parsed = contextReferenceFromHref(anchor.href, origin);
		if (parsed) {
			const source = target.closest<HTMLElement>('[data-bible-id], [data-resource-id]');
			return {
				...parsed,
				anchor,
				resourceId: source?.dataset.bibleId ?? source?.dataset.resourceId ?? null
			};
		}
	}
	return null;
}
