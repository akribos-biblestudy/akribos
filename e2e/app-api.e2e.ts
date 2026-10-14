import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { lastMailCodeTo } from './lib/mail-outbox.ts';
import { SEED_ADMIN, SEED_DOCUMENT_IDS } from '../scripts/seed-fixtures.ts';

test.use({ extraHTTPHeaders: { 'x-akribos-app': '1' } });

function pageUrl(path: string) {
	return `/api/app/page?${new URLSearchParams({ path })}`;
}
function actionUrl(path: string, action: string) {
	return `/api/app/action?${new URLSearchParams({ path, action })}`;
}

test('native same-origin requests need no API key and cannot acquire private account access', async ({
	request,
	baseURL
}) => {
	const headers = { origin: new URL(baseURL!).origin };
	const bootstrap = await request.get('/api/app/bootstrap', { headers });
	expect(bootstrap.status()).toBe(200);
	expect(await bootstrap.json()).toMatchObject({
		type: 'success',
		data: { protocolVersion: 1, user: null }
	});
	// Vite preview adds its own CORS headers; the application still rejects every foreign Origin.
	expect(
		(
			await request.get('/api/app/bootstrap', { headers: { origin: 'https://foreign.example' } })
		).status()
	).toBe(403);
	const resources = await request.get('/api/reader/resources', { headers });
	expect(resources.status()).toBe(200);
	const chapter = await request.get('/api/reader/bibles/SEEDDE/43/3', { headers });
	expect(chapter.status()).toBe(200);
	expect((await chapter.json()).verses.length).toBeGreaterThan(0);
	expect((await request.get('/api/documents', { headers })).status()).toBe(401);
	const privatePage = await request.get(pageUrl('/notes'), {
		headers: { ...headers, authorization: 'Bearer not-a-session-or-real-key' }
	});
	expect(await privatePage.json()).toMatchObject({
		type: 'redirect',
		status: 303,
		location: '/login?redirectTo=%2Fnotes'
	});
	// Multipart must pass the framework's same-origin CSRF check and still require a real session.
	const privateImport = await request.post(actionUrl('/notes/import', 'preview'), {
		headers,
		multipart: {
			file: { name: 'guest.md', mimeType: 'text/markdown', buffer: Buffer.from('# Guest') }
		}
	});
	expect(await privateImport.json()).toMatchObject({ type: 'redirect', status: 303 });
});

test('native protocol reads the Reader and protects the route and administration boundary', async ({
	request
}) => {
	const bootstrap = await request.get('/api/app/bootstrap');
	expect(bootstrap.ok()).toBe(true);
	expect(bootstrap.headers()['cache-control']).toBe('private, no-store');
	const initial = await bootstrap.json();
	expect(initial).toMatchObject({ type: 'success', data: { protocolVersion: 1, user: null } });
	expect(initial.data.books).toHaveLength(66);
	expect(
		initial.data.readerResources.some((resource: { id: string }) => resource.id === 'SEEDDE')
	).toBe(true);
	expect(initial.data.navigation.some((item: { id: string }) => item.id === 'admin')).toBe(false);
	const reader = await request.get(pageUrl('/Joh1'));
	expect(reader.ok()).toBe(true);
	const firstReader = await reader.json();
	const canonicalReader =
		firstReader.type === 'redirect'
			? await (await request.get(pageUrl(firstReader.location))).json()
			: firstReader;
	expect(canonicalReader).toMatchObject({
		type: 'success',
		data: { reference: { book: 43, chapter: 1 } }
	});
	for (const path of ['/admin/resources', '/healthz', '//example.com/account']) {
		expect((await request.get(pageUrl(path))).status()).toBe(404);
	}
	expect(
		(await request.get('/api/app/bootstrap', { headers: { 'x-akribos-app': '' } })).status()
	).toBe(400);
	expect(
		(
			await request.post(actionUrl('/login', 'start'), {
				headers: { origin: 'https://evil.example' },
				data: { fields: { email: 'unused@example.test' } }
			})
		).status()
	).toBe(403);
});

