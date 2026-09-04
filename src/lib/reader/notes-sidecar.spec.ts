import { describe, expect, it, vi } from 'vitest';
import {
	readReaderNotesSidecarOpen,
	READER_NOTES_SIDECAR_EVENT,
	READER_NOTES_SIDECAR_STORAGE_KEY,
	setReaderNotesSidecarOpen
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
});
