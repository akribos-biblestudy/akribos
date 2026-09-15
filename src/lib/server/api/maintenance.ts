import type { Database } from '../db/client.ts';
import { logger } from '../logger.ts';
import { API_REQUEST_PRUNE_BATCH_SIZE, pruneApiRequests } from './rate-limit.ts';

/** Keep inactive subjects bounded too; cleanup must not depend on another API call. */
export function startApiMaintenance(db: Database): () => void {
	let running = false;
	let stopped = false;
	const tick = async () => {
		if (running || stopped) return;
		running = true;
		try {
			// One fixed cutoff makes each pass finite even while new requests continue to arrive.
			const cutoff = new Date(Date.now() - 60_000);
			while (!stopped && (await pruneApiRequests(db, cutoff)) === API_REQUEST_PRUNE_BATCH_SIZE) {
				// Each awaited, indexed batch releases its locks before the next batch starts.
			}
		} catch (error) {
			logger.warn({ err: error }, 'API request cleanup failed; retrying next minute');
		} finally {
			running = false;
		}
	};
	void tick();
	const timer = setInterval(() => void tick(), 60_000);
	timer.unref();
	return () => {
		stopped = true;
		clearInterval(timer);
	};
}
