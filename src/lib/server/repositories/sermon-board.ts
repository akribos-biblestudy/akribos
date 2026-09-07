import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
	cleanSermonColumnName,
	DEFAULT_SERMON_COLUMNS,
	MAX_SERMON_COLUMNS
} from '../../notes/sermon-board.ts';
import type { Database } from '../db/client.ts';
import { documents, users } from '../db/schema.ts';

/** Reads never initialize or change a board. The schema supplies defaults for every account. */
export async function getSermonBoard(db: Database, userId: string, lock = false) {
	const query = db
		.select({ columns: users.sermonColumns, revision: users.sermonBoardRevision })
		.from(users)
		.where(eq(users.id, userId));
	const [board] = await (lock ? query.for('update') : query);
	if (!board) throw new Error('Sermon board owner does not exist');
	return board;
}

export type SermonBoardChange =
	| { action: 'create'; name: string }
	| { action: 'rename'; id: string; name: string }
	| { action: 'reorder'; id: string; direction: 'left' | 'right' }
	| { action: 'delete'; id: string; targetId: string };

export async function changeSermonBoard(
	db: Database,
	userId: string,
	revision: number,
	change: SermonBoardChange
) {
	return db.transaction(async (tx) => {
		const board = await getSermonBoard(tx as unknown as Database, userId, true);
		if (board.revision !== revision) return { ok: false, reason: 'boardConflict' } as const;
		const columns = board.columns.map((column) => ({ ...column }));
		const index =
			change.action === 'create' ? -1 : columns.findIndex((column) => column.id === change.id);
		if (change.action !== 'create' && index < 0)
			return { ok: false, reason: 'columnMissing' } as const;
		if (change.action === 'create' || change.action === 'rename') {
			const name = cleanSermonColumnName(change.name);
			if (
				!name ||
				columns.some(
					(column, i) =>
						i !== index && column.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de')
				)
			)
				return { ok: false, reason: 'columnName' } as const;
			if (change.action === 'create') {
				if (columns.length >= MAX_SERMON_COLUMNS)
					return { ok: false, reason: 'columnLimit' } as const;
				columns.push({ id: randomUUID(), name });
			} else columns[index]!.name = name;
		} else if (change.action === 'reorder') {
			const target = index + (change.direction === 'left' ? -1 : 1);
			if (target < 0 || target >= columns.length)
				return { ok: false, reason: 'columnMissing' } as const;
			[columns[index], columns[target]] = [columns[target]!, columns[index]!];
		} else {
			if (columns.length === 1) return { ok: false, reason: 'lastColumn' } as const;
			if (change.targetId === change.id || !columns.some((column) => column.id === change.targetId))
				return { ok: false, reason: 'columnTarget' } as const;
			// Include dormant note metadata and trash: restoring/converting must never revive a deleted column.
			await tx
				.update(documents)
				.set({
					sermonStatus: change.targetId,
					revision: sql`${documents.revision} + 1`,
					updatedAt: new Date()
				})
				.where(and(eq(documents.userId, userId), eq(documents.sermonStatus, change.id)));
			columns.splice(index, 1);
		}
		await tx
			.update(users)
			.set({ sermonColumns: columns, sermonBoardRevision: board.revision + 1 })
			.where(eq(users.id, userId));
		return { ok: true, columns, revision: board.revision + 1 } as const;
	});
}

export class SermonColumnImportError extends Error {}

/** An exported column is portable by name; foreign UUIDs never become authority to use a column. */
export async function importSermonColumn(
	db: Database,
	userId: string,
	status: string,
	statusName?: string
) {
	return db.transaction(async (tx) => {
		const transactionDb = tx as unknown as Database;
		const board = await getSermonBoard(transactionDb, userId, true);
		const name =
			cleanSermonColumnName(statusName ?? '') ??
			DEFAULT_SERMON_COLUMNS.find((column) => column.id === status)?.name;
		const existing =
			board.columns.find(
				(column) =>
					column.id === status &&
					(!statusName ||
						!DEFAULT_SERMON_COLUMNS.some((legacy) => legacy.id === status) ||
						column.name.toLocaleLowerCase('de') === name?.toLocaleLowerCase('de'))
			) ??
			board.columns.find(
				(column) => name && column.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de')
			);
		if (existing) return existing.id;
		if (!name) return board.columns[0]!.id;
		const result = await changeSermonBoard(transactionDb, userId, board.revision, {
			action: 'create',
			name
		});
		if (!result.ok)
			throw new SermonColumnImportError(
				'Die benötigte Spalte konnte nicht angelegt werden. Pro Konto sind höchstens 30 Spalten möglich.'
			);
		return result.columns.at(-1)!.id;
	});
}