test('native email code login, document writes and logout reuse server permissions', async ({
	request
}) => {
	const email = `native-app-${randomUUID()}@example.test`;
	const start = await request.post(actionUrl('/login', 'start'), {
		data: { fields: { email, redirectTo: '/account' } }
	});
	expect(await start.json()).toMatchObject({ type: 'redirect', status: 303 });
	const challenge = (await request.storageState()).cookies.find(
		(cookie) => cookie.name === 'app-email-login'
	);
	expect(challenge).toMatchObject({ path: '/api/app', httpOnly: true });
	const pending = await request.get(pageUrl('/login'));
	expect(await pending.json()).toMatchObject({ type: 'success', data: { pending: { email } } });
	const code = await lastMailCodeTo(email);
	const verified = await request.post(actionUrl('/login', 'code'), { data: { fields: { code } } });
	expect(await verified.json()).toMatchObject({
		type: 'redirect',
		status: 303,
		location: '/account'
	});
	expect(
		(await request.storageState()).cookies.some((cookie) => cookie.name === 'app-email-login')
	).toBe(false);
	const authenticated = await request.get('/api/app/bootstrap');
	expect(await authenticated.json()).toMatchObject({
		type: 'success',
		data: { user: { email, role: 'user' } }
	});
	expect((await request.get(pageUrl('/admin/users'))).status()).toBe(404);
	expect((await request.get(pageUrl(`/notes/${SEED_DOCUMENT_IDS.privateNote}`))).status()).toBe(
		404
	);
	const created = await request.post(actionUrl('/notes', 'create'), {
		data: { fields: { kind: 'note', title: 'Native Testnotiz' } }
	});
	const creation = await created.json();
	expect(creation).toMatchObject({ type: 'redirect', status: 303 });
	expect(creation.location).toMatch(/^\/notes\/[0-9a-f-]+/);
	const loaded = await request.get(pageUrl(creation.location));
	const note = await loaded.json();
	expect(note).toMatchObject({
		type: 'success',
		data: { document: { title: 'Native Testnotiz' } }
	});
	const document = note.data.document;
	const saved = await request.patch(`/api/documents/${document.id}`, {
		data: {
			revision: document.revision,
			title: 'Native Testnotiz',
			markdown: 'Gespeichert aus der App.'
		}
	});
	expect(saved.ok()).toBe(true);
	const stale = await request.patch(`/api/documents/${document.id}`, {
		data: {
			revision: document.revision,
			title: 'Veralteter Stand',
			markdown: 'Darf nicht überschreiben.'
		}
	});
	expect(stale.status()).toBe(409);
	const preview = await request.post(actionUrl('/notes/import', 'preview'), {
		headers: { origin: 'http://localhost:4173' },
		multipart: {
			file: {
				name: 'mobile-study.md',
				mimeType: 'text/markdown',
				buffer: Buffer.from('# Mobile Import\n\nJohannes 3,16')
			}
		}
	});
	expect(await preview.json()).toMatchObject({ type: 'success', data: { canImport: true } });
	const logout = await request.post(actionUrl('/logout', 'default'), { data: { fields: {} } });
	expect(await logout.json()).toMatchObject({ type: 'redirect', location: '/' });
	expect((await request.get(`/api/documents/${document.id}`)).status()).toBe(401);
});

test('native password login stays within reader scope even for an administrator', async ({
	request
}) => {
	const start = await request.post(actionUrl('/login', 'start'), {
		data: { fields: { email: SEED_ADMIN.email } }
	});
	expect(await start.json()).toMatchObject({ type: 'success', data: { step: 'password' } });
	const login = await request.post(actionUrl('/login', 'login'), {
		data: { fields: { email: SEED_ADMIN.email, password: SEED_ADMIN.password } }
	});
	expect(await login.json()).toMatchObject({ type: 'redirect', status: 303 });
	const bootstrap = await (await request.get('/api/app/bootstrap')).json();
	expect(bootstrap.data.user.role).toBe('admin');
	expect(bootstrap.data.navigation.some((item: { id: string }) => item.id === 'admin')).toBe(false);
	expect((await request.get(pageUrl('/admin/resources'))).status()).toBe(404);
	expect((await request.get(pageUrl('/help/administration'))).status()).toBe(404);
	const help = await (await request.get(pageUrl('/help'))).json();
	expect(help.data.topics.some((topic: { id: string }) => topic.id === 'administration')).toBe(
		false
	);
	expect((await request.get(pageUrl(`/notes/${SEED_DOCUMENT_IDS.privateNote}`))).status()).toBe(
		404
	);
});
