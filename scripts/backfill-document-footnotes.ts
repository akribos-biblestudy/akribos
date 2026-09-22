/** Repair existing note/sermon footnotes, including trash and independent public snapshots. */
import { createDb } from '../src/lib/server/db/client.ts';
import { backfillDocumentFootnotes } from '../src/lib/server/documents/footnote-backfill.ts';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
const { db, client } = createDb(url, { max: 1 });
try {
	const result = await backfillDocumentFootnotes(db);
	console.log(
		`document footnote backfill complete: ${result.scanned} checked, ${result.updatedDocuments} working copies repaired, ${result.updatedPublications} publications repaired, ${result.warnings} warnings`
	);
} catch (error) {
	console.error('document footnote backfill failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
