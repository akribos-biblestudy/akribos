import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_READER_NOTES_SIDECAR_WIDTH,
	MAX_READER_NOTES_SIDECAR_WIDTH,
	MIN_READER_NOTES_SIDECAR_WIDTH,
	readReaderNotesSidecarOpen,
	readReaderNotesSidecarWidth,
	READER_NOTES_SIDECAR_EVENT,
	READER_NOTES_SIDECAR_STORAGE_KEY,
	READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY,
	setReaderNotesSidecarOpen,
	setReaderNotesSidecarWidth
} from './notes-sidecar';

describe('reader notes sidecar preference', () => {
	it('stores only the visibility flag and emits the shared UI event', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value)
		};
		const dispatchEvent = vi.fn<(event: Event) => boolean>(() => true);

		expect(readReaderNotesSidecarOpen(storage)).toBe(false);
		setReaderNotesSidecarOpen(true, storage, { dispatchEvent });

		expect(values).toEqual(new Map([[READER_NOTES_SIDECAR_STORAGE_KEY, '1']]));
		expect(readReaderNotesSidecarOpen(storage)).toBe(true);
		const event = dispatchEvent.mock.calls[0]?.[0];
		expect(event).toBeInstanceOf(CustomEvent);
		expect(event?.type).toBe(READER_NOTES_SIDECAR_EVENT);
		expect((event as CustomEvent).detail).toEqual({ open: true });
	});

	it('still synchronizes mounted controls when storage access is denied', () => {
		const storage = {
			getItem: () => {
				throw new DOMException('denied', 'SecurityError');
			},
			setItem: () => {
				throw new DOMException('denied', 'SecurityError');
			}
		};
		const dispatchEvent = vi.fn<(event: Event) => boolean>(() => true);

		expect(readReaderNotesSidecarOpen(storage)).toBe(false);
		expect(() => setReaderNotesSidecarOpen(true, storage, { dispatchEvent })).not.toThrow();
		expect(dispatchEvent).toHaveBeenCalledOnce();
	});

	it('persists only a bounded pixel width for horizontal sidecar resizing', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value)
		};

		expect(readReaderNotesSidecarWidth(storage)).toBe(DEFAULT_READER_NOTES_SIDECAR_WIDTH);
		setReaderNotesSidecarWidth(503.6, storage);
		expect(values).toEqual(new Map([[READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY, '504']]));
		expect(readReaderNotesSidecarWidth(storage)).toBe(504);

		values.set(READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY, String(MIN_READER_NOTES_SIDECAR_WIDTH - 1));
		expect(readReaderNotesSidecarWidth(storage)).toBe(DEFAULT_READER_NOTES_SIDECAR_WIDTH);
		values.set(READER_NOTES_SIDECAR_WIDTH_STORAGE_KEY, String(MAX_READER_NOTES_SIDECAR_WIDTH + 1));
		expect(readReaderNotesSidecarWidth(storage)).toBe(DEFAULT_READER_NOTES_SIDECAR_WIDTH);
	});
});
