/**
 * Backup/restore job rows and orchestration — the analogue of `import/jobs.ts` for this feature.
 *
 * Same trade-off as imports: in-process and serial rather than a queue service, because this is a
 * site where a scheduled backup runs at most a few times a day. A job left "running" when the process
 * restarts is marked failed on the next boot (`failInterruptedBackupJobs`) rather than resumed.
 */

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rm, stat, copyFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import type { S3Client } from '@aws-sdk/client-s3';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { config } from '../config.ts';
import { logger } from '../logger.ts';
import type { Database } from '../db/client.ts';
import { backupJobs, type BackupJob } from '../db/schema.ts';
import { refreshStrongStatisticsBlocking } from '../db/statistics.ts';
import { backfillDocumentBodyReferenceIndexes } from '../repositories/document-reference-index.ts';
import { invalidateResourceCache } from '../repositories/resources.ts';
import { pruneExpiredSessions } from '../auth/session.ts';
import { dumpToFile, isCustomFormatDump, restoreFromFile } from './pg.ts';
import { createS3Client, getObjectStream, uploadFile, pruneRemote } from './s3.ts';
import {
	backupFileName,
	BACKUP_FILE_PATTERN,
	selectExpired,
	type BackupObject
} from './retention.ts';
import { readBackupCredentials } from './settings.ts';

export type BackupJobType = (typeof backupJobs.$inferSelect)['type'];
export type BackupTrigger = (typeof backupJobs.$inferSelect)['trigger'];

const STAGED_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Path of a staged restore upload from its id. The strict UUID pattern rules out path traversal. */
export function stagedDumpPath(stagedId: string): string {
	if (!STAGED_ID_PATTERN.test(stagedId)) throw new Error('Ungültige Staging-ID.');
	return join(config().BACKUP_TMP_DIR, `staged-${stagedId}.dump`);
}

// --- job rows ----------------------------------------------------------------

export async function startBackupJob(
	db: Database,
	options: { type: BackupJobType; trigger?: BackupTrigger; createdBy?: string | null }
): Promise<BackupJob> {
	const [job] = await db
		.insert(backupJobs)
		.values({
			type: options.type,
			trigger: options.trigger ?? 'manual',
			state: 'queued',
			createdBy: options.createdBy ?? null
		})
		.returning();
	return job!;
}

export async function markRunning(db: Database, id: string): Promise<void> {
	await db
		.update(backupJobs)
		.set({ state: 'running', startedAt: new Date(), updatedAt: new Date() })
		.where(eq(backupJobs.id, id));
}

async function updateMessage(db: Database, id: string, message: string): Promise<void> {
	await db.update(backupJobs).set({ message, updatedAt: new Date() }).where(eq(backupJobs.id, id));
}

