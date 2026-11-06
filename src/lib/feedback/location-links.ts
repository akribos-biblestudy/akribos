import { findBibleReferences } from '$lib/bible/link-references';
import { referencePath, type VerseRef } from '$lib/bible/reference';
import { normalizeStrongId } from '$lib/bible/strong';
import { encodeReaderUrlState } from '$lib/reader/url-state';
import type { ReaderWorkspace } from '$lib/reader/workspace';

export type FeedbackLocationResource = { id: string; kind: string; language?: string };
/** Offsets are UTF-16 positions suitable for slicing the original JavaScript string. */
export type FeedbackLocationLink = { label: string; href: string; from: number; to: number };

/** Build a normal Reader state: server-side resource access checks still apply on navigation. */
function resourceLink(resourceId: string, reference: VerseRef, lookup: string | null): string {
	const tab = {
		id: 'feedback-tab',
		resourceId,
		linkSet: null,
		reference,
		lookup,
		studyContext: null
	};
	const workspace: ReaderWorkspace = {
		version: 1,
		layout: 'single',
		tiles: [{ id: 'feedback-tile', tabs: [tab], activeTabId: tab.id }],
		focusedTileId: 'feedback-tile',
		layoutSizes: {}
	};
	return `${referencePath(reference)}?${encodeReaderUrlState(workspace)}`;
}

/** Recognise scripture references and explicit Greek/Hebrew Strong IDs in free-text locations.
 * The original input is never converted into HTML or used as a destination URL. */
export function feedbackLocationLinks(
	location: string,
	resource?: FeedbackLocationResource | null
): FeedbackLocationLink[] {
	const matches: FeedbackLocationLink[] = [];
	const references = findBibleReferences(location);
	for (const match of references) {
		matches.push({
			from: match.from,
			to: match.to,
			label: match.label,
			href:
				resource && ['bible', 'commentary'].includes(resource.kind)
					? resourceLink(resource.id, match.reference, null)
					: match.href
		});
	}
	const strongPattern = /(?<![\p{L}\p{N}])([GH]\s*\d{1,5})(?![\p{L}\p{N}])/giu;
	for (const match of location.matchAll(strongPattern)) {
		const strong = normalizeStrongId(match[1] ?? '');
		if (!strong) continue;
		const reference = references[0]?.reference ?? {
			book: strong.startsWith('H') ? 1 : 40,
			chapter: 1
		};
		matches.push({
			from: match.index,
			to: match.index + match[0].length,
			label: match[0],
			href:
				resource?.kind === 'lexicon' ? resourceLink(resource.id, reference, strong) : `/${strong}`
		});
	}
	// A bare number is unambiguous only when it is explicitly called a Strong number and the
	// selected dictionary supplies the source language. Do not infer a language from a Bible.
	const language = resource?.kind === 'lexicon' ? resource.language?.toLowerCase() : undefined;
	const prefix =
		language === 'grc' || language === 'el'
			? 'G'
			: language === 'hbo' || language === 'he'
				? 'H'
				: null;
	if (resource && prefix) {
		const bareStrong =
			/(?<![\p{L}\p{N}])strong(?:s|[-\s]*(?:nummer|nr\.?))?\s*[:#]?\s*(\d{1,5})(?![\p{L}\p{N}])/giu;
		for (const match of location.matchAll(bareStrong)) {
			const strong = normalizeStrongId(`${prefix}${match[1]}`);
			if (!strong) continue;
			const reference = references[0]?.reference ?? { book: prefix === 'H' ? 1 : 40, chapter: 1 };
			matches.push({
				from: match.index,
				to: match.index + match[0].length,
				label: match[0],
				href: resourceLink(resource.id, reference, strong)
			});
		}
	}
	// Keep matches ordered and non-overlapping for the caller rendering text slices. If two
	// parsers recognise the same start, retain the more specific (longer) match.
	matches.sort((left, right) => left.from - right.from || right.to - left.to);
	let cursor = 0;
	return matches.filter((match) => {
		if (match.from < cursor) return false;
		cursor = match.to;
		return true;
	});
}
