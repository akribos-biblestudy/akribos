export const READER_NOTES_SIDECAR_STORAGE_KEY = 'reader-notes-sidecar-open';
export const READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY = 'reader-notes-sidecar-width';
export const READER_NOTES_SIDECAR_EVENT = 'akribos:reader-notes-sidecar';
export const DEFAULT_READER_NOTES_SIDECAR_WIDTH = 416;
export const MIN_READER_NOTES_SIDECAR_WIDTH = 320;
export const MAX_READER_NOTES_SIDECAR_WIDTH = 720;

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

/** Reads a harmless device-local width preference; malformed and extreme values use the default. */
export function readReaderNotesSidecarWidth(storage?: Pick<Storage, 'getItem'>): number {
	try {
		const raw = (storage ?? window.localStorage).getItem(READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY);
		const value = raw === null ? Number.NaN : Number(raw);
		return Number.isFinite(value) &&
			value >= MIN_READER_NOTES_SIDECAR_WIDTH &&
			value <= MAX_READER_NOTES_SIDECAR_WIDTH
			? value
			: DEFAULT_READER_NOTES_SIDECAR_WIDTH;
	} catch {
		return DEFAULT_READER_NOTES_SIDECAR_WIDTH;
	}
}

/** Width is the only additional sidecar state persisted; document ids remain memory-only. */
export function setReaderNotesSidecarWidth(
	width: number,
	storage?: Pick<Storage, 'setItem'>
): void {
	if (
		!Number.isFinite(width) ||
		width < MIN_READER_NOTES_SIDECAR_WIDTH ||
		width > MAX_READER_NOTES_SIDECAR_WIDTH
	) {
		return;
	}
	try {
		(storage ?? window.localStorage).setItem(
			READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY,
			String(Math.round(width))
		);
	} catch {
		// Resizing remains functional for this session when localStorage is unavailable.
	}
}
