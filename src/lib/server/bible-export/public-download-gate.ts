/** Limit memory-heavy public exports until their response bodies are consumed or cancelled.
 * This is per Node process; the production deployment currently has a single app instance. */
export function createPublicDownloadGate(maxConcurrent: number) {
	let active = 0;
	return async (signal: AbortSignal, build: () => Promise<Response>): Promise<Response> => {
		if (signal.aborted || active >= maxConcurrent) {
			return new Response('Der Bibel-Download ist ausgelastet. Bitte versuche es gleich erneut.', {
				status: 503,
				headers: { 'Retry-After': '30', 'Cache-Control': 'no-store' }
			});
		}
		active++;
		let released = false;
		let removeAbort = () => {};
		function release() {
			if (released) return;
			released = true;
			removeAbort();
			active--;
		}
		try {
			const response = await build();
			if (!response.ok || !response.body) {
				release();
				return response;
			}
			const reader = response.body.getReader();
			const abort = () => {
				void reader
					.cancel()
					.catch(() => {})
					.finally(release);
			};
			signal.addEventListener('abort', abort, { once: true });
			removeAbort = () => signal.removeEventListener('abort', abort);
			if (signal.aborted) abort();
			const body = new ReadableStream<Uint8Array>(
				{
					async pull(controller) {
						try {
							const part = await reader.read();
							if (part.done) {
								controller.close();
								release();
							} else {
								controller.enqueue(part.value);
							}
						} catch (cause) {
							release();
							controller.error(cause);
						}
					},
					async cancel(reason) {
						try {
							await reader.cancel(reason);
						} finally {
							release();
						}
					}
				},
				{ highWaterMark: 0 }
			);
			return new Response(body, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
		} catch (cause) {
			release();
			throw cause;
		}
	};
}

/** Bound concurrent uncompressed JSON snapshots and USX archives together. */
export const limitPublicDownload = createPublicDownloadGate(2);
