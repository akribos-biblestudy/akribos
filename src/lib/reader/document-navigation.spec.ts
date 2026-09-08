import { describe, expect, it } from 'vitest';
import {
	readReaderDocument,
	rememberReaderDocument,
	READER_DOCUMENT_SESSION_KEY
} from './document-navigation';

describe('Reader document session', () => {
	it('restores only the same owner and clears the selection when returning to the library', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => {
				values.set(key, value);
			},
			removeItem: (key: string) => {
				values.delete(key);
			}
		};
		const id = '5eed0000-0000-4000-8000-000000000001';
		rememberReaderDocument('owner', id, storage);
		expect(readReaderDocument('owner', storage)).toBe(id);
		expect(readReaderDocument('stranger', storage)).toBeNull();
		rememberReaderDocument('owner', null, storage);
		expect(values.has(READER_DOCUMENT_SESSION_KEY)).toBe(false);
		expect(readReaderDocument('owner', storage)).toBeNull();
	});

	it.each(['invalid', 'null', '{}', '{"userId":"owner","documentId":"/foreign"}'])(
		'ignores malformed session state %s',
		(value) => {
			expect(readReaderDocument('owner', { getItem: () => value })).toBeNull();
		}
	);

	it('continues safely when the browser denies storage access', () => {
		const denied = () => {
			throw new Error('denied');
		};
		expect(readReaderDocument('owner', { getItem: denied })).toBeNull();
		expect(() =>
			rememberReaderDocument('owner', null, { setItem: denied, removeItem: denied })
		).not.toThrow();
	});
});
