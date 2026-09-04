/** Capture the review screenshots from a running, seeded local application. */

import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { SEED_ADMIN, SEED_DOCUMENT_IDS, SEED_READER } from './seed-fixtures.ts';

const baseUrl = (process.env.AKRIBOS_PREVIEW_URL ?? 'http://localhost:5173').replace(/\/$/u, '');
const outputDirectory = new URL('../docs/screenshots/unified-notes/', import.meta.url);

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
	await page.goto(`${baseUrl}/login`);
	await page.getByLabel('E-Mail-Adresse').fill(account.email);
	await page.getByLabel('Passwort').fill(account.password);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await page.waitForURL((url) => url.pathname !== '/login');
	// A product tour would obscure the reader screenshot; completing it is harmless seed-account state.
	await page.evaluate(() => fetch('/api/tour', { method: 'POST' }));
}

async function capture(page: Page, filename: string, fullPage = true): Promise<void> {
	await page.evaluate(async () => {
		if ('fonts' in document) await document.fonts.ready;
	});
	await page.screenshot({
		path: new URL(filename, outputDirectory).pathname,
		fullPage,
		animations: 'disabled',
		caret: 'hide'
	});
}

async function openLayoutMenuAfterHydration(page: Page): Promise<void> {
	const trigger = page.getByTestId('layout-picker');
	const menu = page.getByRole('menu', { name: 'Kachelanordnung' });
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (await menu.isVisible()) return;
		await trigger.click();
		await menu.waitFor({ state: 'visible', timeout: 500 }).catch(() => undefined);
		if (await menu.isVisible()) return;
		await page.waitForTimeout(100);
	}
	throw new Error('Reader layout menu did not hydrate');
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
	const readerContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
	const readerPage = await readerContext.newPage();
	await signIn(readerPage, SEED_READER);

	await readerPage.goto(`${baseUrl}/notes`);
	await readerPage.getByTestId('notes-library').waitFor();
	await capture(readerPage, 'notes-library-desktop.png');

	await readerPage.goto(`${baseUrl}/notes/${SEED_DOCUMENT_IDS.privateNote}`);
	await readerPage.getByTestId('document-editor').waitFor();
	await readerPage.getByRole('textbox', { name: 'Schreibe deine Gedanken …' }).waitFor();
	await readerPage.getByText('Gottes Liebe in Johannes 3').waitFor();
	await capture(readerPage, 'document-editor.png');

	await readerPage.goto(`${baseUrl}/Joh3,16`);
	// Prove client hydration before clicking a verse-number link. Without this handshake a cold dev
	// server can still be compiling, and the link's normal navigation wins before Svelte attaches its
	// menu handler.
	await openLayoutMenuAfterHydration(readerPage);
	const layoutMenu = readerPage.getByRole('menu', { name: 'Kachelanordnung' });
	await readerPage.keyboard.press('Escape');
	await layoutMenu.waitFor({ state: 'hidden' });
	// The demo account may retain a previously customised workspace order; address the seeded Bible
	// explicitly instead of assuming the first visible resource is a Bible.
	const readerBible = readerPage.locator('.flow-column[data-resource-id="SEEDDE"]').first();
	await readerBible.locator('a.verse-number', { hasText: /^16$/ }).click();
	await readerPage.getByRole('menuitem', { name: /Notizen zu Johannes 3,16 öffnen/ }).click();
	await readerPage.getByTestId('reader-notes-panel').waitFor();
	await capture(readerPage, 'reader-notes-panel.png', false);
	await readerPage.keyboard.press('Escape');
	await readerPage.getByTestId('reader-notes-panel').waitFor({ state: 'hidden' });

	const readerIndicator = readerBible
		.getByRole('button', { name: /Notizen zu Joh 3,16 öffnen/ })
		.first();
	await readerIndicator.waitFor();
	await readerIndicator.click();
	const readerSidecar = readerPage.getByTestId('reader-notes-sidecar');
	await readerSidecar.waitFor();
	await readerSidecar.getByTestId('reader-notes-sidecar-context').waitFor();
	await readerSidecar
		.getByTestId('reader-notes-open-document')
		.filter({ hasText: 'Gebet und Antwort' })
		.click();
	await readerSidecar.getByTestId('reader-notes-sidecar-editor').waitFor();
	await capture(readerPage, 'reader-notes-sidecar-desktop.png', false);

	await readerPage.goto(`${baseUrl}/sermons`);
	await readerPage.getByTestId('sermon-manager').waitFor();
	await capture(readerPage, 'sermon-manager.png');

	await readerPage.goto(`${baseUrl}/notes/import`);
	await readerPage.getByLabel('Markdown-Datei').setInputFiles({
		name: 'obsidian-demo.md',
		mimeType: 'text/markdown',
		buffer: Buffer.from(`---
title: Hoffnung aus Römer 8
type: note
tags:
  - Bibelstudium/Hoffnung
passages:
  - reference: Joh 3,16-17
---
## Getragen

Ein sicher importierter **Obsidian-Entwurf** mit [[Gnade|einem internen Link]].
`)
	});
	await readerPage.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	const importPreview = readerPage.getByTestId('import-preview');
	await importPreview.waitFor();
	await importPreview.locator('p').filter({ hasText: 'Ein sicher importierter' }).waitFor();
	await capture(readerPage, 'obsidian-import-preview.png');
	await readerContext.close();

	const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const mobilePage = await mobileContext.newPage();
	await signIn(mobilePage, SEED_READER);
	await mobilePage.goto(`${baseUrl}/notes`);
	await mobilePage.getByTestId('notes-library').waitFor();
	await capture(mobilePage, 'mobile-notes-view.png', false);
	await mobilePage.goto(`${baseUrl}/Joh3,16`);
	await openLayoutMenuAfterHydration(mobilePage);
	await mobilePage.getByTestId('reader-notes-sidecar-toggle').click();
	const mobileSidecar = mobilePage.getByTestId('reader-notes-sidecar');
	await mobileSidecar.waitFor();
	await mobileSidecar.getByTestId('reader-notes-sidecar-context').waitFor();
	await mobileSidecar
		.getByTestId('reader-notes-open-document')
		.filter({ hasText: 'Gebet und Antwort' })
		.click();
	await mobileSidecar.getByTestId('reader-notes-sidecar-editor').waitFor();
	await capture(mobilePage, 'reader-notes-sidecar-mobile.png', false);
	await mobileContext.close();

	const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
	const adminPage = await adminContext.newPage();
	await signIn(adminPage, SEED_ADMIN);
	await adminPage.goto(`${baseUrl}/notes/${SEED_DOCUMENT_IDS.article}`);
	await adminPage.getByTestId('publication-controls').waitFor();
	await adminPage.getByRole('textbox', { name: 'Schreibe deine Gedanken …' }).waitFor();
	await capture(adminPage, 'publication-controls.png');
	await adminContext.close();

	const publicContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
	const publicPage = await publicContext.newPage();
	await publicPage.goto(`${baseUrl}/articles/demo-gnade-die-traegt`);
	await publicPage.getByTestId('public-article').waitFor();
	await publicPage.getByText('Dieser Absatz ist der veröffentlichte Demo-Stand.').waitFor();
	await capture(publicPage, 'public-article.png');
	await publicContext.close();
} finally {
	await browser.close();
}

console.log(`Captured unified-notes screenshots in ${outputDirectory.pathname}`);
