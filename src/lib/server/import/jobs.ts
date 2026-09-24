/**
 * Import jobs.
 *
 * An import of a full translation takes half a minute, which is longer than a request should last, so
 * the upload returns immediately and the work continues in the background. Progress is written to the
 * `import_jobs` row and the admin page polls it.
 *
 * The runner is deliberately in-process and serial: this is a site where imports happen a handful of
 * times a year, and a queue service would be more moving parts than the problem deserves. A job left
 * running when the process restarts is marked as failed on the next boot rather than resumed, so the
 * admin sees the truth and can retry.
 */

import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { config } from '../config.ts';
import { logger } from '../logger.ts';
import type { SourceFormat } from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import { importJobs, type ImportJob } from '../db/schema.ts';
import { invalidateResourceCache } from '../repositories/resources.ts';
import { resourceKindForFormat, runImport } from './index.ts';

export type QueueOptions = {
	format: SourceFormat;
	fileName: string;
	contents: ArrayBuffer;
	createdBy: string;
	overrides?: {
		id?: string;
		name?: string;
		abbrev?: string;
		language?: string;
	};
	targetResourceId?: string;
};

/**
 * Stores the upload and starts the import.
 *
 * The file is written to disk first so a re-import needs no second upload, and so a failed parse can
 * be investigated against the exact bytes that were sent.
 */
export async function queueImport(db: Database, options: QueueOptions): Promise<ImportJob> {
	const directory = config().UPLOAD_DIR;
	await mkdir(directory, { recursive: true });

	const safeName = options.fileName.replace(/[^\w.-]+/g, '_').slice(-120);
	const storedName = `${Date.now()}-${safeName}`;
	const path = join(directory, storedName);
	await writeFile(path, Buffer.from(options.contents));

	const [job] = await db
		.insert(importJobs)
		.values({
			kind: resourceKindForFormat(options.format),
			sourceFormat: options.format,
			sourceFile: path,
			state: 'queued',
			createdBy: options.createdBy
		})
		.returning();

	// Deliberately not awaited: the request returns while the import runs.
	void execute(db, job!.id, options);

	return job!;
}

async function execute(db: Database, jobId: string, options: QueueOptions): Promise<void> {
	const [job] = await db
		.update(importJobs)
		.set({ state: 'running', startedAt: new Date(), updatedAt: new Date() })
		.where(eq(importJobs.id, jobId))
		.returning();

	if (!job) return;

	let lastWrite = 0;

	try {
		const result = await runImport(db, {
			format: options.format,
			input: readFileChunks(job.sourceFile),
			sourceFile: job.sourceFile,
			sourceName: options.fileName,
			...(options.overrides ? { overrides: options.overrides } : {}),
			...(options.targetResourceId ? { targetResourceId: options.targetResourceId } : {}),
			onProgress: async ({ done, message }) => {
				// Throttled to once a second: the page polls, and every write is a transaction.
				if (Date.now() - lastWrite < 1000) return;
				lastWrite = Date.now();
				await db
					.update(importJobs)
					.set({ progress: done, message: message ?? null, updatedAt: new Date() })
					.where(eq(importJobs.id, jobId));
			}
		});

		await db
			.update(importJobs)
			.set({
				state: 'done',
				resourceId: result.resourceId,
				progress: result.count,
				total: result.count,
				warnings: result.warnings.slice(0, 200),
				message: null,
				finishedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(importJobs.id, jobId));

		invalidateResourceCache();
		logger.info({ jobId, resourceId: result.resourceId, count: result.count }, 'import finished');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error({ err: error, jobId }, 'import failed');

		await db
			.update(importJobs)
			.set({
				state: 'failed',
				error: message.slice(0, 2000),
				finishedAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(importJobs.id, jobId));
	}
}

async function* readFileChunks(path: string): AsyncIterable<string> {
	for await (const chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
		yield chunk as string;
	}
}

export async function listJobs(db: Database, limit = 25): Promise<ImportJob[]> {
	return db.select().from(importJobs).orderBy(desc(importJobs.createdAt)).limit(limit);
}

export async function findJob(db: Database, id: string): Promise<ImportJob | undefined> {
	const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
	return job;
}

/**
 * Marks jobs that were running when the process stopped as failed.
 *
 * Called once at startup. Without it, a job interrupted by a deployment would sit at "running" for
 * ever and the admin would have no way to tell it apart from one that is genuinely working.
 */
export async function failInterruptedJobs(db: Database): Promise<number> {
	const stale = await db
		.update(importJobs)
		.set({
			state: 'failed',
			error: 'Der Import wurde durch einen Neustart des Servers unterbrochen.',
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(inArray(importJobs.state, ['queued', 'running']))
		.returning({ id: importJobs.id });

	if (stale.length > 0)
		logger.warn({ count: stale.length }, 'marked interrupted imports as failed');
	return stale.length;
}

/** Whether an import is currently running, so the UI can discourage starting a second one. */
export async function hasRunningJob(db: Database): Promise<boolean> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(importJobs)
		.where(and(inArray(importJobs.state, ['queued', 'running'])));
	return Number(row?.count ?? 0) > 0;
}