export async function finishBackupJob(
	db: Database,
	id: string,
	result: { fileName?: string; location?: string; sizeBytes?: number; message?: string | null } = {}
): Promise<void> {
	await db
		.update(backupJobs)
		.set({
			state: 'done',
			fileName: result.fileName ?? null,
			location: result.location ?? null,
			sizeBytes: result.sizeBytes ?? null,
			message: result.message ?? null,
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(backupJobs.id, id));
}

export async function failBackupJob(db: Database, id: string, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await db
		.update(backupJobs)
		.set({
			state: 'failed',
			error: message.slice(0, 2000),
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(backupJobs.id, id));
}

export async function listBackupJobs(db: Database, limit = 20): Promise<BackupJob[]> {
	return db.select().from(backupJobs).orderBy(desc(backupJobs.createdAt)).limit(limit);
}

/** Whether a backup or restore is currently running, so the UI (and the scheduler) can hold off. */
export async function hasRunningBackupJob(db: Database): Promise<boolean> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(backupJobs)
		.where(inArray(backupJobs.state, ['queued', 'running']));
	return Number(row?.count ?? 0) > 0;
}

/** Source of truth for "when did the schedule last actually succeed" — never stored in settings. */
export async function lastSuccessfulScheduledRun(db: Database): Promise<Date | null> {
	const [row] = await db
		.select({ finishedAt: backupJobs.finishedAt })
		.from(backupJobs)
		.where(and(eq(backupJobs.type, 'scheduled'), eq(backupJobs.state, 'done')))
		.orderBy(desc(backupJobs.finishedAt))
		.limit(1);
	return row?.finishedAt ?? null;
}

/**
 * Marks jobs that were running when the process stopped as failed. Called once at startup, same
 * reasoning as `import/jobs.ts`'s `failInterruptedJobs`.
 */
export async function failInterruptedBackupJobs(db: Database): Promise<number> {
	const stale = await db
		.update(backupJobs)
		.set({
			state: 'failed',
			error: 'Der Vorgang wurde durch einen Neustart des Servers unterbrochen.',
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(inArray(backupJobs.state, ['queued', 'running']))
		.returning({ id: backupJobs.id });

	if (stale.length > 0)
		logger.warn({ count: stale.length }, 'marked interrupted backup jobs as failed');
	return stale.length;
}

// --- local backup files --------------------------------------------------------

async function listLocalBackupObjects(dir: string): Promise<BackupObject[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const objects: BackupObject[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !BACKUP_FILE_PATTERN.test(entry.name)) continue;
		const stats = await stat(join(dir, entry.name));
		objects.push({ key: entry.name, lastModified: stats.mtime, size: stats.size });
	}
	return objects;
}

/** Local copies kept alongside S3 as a safety net, shown in the admin UI. */
export async function listLocalBackups(): Promise<BackupObject[]> {
	return listLocalBackupObjects(config().BACKUP_TMP_DIR);
}

async function pruneLocalBackups(dir: string, keep: number): Promise<void> {
	const objects = await listLocalBackupObjects(dir);
	const expired = selectExpired(objects, keep);
	await Promise.all(expired.map((name) => rm(join(dir, name), { force: true })));
}

export async function deleteLocalBackup(name: string): Promise<void> {
	if (!BACKUP_FILE_PATTERN.test(name)) throw new Error('Ungültiger Dateiname.');
	await rm(join(config().BACKUP_TMP_DIR, name), { force: true });
}

/** Removes staged restore uploads abandoned by an interrupted upload, older than a day. */
export async function cleanStaleStagedFiles(): Promise<void> {
	const dir = config().BACKUP_TMP_DIR;
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return;
	}

	const cutoff = Date.now() - 24 * 60 * 60 * 1000;
	for (const name of entries) {
		if (!name.startsWith('staged-')) continue;
		const path = join(dir, name);
		try {
			const stats = await stat(path);
			if (stats.mtimeMs < cutoff) await rm(path, { force: true });
		} catch {
			// Racing with an in-flight upload of the same file; leave it alone.
		}
	}
}

// --- staging an existing backup for direct restore ------------------------------

async function assertCustomFormatDump(path: string): Promise<void> {
	const handle = await open(path, 'r');
	const head = Buffer.alloc(5);
	try {
		await handle.read(head, 0, 5, 0);
	} finally {
		await handle.close();
	}
	if (!isCustomFormatDump(head)) {
		await rm(path, { force: true });
		throw new Error('Das ist keine gültige Backup-Datei.');
	}
}

/**
 * Copies an existing local backup into a fresh staged path so it can be restored directly, without a
 * detour through download + re-upload.
 *
 * Always a *copy*: `executeRestore`'s `finally` block unconditionally deletes the path it was given,
 * so handing it the original file would delete that local backup as a side effect of restoring it.
 */
export async function stageFromLocal(name: string): Promise<string> {
	if (!BACKUP_FILE_PATTERN.test(name)) throw new Error('Ungültiger Dateiname.');
	const dir = config().BACKUP_TMP_DIR;
	const source = join(dir, name);
	await mkdir(dir, { recursive: true });
	const dest = stagedDumpPath(randomUUID());
	try {
		await copyFile(source, dest);
	} catch {
		throw new Error('Die lokale Sicherung wurde nicht gefunden.');
	}
	await assertCustomFormatDump(dest);
	return dest;
}

/**
 * Streams an S3 object into a fresh staged path, exactly like `/admin/backup/upload` does for an
 * HTTP upload, so it can be restored directly without downloading and re-uploading it by hand.
 *
 * Same copy-not-original rule as `stageFromLocal`: the staged path is always a new file.
 */
export async function stageFromS3(
	client: S3Client,
	options: { bucket: string; key: string }
): Promise<string> {
	await mkdir(config().BACKUP_TMP_DIR, { recursive: true });
	const dest = stagedDumpPath(randomUUID());
	try {
		const { body } = await getObjectStream(client, options);
		await pipeline(body, createWriteStream(dest));
	} catch (error) {
		await rm(dest, { force: true }).catch(() => {});
		throw error;
	}
	await assertCustomFormatDump(dest);
	return dest;
}

// --- manual download -----------------------------------------------------------

/** Dumps to a temp file for immediate streaming to the browser. Awaited: the caller needs the file. */
export async function createDownloadDump(
	db: Database,
	options: { createdBy: string }
): Promise<{ job: BackupJob; path: string; fileName: string; sizeBytes: number }> {
	const job = await startBackupJob(db, {
		type: 'download',
		trigger: 'manual',
		createdBy: options.createdBy
	});
	await markRunning(db, job.id);

	const dir = config().BACKUP_TMP_DIR;
	await mkdir(dir, { recursive: true });
	const path = join(dir, `download-${job.id}.dump`);

	try {
		const { sizeBytes } = await dumpToFile({ databaseUrl: config().DATABASE_URL, outPath: path });
		const fileName = backupFileName(new Date());
		await finishBackupJob(db, job.id, { fileName, location: 'download', sizeBytes });
		return { job, path, fileName, sizeBytes };
	} catch (error) {
		await failBackupJob(db, job.id, error);
		throw error;
	}
}

// --- scheduled S3 backup ---------------------------------------------------------

/** Fire-and-forget: dump → upload to S3 → prune remote → prune local. Progress lives in the job row. */
export async function runScheduledBackup(
	db: Database,
	options: { trigger: BackupTrigger; createdBy?: string | null }
): Promise<BackupJob> {
	const job = await startBackupJob(db, {
		type: 'scheduled',
		trigger: options.trigger,
		createdBy: options.createdBy ?? null
	});
	void executeScheduledBackup(db, job.id);
	return job;
}

async function executeScheduledBackup(db: Database, jobId: string): Promise<void> {
	await markRunning(db, jobId);

	const dir = config().BACKUP_TMP_DIR;
	await mkdir(dir, { recursive: true });
	const fileName = backupFileName(new Date());
	const localPath = join(dir, fileName);

	try {
		const { settings, secretAccessKey } = await readBackupCredentials(db);
		if (!settings.s3.enabled) throw new Error('S3 ist nicht aktiviert.');

		await updateMessage(db, jobId, 'Datenbank wird gesichert …');
		const { sizeBytes } = await dumpToFile({
			databaseUrl: config().DATABASE_URL,
			outPath: localPath
		});

		await updateMessage(db, jobId, 'Hochladen nach S3 …');
		const client = createS3Client({ ...settings.s3, secretAccessKey });
		const key = `${settings.s3.prefix}${fileName}`;
		let lastReported = 0;
		await uploadFile(client, {
			bucket: settings.s3.bucket,
			key,
			path: localPath,
			onProgress: (loaded, total) => {
				if (Date.now() - lastReported < 1000) return;
				lastReported = Date.now();
				const percent = total ? Math.round((loaded / total) * 100) : undefined;
				void updateMessage(
					db,
					jobId,
					percent !== undefined ? `Hochladen nach S3 … ${percent}%` : 'Hochladen nach S3 …'
				);
			}
		});
		const location = `s3://${settings.s3.bucket}/${key}`;

		await updateMessage(db, jobId, 'Alte Backups werden entfernt …');
		await pruneRemote(client, {
			bucket: settings.s3.bucket,
			prefix: settings.s3.prefix,
			keep: settings.retention.keepRemote
		});
		await pruneLocalBackups(dir, settings.retention.keepLocal);
		if (settings.retention.keepLocal === 0) await rm(localPath, { force: true });

		await finishBackupJob(db, jobId, { fileName, location, sizeBytes });
		logger.info({ jobId, location, sizeBytes }, 'backup finished');
	} catch (error) {
		await rm(localPath, { force: true }).catch(() => {});
		await failBackupJob(db, jobId, error);
		logger.error({ err: error, jobId }, 'backup failed');
	}
}

// --- restore --------------------------------------------------------------------

let restoreInProgress = false;

/**
 * Whether a restore is currently running, so `/healthz` can report "ok" without touching the
 * database — `pg_restore --clean` briefly makes queries fail, and the healthcheck must not treat
 * that short window as a reason to restart the container.
 */
export function isRestoreInProgress(): boolean {
	return restoreInProgress;
}

/**
 * Fire-and-forget: automatic safety dump, then the restore itself, then post-restore repair. Both
 * job rows are created immediately so the UI shows them right away; the confirmation phrase must
 * already have been checked by the caller (the route action) before this is invoked.
 */
export async function runRestore(
	db: Database,
	options: { path: string; createdBy: string }
): Promise<{ safetyJob: BackupJob; job: BackupJob }> {
	const safetyJob = await startBackupJob(db, {
		type: 'pre-restore',
		trigger: 'manual',
		createdBy: options.createdBy
	});
	const job = await startBackupJob(db, {
		type: 'restore',
		trigger: 'manual',
		createdBy: options.createdBy
	});
	void executeRestore(db, { safetyJobId: safetyJob.id, jobId: job.id, path: options.path });
	return { safetyJob, job };
}

async function executeRestore(
	db: Database,
	options: { safetyJobId: string; jobId: string; path: string }
): Promise<void> {
	restoreInProgress = true;
	try {
		const dir = config().BACKUP_TMP_DIR;
		await mkdir(dir, { recursive: true });
		const safetyFileName = `pre-restore-${backupFileName(new Date())}`;
		const safetyPath = join(dir, safetyFileName);

		try {
			await markRunning(db, options.safetyJobId);
			const { sizeBytes } = await dumpToFile({
				databaseUrl: config().DATABASE_URL,
				outPath: safetyPath
			});

			let location = `local:${safetyPath}`;
			const { settings, secretAccessKey } = await readBackupCredentials(db);
			if (settings.s3.enabled) {
				const client = createS3Client({ ...settings.s3, secretAccessKey });
				const key = `${settings.s3.prefix}pre-restore/${safetyFileName}`;
				await uploadFile(client, { bucket: settings.s3.bucket, key, path: safetyPath });
				location = `s3://${settings.s3.bucket}/${key}`;
			}
			await finishBackupJob(db, options.safetyJobId, {
				fileName: safetyFileName,
				location,
				sizeBytes
			});
		} catch (error) {
			logger.error({ err: error }, 'pre-restore safety backup failed, restore aborted');
			await failBackupJob(db, options.safetyJobId, error);
			await failBackupJob(
				db,
				options.jobId,
				new Error(
					'Die Sicherheitskopie vor der Wiederherstellung ist fehlgeschlagen — die ' +
						'Wiederherstellung wurde abgebrochen.'
				)
			);
			return;
		}

		try {
			await markRunning(db, options.jobId);
			const { ignoredErrors } = await restoreFromFile({
				databaseUrl: config().DATABASE_URL,
				path: options.path
			});

			// A dump taken before a schema change restores the old schema plus the old migration
			// history table, so pending migrations must be re-applied for the running code to match.
			await migrate(db, { migrationsFolder: './drizzle' });
			await backfillDocumentBodyReferenceIndexes(db);
			// Materialized view *data* is not part of a dump; without this, search and Strong's
			// statistics come back empty.
			await refreshStrongStatisticsBlocking(db);
			invalidateResourceCache();
			await pruneExpiredSessions(db);

			await finishBackupJob(db, options.jobId, {
				message:
					ignoredErrors > 0
						? `${ignoredErrors} Warnungen beim Wiederherstellen (siehe Serverlog).`
						: undefined
			});
			logger.info({ jobId: options.jobId, ignoredErrors }, 'restore finished');
		} catch (error) {
			await failBackupJob(db, options.jobId, error);
			logger.error({ err: error, jobId: options.jobId }, 'restore failed');
		}
	} finally {
		restoreInProgress = false;
		await rm(options.path, { force: true }).catch(() => {});
	}
}
