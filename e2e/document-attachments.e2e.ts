import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDb } from '../src/lib/server/db/client.ts';
import { documents, users } from '../src/lib/server/db/schema.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';

const password = 'ein-sicheres-passwort';
const pdf = {
	name: 'Überblick.pdf',
	mimeType: 'application/pdf',
	buffer: Buffer.from('%PDF-1.4\nAnlage\n%%EOF\n')
};
const slides = {
	name: 'Präsentation.pptx',
	mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	buffer: Buffer.from([80, 75, 3, 4, 0, 255, 128, 1])
};
const image = {
	name: 'Bild.png',
	mimeType: 'image/png',
	buffer: Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=',
		'base64'
	)
};

async function login(page: Page, email: string, secret = password) {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Passwort', { exact: true }).fill(secret);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL(/\/account$/);
}

async function fixture(page: Page) {
	const email = `attachments-${crypto.randomUUID()}@example.com`;
	const { db, client } = createDb(
		process.env.E2E_DATABASE_URL ??
			testDatabaseUrl(
				process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
			),
		{ max: 1 }
	);
	let ids: string[];
	try {
		const [user] = await db
			.insert(users)
			.values({
				email,
				passwordHash: await hashPassword(password),
				emailVerifiedAt: new Date(),
				tourCompletedAt: new Date()
			})
			.returning();
		const rows = await db
			.insert(documents)
			.values([
				{
					userId: user.id,
					kind: 'sermon',
					title: 'Ausarbeitung mit Anlagen',
					sermonStatus: 'idea',
					bodyMarkdown: '',
					bodyHtml: '',
					plainText: ''
				},
				{
					userId: user.id,
					kind: 'sermon',
					title: 'Andere Ausarbeitung',
					sermonStatus: 'idea',
					bodyMarkdown: '',
					bodyHtml: '',
					plainText: ''
				},
				{
					userId: user.id,
					kind: 'note',
					title: 'Private Notiz',
					bodyMarkdown: '',
					bodyHtml: '',
					plainText: ''
				}
			])
			.returning({ id: documents.id });
		ids = rows.map((row) => row.id);
	} finally {
		await client.end();
	}
	await login(page, email);
	return { id: ids[0]!, otherId: ids[1]!, noteId: ids[2]! };
}

