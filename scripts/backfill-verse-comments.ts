/**
 * Re-runnable recovery command for the migration from private verse comments to unified documents.
 * Normal deployments receive the SQL backfill in migration 0025; this command also covers rows made
 * later by an older application during a rolling deployment or restored from an old backup.
 *
 *   pnpm db:backfill-notes
 */

import { createDb } from '../src/lib/server/db/client.ts';
import { backfillLegacyVerseComments } from '../src/lib/server/documents/legacy-backfill.ts';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const { client, db } = createDb(url, { max: 2 });

try {
	const result = await backfillLegacyVerseComments(db);
	console.log(
		`legacy verse-comment backfill complete: ${result.created} created, ${result.alreadyPresent} already present`
	);
} catch (error) {
	console.error('legacy verse-comment backfill failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
