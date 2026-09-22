/** Repair existing note/sermon tables, including trash and independent public snapshots. */
import { createDb } from '../src/lib/server/db/client.ts';
import { backfillDocumentTables } from '../src/lib/server/documents/table-backfill.ts';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
const { db, client } = createDb(url, { max: 1 });
try {
	const result = await backfillDocumentTables(db);
	console.log(
		`document table backfill complete: ${result.scanned} checked, ${result.updatedDocuments} working copies repaired, ${result.updatedPublications} publications repaired, ${result.warnings} warnings`
	);
} catch (error) {
	console.error('document table backfill failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
