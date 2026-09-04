/** Errors raised before an untrusted import request reaches the platform's buffering form parser. */
export class RequestBodyTooLargeError extends Error {
	constructor() {
		super('Request body exceeds the configured import limit.');
		this.name = 'RequestBodyTooLargeError';
	}
}

export class InvalidFormBodyError extends Error {
	constructor() {
		super('Request body is not valid form data.');
		this.name = 'InvalidFormBodyError';
	}
}

/**
 * Reads at most `maximumBytes` from the original stream and only then invokes `formData()` on a
 * bounded, reconstructed request. A missing or dishonest Content-Length can therefore never make
 * the platform form parser buffer an unbounded upload.
 */
export async function readBoundedFormData(
	request: Request,
	maximumBytes: number
): Promise<FormData> {
	if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
		throw new RangeError('maximumBytes must be a positive safe integer.');
	}

	const declaredLength = request.headers.get('content-length');
	if (declaredLength !== null) {
		if (!/^\d+$/u.test(declaredLength)) throw new InvalidFormBodyError();
		const parsedLength = Number(declaredLength);
		if (!Number.isSafeInteger(parsedLength)) throw new RequestBodyTooLargeError();
		if (parsedLength > maximumBytes) throw new RequestBodyTooLargeError();
	}

	const contentType = request.headers.get('content-type');
	if (!contentType) throw new InvalidFormBodyError();
	if (request.bodyUsed) throw new InvalidFormBodyError();

	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	const reader = request.body?.getReader();
	if (reader) {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				totalBytes += value.byteLength;
				if (totalBytes > maximumBytes) {
					await reader.cancel().catch(() => undefined);
					throw new RequestBodyTooLargeError();
				}
				chunks.push(value.slice());
			}
		} catch (caught) {
			if (caught instanceof RequestBodyTooLargeError) throw caught;
			throw new InvalidFormBodyError();
		} finally {
			reader.releaseLock();
		}
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return await new Request(request.url, {
			method: request.method,
			headers: { 'content-type': contentType },
			body
		}).formData();
	} catch {
		throw new InvalidFormBodyError();
	}
}
