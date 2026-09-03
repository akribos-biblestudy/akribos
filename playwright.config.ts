import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from './scripts/lib/test-database.ts';
import { MAIL_TEST_OUTBOX } from './scripts/lib/mail-outbox.ts';

/**
 * End-to-end tests run against a production build, since that is what the container serves, and
 * against their own database, prepared by `scripts/prepare-e2e.ts`, so the assertions can name exact
 * verse wording.
 */
const databaseUrl =
	process.env.E2E_DATABASE_URL ??
	testDatabaseUrl(process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs');

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.{ts,js}',
	// A cold build or a slow first render should not fail an assertion.
	timeout: 30_000,
	expect: { timeout: 7_000 },
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure',
		// Every suite except `product-tour.e2e.ts` exercises ordinary reader/account behaviour and does
		// not expect the product tour's overlay to be sitting over the page — exactly what a genuinely
		// new visitor would trigger by default. Starting every context as if it had already dismissed
		// the signed-out tour keeps those suites unaffected; the tour's own tests explicitly reset to a
		// cookie-less context to get a first-time visitor.
		storageState: {
			cookies: [
				{
					name: 'tour-guest-done',
					value: '1',
					domain: 'localhost',
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: false,
					sameSite: 'Lax'
				},
				{
					// Most established reader scenarios predate the workspace onboarding default and
					// intentionally exercise the two-translation legacy migration. A dedicated test below
					// clears this cookie and verifies the actual first-visit workspace.
					name: 'columns',
					value: 'SEEDDE,SEEDPLAIN',
					domain: 'localhost',
					path: '/',
					expires: -1,
					httpOnly: false,
					secure: false,
					sameSite: 'Lax'
				}
			],
			origins: []
		}
	},
	webServer: {
		command: 'pnpm run build && pnpm run preview --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			// Spread first: the build step needs PATH and the rest of the ambient environment.
			...process.env,
			DATABASE_URL: databaseUrl,
			ORIGIN: 'http://localhost:4173',
			SESSION_SECRET: 'e2e-session-secret-e2e-session-secret-0123',
			// Lets the backup tests exercise the encrypted S3-secret path, not just the unconfigured one.
			BACKUP_ENCRYPTION_KEY: 'e2e-backup-encryption-key-0123456789abcdef',
			NODE_ENV: 'production',
			// See scripts/lib/mail-outbox.ts: recovers verification/reset links the app "sends" via mail.
			MAIL_TEST_OUTBOX: MAIL_TEST_OUTBOX
		}
	}
});
