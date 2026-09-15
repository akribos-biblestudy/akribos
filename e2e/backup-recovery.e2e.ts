import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

test('real restores retain their history and permit another restore without restarting', async () => {
	test.setTimeout(120_000);
	const { stdout } = await promisify(execFile)(
		process.execPath,
		['--env-file-if-exists=.env', 'scripts/lib/check-backup-recovery.ts'],
		{
			env: process.env,
			maxBuffer: 4 * 1024 * 1024
		}
	);
	expect(stdout).toContain('PASS: two consecutive real restores');
});
