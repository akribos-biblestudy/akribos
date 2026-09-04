import { describe, expect, it } from 'vitest';
import {
	InvalidFormBodyError,
	readBoundedFormData,
	RequestBodyTooLargeError
} from './bounded-form-data.ts';

function streamedRequest(chunks: readonly string[], headers: HeadersInit = {}): Request {
	const encoder = new TextEncoder();
	let position = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks[position++];
			if (chunk === undefined) controller.close();
			else controller.enqueue(encoder.encode(chunk));
		}
	});

	return new Request('http://localhost/notes/import?/preview', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
		body,
		duplex: 'half'
	} as RequestInit & { duplex: 'half' });
}

describe('readBoundedFormData', () => {
	it('parses a form only after its complete body fits inside the configured bound', async () => {
		const form = await readBoundedFormData(streamedRequest(['title=Eine+', 'Notiz']), 32);
		expect(form.get('title')).toBe('Eine Notiz');
	});

	it('preserves the uploaded file while reparsing a bounded multipart request', async () => {
		const source = new FormData();
		source.set('file', new File(['# Sicher\n'], 'sicher.md', { type: 'text/markdown' }));
		const request = new Request('http://localhost/notes/import?/preview', {
			method: 'POST',
			body: source
		});

		const parsed = await readBoundedFormData(request, 4 * 1024);
		const file = parsed.get('file');
		expect(file).toBeInstanceOf(File);
		expect((file as File).name).toBe('sicher.md');
		expect(await (file as File).text()).toBe('# Sicher\n');
	});

	it('rejects an oversized declared length without consuming the request body', async () => {
		const request = streamedRequest(['source=small'], { 'content-length': '101' });

		await expect(readBoundedFormData(request, 100)).rejects.toBeInstanceOf(
			RequestBodyTooLargeError
		);
		expect(request.bodyUsed).toBe(false);
	});

	it('stops a chunked request that crosses the bound despite a dishonest declared length', async () => {
		const request = streamedRequest(['source=', '12345', '67890'], { 'content-length': '5' });

		await expect(readBoundedFormData(request, 15)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
	});

	it('rejects malformed form metadata and invalid configuration', async () => {
		const missingContentType = new Request('http://localhost/notes/import', {
			method: 'POST',
			body: 'source=ok'
		});
		missingContentType.headers.delete('content-type');

		await expect(readBoundedFormData(missingContentType, 100)).rejects.toBeInstanceOf(
			InvalidFormBodyError
		);
		await expect(readBoundedFormData(streamedRequest(['source=ok']), 0)).rejects.toBeInstanceOf(
			RangeError
		);
	});
});
