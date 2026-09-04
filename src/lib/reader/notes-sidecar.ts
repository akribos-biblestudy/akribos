export const READER_NOTES_SIDECAR_STORAGE_KEY = 'reader-notes-sidecar-open';
export const READER_NOTES_SIDECAR_EVENT = 'akribos:reader-notes-sidecar';

export type ReaderNotesSidecarEvent = CustomEvent<{ open: boolean }>;

/** The sidecar preference is device-local. A private document id is deliberately never persisted. */
export function readReaderNotesSidecarOpen(storage?: Pick<Storage, 'getItem'>): boolean {
	try {
		return (storage ?? window.localStorage).getItem(READER_NOTES_SIDECAR_STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

/** Keeps the header menu and Reader page in sync without adding private state to Reader URLs. */
export function setReaderNotesSidecarOpen(
	open: boolean,
	storage?: Pick<Storage, 'setItem'>,
	eventTarget?: Pick<Window, 'dispatchEvent'>
): void {
	try {
		(storage ?? window.localStorage).setItem(READER_NOTES_SIDECAR_STORAGE_KEY, open ? '1' : '0');
	} catch {
		// Some embedded/private-mode browsers expose localStorage but reject access. The event still
		// updates both mounted controls for the current session.
	}
	(eventTarget ?? window).dispatchEvent(
		new CustomEvent<ReaderNotesSidecarEvent['detail']>(READER_NOTES_SIDECAR_EVENT, {
			detail: { open }
		})
	);
}