test('uploads PDF, slides and images while typing, downloads exact bytes and removes files on mobile', async ({
	page
}) => {
	const { id } = await fixture(page);
	await page.goto(`/notes/${id}`);
	const card = page.getByTestId('document-attachments');
	await expect(card.getByText('Noch keine Anlagen.')).toBeVisible();
	await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
	const editor = page.getByRole('textbox', { name: 'Markdown', exact: true });
	await editor.fill('Text vor dem Upload.');
	let release!: () => void;
	let started!: () => void;
	const uploading = new Promise<void>((resolve) => (started = resolve));
	const held = new Promise<void>((resolve) => (release = resolve));
	const endpoint = `/api/documents/${id}/attachments`;
	await page.route(`**${endpoint}`, async (route) => {
		if (route.request().method() === 'POST') {
			started();
			await held;
		}
		await route.continue();
	});
	await card.getByLabel('Anlagen auswählen').setInputFiles([pdf, slides, image]);
	await uploading;
	await editor.fill('Text während des Uploads bleibt erhalten.');
	release();
	await expect(card.getByRole('status')).toHaveText('Anlagen gespeichert.');
	await expect(card.getByRole('link')).toHaveCount(3);
	const read = async () => (await (await page.request.get(`/api/documents/${id}`)).json()).document;
	await expect
		.poll(async () => (await read()).bodyMarkdown)
		.toContain('Text während des Uploads bleibt erhalten.');
	await expect(page.getByTestId('document-editor').getByRole('status')).toContainText(
		'Gespeichert'
	);
	await page.reload();
	await expect(card.getByRole('link')).toHaveCount(3);
	for (const file of [pdf, slides, image]) {
		const downloadPromise = page.waitForEvent('download');
		await card.getByRole('link', { name: `${file.name} herunterladen`, exact: true }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe(file.name);
		expect(await readFile((await download.path())!)).toEqual(file.buffer);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await card.scrollIntoViewIfNeeded();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
		true
	);
	await card.getByRole('button', { name: `${slides.name} löschen`, exact: true }).click();
	await card.getByRole('button', { name: 'Abbrechen', exact: true }).click();
	await expect(card.getByRole('link')).toHaveCount(3);
	await card.getByRole('button', { name: `${slides.name} löschen`, exact: true }).click();
	await card.getByRole('button', { name: 'Löschen bestätigen', exact: true }).click();
	await expect(card.getByRole('status')).toHaveText('Anlage gelöscht.');
	await page.reload();
	await expect(card.getByRole('link')).toHaveCount(2);
});

test('attachment API enforces ownership, document binding, revisions and private download headers', async ({
	page,
	browser
}) => {
	const { id, otherId, noteId } = await fixture(page);
	const endpoint = `/api/documents/${id}/attachments`;
	const upload = await page.request.post(endpoint, {
		headers: { origin: new URL(page.url()).origin },
		multipart: { revision: '1', file: pdf }
	});
	expect(upload.status()).toBe(201);
	const result = await upload.json();
	const attachmentId = result.attachments[0].id;
	expect(result.attachments[0]).not.toHaveProperty('content');
	const url = `${endpoint}/${attachmentId}`;
	const download = await page.request.get(url);
	expect(download.headers()['cache-control']).toBe('private, no-store');
	expect(download.headers()['x-content-type-options']).toBe('nosniff');
	expect(download.headers()['content-disposition']).toContain('attachment;');
	expect(download.headers()['content-security-policy']).toContain('sandbox');
	expect(await download.body()).toEqual(pdf.buffer);
	expect((await page.request.delete(`${url}?revision=1`)).status()).toBe(409);
	expect(
		(
			await page.request.post(endpoint, {
				headers: { origin: new URL(page.url()).origin },
				multipart: { revision: '1', file: image }
			})
		).status()
	).toBe(409);
	expect(
		(await page.request.get(`/api/documents/${otherId}/attachments/${attachmentId}`)).status()
	).toBe(404);
	expect(
		(
			await page.request.delete(`/api/documents/${otherId}/attachments/${attachmentId}?revision=1`)
		).status()
	).toBe(404);
	expect(
		(
			await page.request.post(`/api/documents/${noteId}/attachments`, {
				headers: { origin: new URL(page.url()).origin },
				multipart: { revision: '1', file: image }
			})
		).status()
	).toBe(404);
	expect(
		(
			await page.request.post(endpoint, {
				headers: { origin: new URL(page.url()).origin },
				multipart: { revision: '2', file: { ...pdf, buffer: Buffer.alloc(0) } }
			})
		).status()
	).toBe(400);
	const foreign = await browser.newContext({ baseURL: new URL(page.url()).origin });
	try {
		expect((await foreign.request.get(url)).status()).toBe(401);
		const admin = await foreign.newPage();
		await login(admin, 'admin@example.com', 'seed-admin-password');
		expect((await foreign.request.get(endpoint)).status()).toBe(404);
		expect((await foreign.request.get(url)).status()).toBe(404);
		expect(
			(
				await foreign.request.post(endpoint, {
					headers: { origin: new URL(page.url()).origin },
					multipart: { revision: '2', file: image }
				})
			).status()
		).toBe(404);
		expect((await foreign.request.delete(`${url}?revision=2`)).status()).toBe(404);
	} finally {
		await foreign.close();
	}
	expect((await page.request.delete(`${url}?revision=2`)).status()).toBe(200);
	expect((await page.request.get(url)).status()).toBe(404);
});
