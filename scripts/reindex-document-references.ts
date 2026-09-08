/** Re-scan all existing working copies without changing their bodies, revisions or manual anchors. */
import { createDb } from '../src/lib/server/db/client.ts';
import { backfillDocumentBodyReferenceIndexes } from '../src/lib/server/repositories/document-reference-index.ts';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const { client, db } = createDb(url, { max: 1 });
try {
	const indexed = await backfillDocumentBodyReferenceIndexes(db, { force: true });
	console.log(`document Bible-reference rescan complete: ${indexed} working copies indexed`);
} catch (error) {
	console.error('document Bible-reference rescan failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
