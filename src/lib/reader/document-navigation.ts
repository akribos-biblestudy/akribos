import type { VerseRef } from '$lib/bible/reference';

/** Root-layout context for a client-side handoff from a document to the Reader. */
export const DOCUMENT_READER_NAVIGATION = Symbol('document-reader-navigation');
export type DocumentReaderNavigation = {
	pending: { userId: string; documentId: string; reference?: VerseRef } | null;
};

export const READER_DOCUMENT_SESSION_KEY = 'reader-notes-sidecar-document';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Only an owner-scoped id is retained for this browser tab; the API rechecks access on every load. */
export function readReaderDocument(
	userId: string,
	storage?: Pick<Storage, 'getItem'>
): string | null {
	try {
		const value = JSON.parse(
			(storage ?? window.sessionStorage).getItem(READER_DOCUMENT_SESSION_KEY) ?? 'null'
		);
		return value?.userId === userId &&
			typeof value.documentId === 'string' &&
			UUID.test(value.documentId)
			? value.documentId
			: null;
	} catch {
		return null;
	}
}

export function rememberReaderDocument(
	userId: string,
	documentId: string | null,
	storage?: Pick<Storage, 'setItem' | 'removeItem'>
): void {
	try {
		const target = storage ?? window.sessionStorage;
		if (documentId && UUID.test(documentId)) {
			target.setItem(READER_DOCUMENT_SESSION_KEY, JSON.stringify({ userId, documentId }));
		} else {
			target.removeItem(READER_DOCUMENT_SESSION_KEY);
		}
	} catch {
		// Navigation and editing remain available when the browser disables session storage.
	}
}
