import { expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.ts';
import { bibleSnapshot } from './snapshot.ts';
import { parseBibleSnapshot, restoreBibleSnapshot } from './restore.ts';

// Opt-in: requires an isolated, deliberately named test database with a complete Bible imported.
const isolated =
	process.env.EXPORT_TEST_DATABASE === '1' &&
	(() => {
		try {
			return new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_export_test');
		} catch {
			return false;
		}
	})();
it.skipIf(!isolated || !process.env.EXPORT_FULL_RESOURCE)(
	'round-trips a complete imported Bible',
	async () => {
		const db = getDb();
		const id = process.env.EXPORT_FULL_RESOURCE!;
		try {
			const before = await bibleSnapshot(db, id, false);
			expect(before).not.toBeNull();
			const file = JSON.stringify(before);
			expect(Buffer.byteLength(file)).toBeLessThan(128 * 1024 * 1024);
			const parsed = parseBibleSnapshot(file);
			await restoreBibleSnapshot(db, parsed);
			const after = await bibleSnapshot(db, id, false);
			expect(after?.resource).toEqual(before?.resource);
			expect(after?.books).toEqual(before?.books);
			expect(after?.verses).toEqual(before?.verses);
			expect(after?.reviews).toEqual(before?.reviews);
			console.log(`Bible snapshot size: ${(Buffer.byteLength(file) / 1024 / 1024).toFixed(1)} MiB`);
		} finally {
			await closeDb();
		}
	},
	180_000
);
