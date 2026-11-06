import { expect, test } from '@playwright/test';
import { seedAdminSession } from './lib/admin-session.ts';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

test('a stale publication approval cannot survive a concurrent source change or privatization', async ({
	page
}) => {
	const dbUrl =
		process.env.E2E_DATABASE_URL ??
		testDatabaseUrl(
			process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
		);
	const locker = postgres(dbUrl, { max: 1 });
	const monitor = postgres(dbUrl, { max: 1 });
	const id = `DOWNLOAD-RACE-${randomUUID()}`;
	try {
		await monitor`insert into resources (id, kind, name, abbrev, language, is_public, status) values (${id}, 'bible', ${id}, 'TEST', 'de', true, 'ready')`;
		await seedAdminSession(page.context());
		await page.goto('/admin/bible-downloads');
		for (const scenario of ['source', 'private'] as const) {
			await page.goto('/admin/bible-downloads');
			const entry = page.locator('li').filter({ hasText: id });
			await expect(entry).toBeVisible();
			const version = await entry.locator('input[name="resourceVersion"]').inputValue();
			let unlock!: () => void;
			let signalLocked!: () => void;
			const locked = new Promise<void>((resolve) => {
				signalLocked = resolve;
			});
			const release = new Promise<void>((resolve) => {
				unlock = resolve;
			});
			const mutation = locker.begin(async (tx) => {
				await tx`select id from resources where id = ${id} for update`;
				signalLocked();
				await release;
				// Reimport, restore and privatization update the same resource row and revoke its grant.
				if (scenario === 'source')
					await tx`update resources set source_revision = 'new-edition', updated_at = now() where id = ${id}`;
				else await tx`update resources set is_public = false, updated_at = now() where id = ${id}`;
				await tx`delete from bible_download_grants where resource_id = ${id}`;
			});
			try {
				await locked;
				const requested = page.request.post('/admin/bible-downloads?/visibility', {
					headers: { origin: 'http://localhost:4173', accept: 'text/html' },
					form: { id, enable: 'yes', publicDomain: 'yes', resourceVersion: version }
				});
				await expect
					.poll(
						async () => {
							const [row] =
								await monitor`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%resources%' and pid <> pg_backend_pid()`;
							return row?.n ?? 0;
						},
						{ timeout: 5000 }
					)
					.toBeGreaterThan(0);
				unlock();
				await mutation;
				expect((await requested).status()).toBe(scenario === 'source' ? 409 : 400);
				expect(
					await monitor`select resource_id from bible_download_grants where resource_id = ${id}`
				).toHaveLength(0);
				expect((await page.request.get(`/downloads/${id}`)).status()).toBe(404);
			} finally {
				unlock();
				await mutation;
			}
		}
	} finally {
		await monitor`delete from resources where id = ${id}`;
		await Promise.all([locker.end(), monitor.end()]);
	}
});
