import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SEED_DOCUMENT_IDS, SEED_READER } from '../scripts/seed-fixtures.ts';
import { registerWithPassword } from './lib/auth.ts';

const exec = promisify(execFile);
const password = 'ein-sicheres-passwort';
const pseudonym = 'Mara Beispiel';
const noteText = 'Eine Notiz für die PDF-Ausgabe.';

async function login(page: Page, account: { email: string; password: string }) {
	await page.goto('/login?redirectTo=%2Faccount');
	await page.getByLabel('E-Mail-Adresse').fill(account.email);
	await page.getByRole('button', { name: 'Weiter', exact: true }).click();
	await page.getByLabel('Passwort', { exact: true }).fill(account.password);
	await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
	await expect(page).toHaveURL('/account');
}

async function readPdf(page: Page, url: string) {
	const response = await page.request.get(url, { maxRedirects: 0 });
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('application/pdf');
	expect(response.headers()['cache-control']).toBe('private, no-store');
	expect(response.headers()['content-disposition']).toMatch(/^attachment;.*\.pdf/);

	const directory = await mkdtemp(join(tmpdir(), 'akribos-pdf-e2e-'));
	try {
		const file = join(directory, 'export.pdf');
		await writeFile(file, await response.body());
		const [{ stdout: text }, { stdout: metadata }] = await Promise.all([
			exec('pdftotext', ['-layout', file, '-']),
			exec('pdfinfo', [file])
		]);
		return {
			text,
			footer: text.trimEnd().split('\n').at(-1)?.trim(),
			author: /^Author:[\t ]*(.*)$/m.exec(metadata)?.[1]?.trim()
		};
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function saveTemplate(page: Page, template: 'buchsatz' | 'lesemanuskript') {
	const form = page.locator('form').filter({ has: page.getByLabel('PDF-Vorlage') });
	await form.getByLabel('PDF-Vorlage').selectOption(template);
	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			new URL(response.url()).searchParams.has('/pdfExport')
	);
	await form.getByRole('button', { name: 'Speichern', exact: true }).click();
	expect((await saved).status()).toBe(200);
	await expect(form.getByRole('status')).toContainText('Gespeichert');
}

test('PDF export follows the account template and the chosen display name across sessions', async ({
	page,
	browser,
	baseURL
}) => {
	test.slow();
	const email = `pdf-export-${randomUUID()}@example.com`;
	await registerWithPassword(page, email, password, '');
	await page.getByRole('button', { name: 'PDF-Export', exact: true }).click();
	await expect(page.getByLabel('PDF-Vorlage')).toHaveValue('studienausgabe');

	await page.goto('/notes');
	await page.getByRole('button', { name: 'Neue Notiz', exact: true }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
	const documentPath = new URL(page.url()).pathname;
	const exportPath = `${documentPath}/export.pdf`;
	await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
	const savedNote = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			new URL(response.url()).pathname === `/api/documents/${documentPath.split('/').at(-1)}`
	);
	await page.getByRole('textbox', { name: 'Markdown', exact: true }).fill(noteText);
	expect((await savedNote).status()).toBe(200);

	const study = await readPdf(page, exportPath);
	expect(study.text).toContain(noteText);
	expect(study.text).toContain('AKRIBOS');
	expect(study.footer).toMatch(/^akribos\.de\s+1$/);
	expect(study.author).toBeUndefined();
	expect(study.text).not.toContain(email);

	await page.goto('/account');
	const profile = page.locator('form[action="?/profile"]');
	await profile.getByLabel('Anzeigename').fill(pseudonym);
	await profile.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(profile.getByRole('status')).toBeVisible();
	await page.getByRole('button', { name: 'PDF-Export', exact: true }).click();
	await saveTemplate(page, 'buchsatz');

	const book = await readPdf(page, exportPath);
	expect(book.text).toContain(noteText);
	expect(book.text).not.toContain('AKRIBOS');
	expect(book.text).not.toContain('akribos.de');
	expect(book.footer).toMatch(/^Mara Beispiel\s+1$/);
	expect(book.author).toBe(pseudonym);

	await saveTemplate(page, 'lesemanuskript');
	const badTemplate = await page.request.post('/account?/pdfExport', {
		headers: { accept: 'text/html', origin: new URL(page.url()).origin },
		form: { pdfTemplate: 'unbekannt' }
	});
	expect(badTemplate.status()).toBe(400);

	const fresh = await browser.newContext({ baseURL });
	try {
		const secondPage = await fresh.newPage();
		await login(secondPage, { email, password });
		await secondPage.getByRole('button', { name: 'PDF-Export', exact: true }).click();
		await expect(secondPage.getByLabel('PDF-Vorlage')).toHaveValue('lesemanuskript');
		const manuscript = await readPdf(secondPage, exportPath);
		expect(manuscript.text).toContain(noteText);
		expect(manuscript.text).not.toContain('AKRIBOS');
		expect(manuscript.footer).toMatch(/^Mara Beispiel · akribos\.de\s+1$/);
		expect(manuscript.author).toBe(pseudonym);
		expect(manuscript.text).not.toContain(email);
	} finally {
		await fresh.close();
	}
});

test('an existing account has the default PDF template and exports only its own documents', async ({
	page,
	request
}) => {
	const ownedPath = `/notes/${SEED_DOCUMENT_IDS.privateNote}/export.pdf`;
	const anonymous = await request.get(ownedPath, { maxRedirects: 0 });
	expect(anonymous.status()).toBe(303);
	expect(anonymous.headers()['location']).toBe(
		`/login?redirectTo=${encodeURIComponent(ownedPath)}`
	);

	await login(page, SEED_READER);
	await page.getByRole('button', { name: 'PDF-Export', exact: true }).click();
	await expect(page.getByLabel('PDF-Vorlage')).toHaveValue('studienausgabe');
	const owned = await readPdf(page, ownedPath);
	expect(owned.text).toContain('AKRIBOS');
	const foreign = await page.request.get(`/notes/${SEED_DOCUMENT_IDS.publishedNote}/export.pdf`);
	expect(foreign.status()).toBe(404);
	expect(foreign.headers()['content-type']).not.toBe('application/pdf');
});
