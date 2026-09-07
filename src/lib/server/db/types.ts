import { customType } from 'drizzle-orm/pg-core';

/** postgres.js reads and writes bytea as Buffer, without Base64 expansion. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	}
});

/**
 * PostgreSQL `tsvector`.
 *
 * Drizzle has no built-in mapping, and declaring the column as `text` would be wrong twice over:
 * `to_tsvector()` cannot be assigned to a text column, and a GIN index over text would pick the
 * wrong operator class. The column is only ever read through `@@` and `ts_rank`, never in
 * TypeScript, so the client-side type is a plain string.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'tsvector';
	}
});
