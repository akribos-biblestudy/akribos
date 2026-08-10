import { open } from 'node:fs/promises';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { lastMailLinkTo } from './lib/mail-outbox.ts';

/**
 * Admin backup and restore.
 *
 * The destructive full restore round-trip is deliberately not included here: it drops and recreates
 * every table in the shared e2e database, which any other test running concurrently would trip over.
 * That applies just as much to the two direct-restore sources (an existing local copy, an S3 object) as
 * it does to the upload path — none of the three are exercised end to end here. These tests cover the
 * parts that do not require that: navigation/authorisation, the manual download (which does need
 * `pg_dump` on the host, hence the `hasPgDump` guard), S3 settings persistence without leaking the
 * secret, downloading an existing local copy directly, and every restore path's server-side guards
 * (wrong confirmation phrase, invalid file) — submitted by calling `form.requestSubmit()` directly
 * rather than clicking the (client-disabled) submit button, since the check that actually matters is
 * the server's.
 *
 * Restoring directly from an S3 object is not covered at all: the admin UI only ever renders a
 * restore-from-S3 button for an object returned by `?/listRemote`, which itself requires a reachable,
 * writable bucket — not available in this environment or in CI. `s3.spec.ts` and `jobs.spec.ts` cover
 * `getObjectStream`/`stageFromS3` against a mocked S3 client instead (see the summary in the PR/commit
 * description for what that does and does not prove).
 */

/** Matches `BACKUP_FILE_PATTERN` in `src/lib/server/backup/retention.ts`. */
function fakeBackupName(offsetSeconds: number): string {
	const at = new Date(Date.now() + offsetSeconds * 1000);
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp =
		`${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}-` +
		`${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;
	return `akribos-${stamp}.dump`;
}

/**
 * `BACKUP_TMP_DIR`'s default (see `.env.example`), which the e2e `webServer` does not override —
 * matches what `src/lib/server/config.ts` resolves to when the preview server and this test process
 * share the same working directory and filesystem, as they do here.
 */
function localBackupsDir(): string {
	return join(process.cwd(), 'var', 'backups');
}

function writeFakeLocalBackup(name: string, content: Buffer): string {
	const dir = localBackupsDir();
	mkdirSync(dir, { recursive: true });
	const path = join(dir, name);
	writeFileSync(path, content);
	return path;
}

const VALID_DUMP_HEADER = Buffer.concat([Buffer.from('PGDMP', 'ascii'), Buffer.alloc(16)]);

function uniqueEmail(): string {
	return `e2e-backup-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const PASSWORD = 'ein-sicheres-passwort';

async function register(page: import('@playwright/test').Page, email: string): Promise<void> {
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('E2E');
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await expect(page).toHaveURL(/\/register\/check-email$/);

	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await expect(page).toHaveURL(/\/account$/);
}

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
	// The seed script creates this account.
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill('admin@example.com');
	await page.getByLabel('Passwort').fill('seed-admin-password');
	await page.getByRole('button', { name: 'Anmelden' }).click();
}

function hasPgDump(): boolean {
	return spawnSync('pg_dump', ['--version']).error === undefined;
}

function writeFakeDumpFile(dir: string, name = 'fake.dump'): string {
	const path = join(dir, name);
	// Only the magic bytes matter to the upload endpoint's format check; the rest can be arbitrary
	// since these tests never let a fake file reach `pg_restore`.
	writeFileSync(path, Buffer.concat([Buffer.from('PGDMP', 'ascii'), Buffer.alloc(64)]));
	return path;
}

test('the backup area is hidden from a normal account', async ({ page }) => {
	await register(page, uniqueEmail());
	const response = await page.goto('/admin/backup');
	expect(response?.status()).toBe(404);
});

test('an admin can reach the backup page from the navigation', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/admin');
	await page.getByRole('link', { name: 'Backup' }).click();
	await expect(page).toHaveURL(/\/admin\/backup$/);
	await expect(page.getByRole('heading', { name: 'Backup und Wiederherstellung' })).toBeVisible();
});

test('a manual backup can be downloaded and appears in the history', async ({ page }) => {
	test.skip(!hasPgDump(), 'pg_dump is not installed in this environment');

	await loginAsAdmin(page);
	await page.goto('/admin/backup');

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Backup herunterladen' }).click();
	const download = await downloadPromise;

	expect(download.suggestedFilename()).toMatch(/^akribos-\d{8}-\d{6}\.dump$/);
	const path = await download.path();
	expect(path).not.toBeNull();

	const handle = await open(path!, 'r');
	const head = Buffer.alloc(5);
	await handle.read(head, 0, 5, 0);
	await handle.close();
	expect(head.toString('ascii')).toBe('PGDMP');

	await page.reload();
	await expect(page.getByText('Download').first()).toBeVisible();
	await expect(page.getByText('fertig').first()).toBeVisible();
});

test('S3 settings persist without exposing the secret', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/admin/backup');

	await page.getByLabel('Automatische Backups aktiviert').check();
	await page.getByLabel('Endpoint (URL)').fill('http://127.0.0.1:9/');
	await page.getByLabel('Bucket', { exact: true }).fill('e2e-test-bucket');
	await page.getByLabel('Access Key ID').fill('AKIAE2ETESTKEY');
	await page.getByLabel('Secret Access Key').fill('e2e-test-secret-value');
	await page.getByRole('button', { name: 'Speichern' }).click();

	await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
	expect(await page.content()).not.toContain('e2e-test-secret-value');

	await page.reload();
	await expect(page.getByLabel('Secret Access Key')).toHaveAttribute('placeholder', 'unverändert');
	expect(await page.content()).not.toContain('e2e-test-secret-value');

	// Port 9 (discard) refuses connections almost immediately, so the test does not have to wait out
	// the client's own connection timeout.
	await page.getByRole('button', { name: 'Verbindung testen' }).click();
	await expect(page.getByText(/Verbindung fehlgeschlagen/)).toBeVisible();

	// Leave the page disabled again so this test starts from the same state next time it runs.
	await page.getByLabel('Automatische Backups aktiviert').uncheck();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
});

