import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';

// This regression restores only a fresh, uniquely named local database, never the E2E or dev DB.
const base = new URL(process.env.DATABASE_URL!);
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
const name = `backup_recovery_${randomUUID().replaceAll('-', '')}`;
const target = new URL(base);
target.pathname = '/' + name;
const maintenance = new URL(base);
maintenance.pathname = '/postgres';
const admin = postgres(maintenance.toString(), { max: 1, onnotice: () => {} });
const dir = await mkdtemp(join(tmpdir(), 'akribos-backup-recovery-'));
let created = false;
let connection:
	Awaited<ReturnType<(typeof import('../../src/lib/server/db/client.ts'))['createDb']>> | undefined;
try {
	await admin.unsafe(`CREATE DATABASE "${name}"`);
	created = true;
	process.env.DATABASE_URL = target.toString();
	process.env.BACKUP_TMP_DIR = dir;
	process.env.SESSION_SECRET = 'backup-recovery-test-only-secret-0123456789';
	delete process.env.BREVO_API_KEY;
	const migration = spawnSync(process.execPath, ['scripts/migrate.ts'], {
		env: process.env,
		encoding: 'utf8'
	});
	assert.equal(migration.status, 0, migration.stderr || migration.stdout);
	const { createDb } = await import('../../src/lib/server/db/client.ts');
	const jobs = await import('../../src/lib/server/backup/jobs.ts');
	connection = createDb(target.toString(), { max: 1 });
	const { db, client } = connection;
	const [owner] =
		await client`insert into users (email) values ('backup-owner@example.test') returning id`;
	const download = await jobs.createDownloadDump(db, { createdBy: owner!.id });
	// This account is absent from the older backup: restored history must not violate its owner FK.
	const [laterOwner] =
		await client`insert into users (email) values ('later-owner@example.test') returning id`;
	for (const createdBy of [laterOwner!.id, owner!.id]) {
		const staged = join(dir, randomUUID() + '.dump');
		await copyFile(download.path, staged);
		const result = await jobs.runRestore(db, { path: staged, createdBy });
		const deadline = Date.now() + 60_000;
		while (jobs.isRestoreInProgress() && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.equal(jobs.isRestoreInProgress(), false, 'restore completed');
		const history = await jobs.listBackupJobs(db);
		const restored = history.find((job) => job.id === result.job.id);
		const safety = history.find((job) => job.id === result.safetyJob.id);
		assert.equal(restored?.state, 'done', restored?.error ?? 'missing restore history');
		assert.equal(safety?.state, 'done');
		assert.ok(safety?.location?.startsWith('local:'));
		assert.ok((safety?.sizeBytes ?? 0) > 0);
		assert.equal(restored?.createdBy, createdBy === laterOwner!.id ? null : owner!.id);
		assert.equal(safety?.createdBy, restored?.createdBy);
		assert.equal(history.find((job) => job.id === download.job.id)?.state, 'failed');
		assert.equal(await jobs.hasRunningBackupJob(db), false, 'future jobs are not blocked');
	}
	console.log(
		'PASS: two consecutive real restores preserve current job history and release the backup gate.'
	);
} finally {
	await connection?.client.end();
	if (created) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
	await admin.end();
	await rm(dir, { recursive: true, force: true });
}
