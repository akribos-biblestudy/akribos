import type { VerseRef } from '$lib/bible/reference';
import type { ReaderLinkSet } from './workspace';

export type ReferenceLinkSet = Exclude<ReaderLinkSet, null>;
export const REFERENCE_NAVIGATION = Symbol('reader-reference-navigation');
export type ReferenceNavigation = {
	returnTo: { url: string; userId: string | null } | null;
	open: ((reference: VerseRef, linkSet: ReferenceLinkSet) => Promise<boolean>) | null;
	pending: { reference: VerseRef; linkSet: ReferenceLinkSet } | null;
};