test('restore refuses a wrong confirmation phrase', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/admin/backup');

	const dir = mkdtempSync(join(tmpdir(), 'e2e-restore-'));
	await page.getByLabel('Backup-Datei (.dump)').setInputFiles(writeFakeDumpFile(dir));
	await expect(page.getByText(/fake\.dump/)).toBeVisible();

	await page.locator('#restore-confirm > summary').click();
	await page.getByLabel(/Zur Bestätigung/).fill('falsch');
	// The submit button is disabled client-side until the phrase matches; submitting the form
	// directly is what proves the server enforces this independently of that convenience.
	await page
		.locator('form[action="?/restore"]')
		.evaluate((form) => (form as HTMLFormElement).requestSubmit());

	await expect(page.getByText('Die Bestätigung stimmt nicht überein.')).toBeVisible();
	await expect(page.getByText('Sicherung vor Wiederherstellung')).toHaveCount(0);
	await expect(page.getByText('Wiederherstellung', { exact: true })).toHaveCount(0);
});

test('restore refuses a file that is not a pg_dump', async ({ page }) => {
	await loginAsAdmin(page);
	await page.goto('/admin/backup');

	const dir = mkdtempSync(join(tmpdir(), 'e2e-restore-'));
	const path = join(dir, 'not-a-dump.txt');
	writeFileSync(path, 'hello world');

	await page.getByLabel('Backup-Datei (.dump)').setInputFiles(path);
	await expect(page.getByText(/keine gültige Backup-Datei/)).toBeVisible();
});

test('an existing local backup copy has its own download link and can be downloaded directly', async ({
	page
}) => {
	// No `pg_dump` involved at all: this is a plain file already sitting where the scheduled backup
	// would have left it, downloaded through the new per-row link — not the throwaway dump the
	// "Sofort-Backup" button generates.
	const name = fakeBackupName(0);
	const path = writeFakeLocalBackup(name, VALID_DUMP_HEADER);

	try {
		await loginAsAdmin(page);
		await page.goto('/admin/backup');

		const row = page.locator('li').filter({ hasText: name });
		await expect(row).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await row.getByRole('link', { name: 'herunterladen' }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toBe(name);
		const downloadedPath = await download.path();
		expect(downloadedPath).not.toBeNull();
		expect(readFileSync(downloadedPath!).subarray(0, 5).toString('ascii')).toBe('PGDMP');

		// Unlike `/admin/backup/download` (a fresh, throwaway dump), this is a durable copy — the
		// route must not have deleted it after streaming.
		expect(existsSync(path)).toBe(true);
	} finally {
		rmSync(path, { force: true });
	}
});

test('restoreLocal refuses a wrong confirmation phrase', async ({ page }) => {
	const name = fakeBackupName(1);
	const path = writeFakeLocalBackup(name, VALID_DUMP_HEADER);

	try {
		await loginAsAdmin(page);
		await page.goto('/admin/backup');

		const row = page.locator('li').filter({ hasText: name });
		await expect(row).toBeVisible();

		await page.locator('#restore-confirm > summary').click();
		await page.getByLabel(/Zur Bestätigung/).fill('falsch');
		// Same reasoning as the upload form's equivalent test: the disabled button is convenience
		// only, so the direct `requestSubmit()` is what proves the server enforces this independently.
		await row
			.locator('form[action="?/restoreLocal"]')
			.evaluate((form) => (form as HTMLFormElement).requestSubmit());

		await expect(page.getByText('Die Bestätigung stimmt nicht überein.')).toBeVisible();
		await expect(page.getByText('Sicherung vor Wiederherstellung')).toHaveCount(0);
		await expect(page.getByText('Wiederherstellung', { exact: true })).toHaveCount(0);
	} finally {
		rmSync(path, { force: true });
	}
});

test('restoreLocal refuses a file that is not a valid pg_dump, without deleting it', async ({
	page
}) => {
	// A file that matches the naming pattern but not the pg_dump magic bytes — e.g. corrupted on disk.
	// The confirmation phrase is correct here, which is exactly the point: staging must reject the file
	// on its content *before* a restore (and its mandatory pre-restore safety dump) is ever started.
	const name = fakeBackupName(2);
	const path = writeFakeLocalBackup(name, Buffer.from('not a dump'));

	try {
		await loginAsAdmin(page);
		await page.goto('/admin/backup');

		const row = page.locator('li').filter({ hasText: name });
		await expect(row).toBeVisible();

		await page.locator('#restore-confirm > summary').click();
		await page.getByLabel(/Zur Bestätigung/).fill('WIEDERHERSTELLEN');
		await row
			.locator('form[action="?/restoreLocal"]')
			.evaluate((form) => (form as HTMLFormElement).requestSubmit());

		await expect(page.getByText('Das ist keine gültige Backup-Datei.')).toBeVisible();
		await expect(page.getByText('Sicherung vor Wiederherstellung')).toHaveCount(0);
		await expect(page.getByText('Wiederherstellung', { exact: true })).toHaveCount(0);
		// The rejected file is a pre-existing local backup, not a throwaway upload — staging must not
		// have deleted it merely for failing the format check.
		expect(existsSync(path)).toBe(true);
	} finally {
		rmSync(path, { force: true });
	}
});
