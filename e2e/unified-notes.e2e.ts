import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { lastMailLinkTo } from './lib/mail-outbox';

const PASSWORD = 'ein-sicheres-passwort';

function uniqueEmail(): string {
	return `e2e-reader-note-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function register(page: import('@playwright/test').Page): Promise<void> {
	const email = uniqueEmail();
	await page.goto('/register');
	await page.getByLabel('E-Mail-Adresse').fill(email);
	await page.getByLabel('Anzeigename').fill('Reader Notes E2E');
	await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
	await page.getByLabel('Passwort wiederholen').fill(PASSWORD);
	await page.getByRole('button', { name: 'Konto erstellen' }).click();
	await page.goto(await lastMailLinkTo(email));
	await page.getByRole('button', { name: 'Konto aktivieren' }).click();
	await page.evaluate(() => fetch('/api/tour', { method: 'POST' }));
}

test('a reader verse creates and reopens a translation-specific unified note', async ({ page }) => {
	await register(page);
	await page.goto('/Joh3,16');
	const title = `Kontextnotiz aus dem Reader ${RUN_ID}`;
	const bodyMarker = `sidecar-autosave-${RUN_ID}`;

	const firstBible = page.locator('.flow-column[data-resource-id]').first();
	await firstBible.locator('a.verse-number', { hasText: /^16$/ }).click();
	await page.getByRole('menuitem', { name: /Notizen zu Johannes 3,16 öffnen/ }).click();

	const panel = page.getByTestId('reader-notes-panel');
	await expect(panel).toBeVisible();
	await expect(panel).toContainText('Zu dieser Stelle gibt es noch keine Notiz.');
	await expect(panel.getByLabel('Übersetzungsbezug')).toHaveValue(/.+/);

	const readerUrl = page.url();
	await panel.getByRole('button', { name: 'Notiz zu Johannes 3,16 erstellen' }).click();
	await expect(page).toHaveURL(readerUrl);

	let sidecar = page.getByTestId('reader-notes-sidecar');
	await expect(sidecar).toBeVisible();
	await expect(sidecar.getByTestId('reader-notes-sidecar-editor')).toBeVisible();
	await sidecar.getByTestId('reader-notes-sidecar-title').fill(title);
	await sidecar.getByRole('tab', { name: 'Markdown' }).click();
	const body = sidecar.getByTestId('reader-notes-sidecar-body-markdown');
	const save = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			/\/api\/documents\/[0-9a-f-]+$/.test(response.url()) &&
			(response.request().postData()?.includes(bodyMarker) ?? false)
	);
	await body.fill(`## Beobachtung\n\n${bodyMarker}\n`);
	expect((await save).ok()).toBe(true);
	await expect(sidecar.getByTestId('reader-notes-sidecar-save-status')).toHaveText('Gespeichert');

	const fullEditorHref = await sidecar
		.getByRole('link', { name: 'Im vollständigen Notiz-Editor öffnen' })
		.getAttribute('href');
	expect(fullEditorHref).toMatch(/^\/notes\/[0-9a-f-]+$/);
	const documentId = fullEditorHref!.split('/').at(-1)!;
	const detail = await page.evaluate(async (id) => {
		const response = await fetch(`/api/v1/documents/${id}`);
		return { status: response.status, body: await response.json() };
	}, documentId);
	expect(detail.status).toBe(200);
	expect(detail.body).toMatchObject({
		id: documentId,
		title,
		passages: [expect.objectContaining({ resourceId: 'SEEDDE' })]
	});

	// Creating from the Reader updates the current chapter immediately; no reload is needed before
	// the contextual indicator can reopen the new working copy.
	await sidecar.getByRole('button', { name: 'Notizbereich schließen' }).click();
	await expect(sidecar).toBeHidden();
	const indicator = page
		.locator('.flow-column[data-resource-id]')
		.first()
		.getByRole('button', { name: /Notizen zu Joh 3,16 öffnen/ });
	await expect(indicator).toBeVisible();
	await indicator.click();
	await expect(sidecar.getByTestId('reader-notes-sidecar-title')).toHaveValue(title);

	// The device-local sidecar preference survives a reload, while its private document id does not.
	// The freshly loaded passage context finds the one owned note and opens it again.
	await page.reload();
	sidecar = page.getByTestId('reader-notes-sidecar');
	await expect(sidecar.getByTestId('reader-notes-sidecar-title')).toHaveValue(title);
	await sidecar.getByRole('tab', { name: 'Markdown' }).click();
	await expect(sidecar.getByTestId('reader-notes-sidecar-body-markdown')).toHaveValue(
		new RegExp(bodyMarker)
	);
	await expect(sidecar).not.toContainText('Gebet und Antwort');

	// The layout menu controls the independent note column without changing the Reader URL.
	await page.getByTestId('layout-picker').click();
	let toggle = page.getByTestId('reader-notes-sidecar-toggle');
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await toggle.click();
	await expect(sidecar).toBeHidden();
	await expect(page).toHaveURL(readerUrl);

	await page.getByTestId('layout-picker').click();
	toggle = page.getByTestId('reader-notes-sidecar-toggle');
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await toggle.click();
	await expect(sidecar.getByTestId('reader-notes-sidecar-title')).toHaveValue(title);

	await sidecar.getByRole('button', { name: 'Notizbereich schließen' }).click();
	await expect(sidecar).toBeHidden();
	await expect(indicator).toBeVisible();
	await indicator.click();
	await expect(sidecar.getByTestId('reader-notes-sidecar-title')).toHaveValue(title);

	// On phones the notes workspace is a dedicated peer view rather than a squeezed desktop column.
	await page.setViewportSize({ width: 390, height: 844 });
	const notesView = page.getByTestId('reader-mobile-notes-view');
	const readingView = page.getByTestId('reader-mobile-reading-view');
	await readingView.focus();
	await expect(readingView).toBeFocused();
	await expect(readingView).toHaveAttribute('aria-selected', 'true');
	await readingView.press('ArrowRight');
	await expect(notesView).toBeFocused();
	await expect(notesView).toHaveAttribute('aria-selected', 'true');
	await expect(sidecar).toBeVisible();
	await expect(sidecar.getByTestId('reader-notes-sidecar-title')).toHaveValue(title);

	await notesView.press('Home');
	await expect(readingView).toBeFocused();
	await expect(readingView).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByTestId('flow-reader')).toBeVisible();
	await expect(sidecar).toBeHidden();

	await readingView.press('End');
	await expect(notesView).toBeFocused();
	await expect(notesView).toHaveAttribute('aria-selected', 'true');
	await expect(sidecar).toBeVisible();
});

const SEED_READER = {
	email: 'reader@example.com',
	password: 'seed-reader-password'
};
const SEED_ADMIN = {
	email: 'admin@example.com',
	password: 'seed-admin-password'
};
const SEED_PRIVATE_NOTE_ID = '5eed0000-0000-4000-8000-000000000001';
const SEED_TRANSLATION_NOTE_ID = '5eed0000-0000-4000-8000-000000000003';
const SEED_ADMIN_ARTICLE_ID = '5eed0000-0000-4000-8000-000000000005';
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NORMAL_PRIVATE_ARTICLE_TITLE = `Privater Leserartikel ${RUN_ID}`;
const MATTHEW_PREVIEW_TEXT =
	'Er hat die Worfschaufel in seiner Hand und wird seine Tenne gründlich reinigen.';

function waitForMatthewChapter(page: import('@playwright/test').Page) {
	return page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/v1/bibles/SEEDDE/40/3'
	);
}

async function loginAs(
	page: import('@playwright/test').Page,
	account: { email: string; password: string }
): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('E-Mail-Adresse').fill(account.email);
	await page.getByLabel('Passwort').fill(account.password);
	await page.getByRole('button', { name: 'Anmelden' }).click();
	await expect(page).toHaveURL(/\/account$/);
}

async function createDocumentFromLibrary(
	page: import('@playwright/test').Page,
	kind: 'Notiz' | 'Artikel'
): Promise<string> {
	await page.goto('/notes');
	const label = kind === 'Artikel' ? 'Neuer Artikel' : 'Neue Notiz';
	await page.getByRole('button', { name: label, exact: true }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+(?:\?|$)/);
	return new URL(page.url()).pathname.split('/').at(-1)!;
}

async function saveMarkdownDocument(
	page: import('@playwright/test').Page,
	input: { title: string; markdown: string; requestMarker: string }
): Promise<void> {
	await page.getByLabel('Titel').fill(input.title);
	await page.getByRole('tab', { name: 'Markdown' }).click();
	const markdown = page.getByRole('textbox', { name: 'Markdown' });
	await markdown.fill(input.markdown);

	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			/\/api\/documents\/[0-9a-f-]+$/.test(response.url()) &&
			(response.request().postData()?.includes(input.requestMarker) ?? false)
	);
	await markdown.press('Control+s');
	expect((await saved).ok()).toBe(true);
	await expect(page.getByTestId('document-editor').locator('.save-status')).toHaveText(
		'Gespeichert'
	);
}

test('private workspaces enforce authentication and owner-scoped not-found responses', async ({
	page
}) => {
	await page.goto('/notes');
	await expect(page).toHaveURL(/\/login\?redirectTo=%2Fnotes$/);

	await loginAs(page, SEED_READER);
	const privateResponse = await page.goto('/notes');
	expect(privateResponse?.headers()['cache-control']).toContain('private');
	expect(privateResponse?.headers()['cache-control']).toContain('no-store');

	const malformed = await page.goto('/notes/not-a-document-id');
	expect(malformed?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible();

	const foreign = await page.goto(`/notes/${SEED_ADMIN_ARTICLE_ID}`);
	expect(foreign?.status()).toBe(404);
	await expect(page.getByText('Dokument nicht gefunden')).toBeVisible();

	const internalForeign = await page.evaluate(async (id) => {
		const response = await fetch(`/api/documents/${id}`);
		return {
			status: response.status,
			cache: response.headers.get('cache-control'),
			body: await response.json()
		};
	}, SEED_ADMIN_ARTICLE_ID);
	expect(internalForeign).toMatchObject({
		status: 404,
		cache: 'private, no-store',
		body: { error: 'notFound' }
	});
});

test('the note library exposes seeded tags, legacy notes and inclusive passage-overlap filters', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	await page.goto('/notes');

	await expect(page.getByRole('heading', { name: 'Notizen' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Schöpfung und Ruhe' })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Wortwahl in der Testübersetzung' })
	).toBeVisible();
	await expect(page.getByText('Aus Verskommentar übernommen')).toBeVisible();

	await page.getByRole('link', { name: 'Johannes', exact: true }).click();
	await expect(page).toHaveURL(/tag=Bibelstudium%2FJohannes/);
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Geliebt und gesandt' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Schöpfung und Ruhe' })).toHaveCount(0);

	// The seeded range starts in Genesis 1 and ends in Genesis 2. A point strictly inside its
	// second chapter must still match the inclusive overlap query.
	await page.goto('/notes?passage=1Mo+2%2C1');
	await expect(page.getByRole('heading', { name: 'Schöpfung und Ruhe' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toHaveCount(0);

	await page.goto('/notes?passage=Joh+3%2C16&resource=canonical');
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Wortwahl in der Testübersetzung' })).toHaveCount(
		0
	);

	await page.goto('/notes?passage=Joh+3%2C16&resource=SEEDDE');
	await expect(
		page.getByRole('heading', { name: 'Wortwahl in der Testübersetzung' })
	).toBeVisible();
	// Canonical anchors apply to every translation; choosing one translation adds its specific
	// anchors rather than hiding canon-wide notes.
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toBeVisible();

	await page.goto(`/notes/${SEED_TRANSLATION_NOTE_ID}`);
	await expect(page.getByText('Nur Testübersetzung', { exact: true })).toBeVisible();
});

test('a private note links inline Bible references and previews real text by hover and focus', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	await page.goto(`/notes/${SEED_PRIVATE_NOTE_ID}`);

	const reference = page.locator(
		'[data-testid="document-editor"] a.bible-reference.verse-ref[data-reference="Mt3,12"]'
	);
	await expect(reference).toHaveText('Mt 3,12');
	await expect(reference).toHaveAttribute('href', '/Mt3,12');

	const responsePromise = waitForMatthewChapter(page);
	await reference.hover();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toBe('private, no-store');
	const payload = await response.json();
	expect(payload).toMatchObject({ bible: 'SEEDDE', book: 40, chapter: 3 });
	expect(payload.verses).toEqual(expect.arrayContaining([expect.objectContaining({ verse: 12 })]));
	expect(JSON.stringify(payload.verses)).toContain('Worfschaufel');

	const preview = page.getByTestId('bible-reference-preview');
	await expect(preview).toHaveAttribute('role', 'tooltip');
	await expect(preview).toContainText('Matthäus 3,12');
	await expect(preview).toContainText(MATTHEW_PREVIEW_TEXT);
	const previewId = await preview.getAttribute('id');
	expect(previewId).toBeTruthy();
	await expect(reference).toHaveAttribute('aria-describedby', previewId!);

	await page.mouse.move(0, 0);
	await expect(preview).toBeHidden();
	await reference.focus();
	await expect(reference).toBeFocused();
	await expect(preview).toContainText(MATTHEW_PREVIEW_TEXT);
	await page.keyboard.press('Escape');
	await expect(preview).toBeHidden();
	await expect(reference).toBeFocused();

	// Runtime decorations must not alter the portable Markdown stored for the private document.
	await page.getByRole('tab', { name: 'Markdown' }).click();
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(/Mt 3,12/);
	await expect(page.getByRole('textbox', { name: 'Markdown' })).not.toHaveValue(/\/Mt3,12/);

	// The non-persisted ProseMirror decoration is still a real link, not a tooltip-only affordance.
	await page.getByRole('tab', { name: 'Visuell' }).click();
	await reference.click();
	await expect(page).toHaveURL((url) => url.pathname === '/Mt3,12');
	await expect(page.locator('[data-verse-key="40:3:12"]').first()).toContainText('Worfschaufel');
});

test('a public article exposes inline references to keyboard users with public previews', async ({
	page
}) => {
	await page.goto('/articles/demo-gnade-die-traegt');

	const article = page.getByTestId('public-article');
	const reference = article.locator('a.bible-reference.verse-ref[data-reference="Mt3,12"]');
	await expect(reference).toHaveText('Mt 3,12');
	await expect(reference).toHaveAttribute('href', '/Mt3,12');

	const responsePromise = waitForMatthewChapter(page);
	await article.locator('a.article-chip').first().focus();
	await page.keyboard.press('Tab');
	await expect(reference).toBeFocused();
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	expect(response.headers()['cache-control']).toContain('public');
	const payload = await response.json();
	expect(payload).toMatchObject({ bible: 'SEEDDE', book: 40, chapter: 3 });
	expect(payload.verses).toEqual(expect.arrayContaining([expect.objectContaining({ verse: 12 })]));
	expect(JSON.stringify(payload.verses)).toContain('Worfschaufel');

	const preview = page.getByRole('tooltip');
	await expect(preview).toContainText('Matthäus 3,12');
	await expect(preview).toContainText(MATTHEW_PREVIEW_TEXT);
	await page.keyboard.press('Escape');
	await expect(preview).toBeHidden();
	await expect(reference).toBeFocused();

	await article.locator('a.article-chip').first().focus();
	await reference.hover();
	await expect(preview).toContainText(MATTHEW_PREVIEW_TEXT);
	await page.mouse.move(0, 0);
	await expect(preview).toBeHidden();
});

test('a note autosaves, switches Markdown modes, adds cross-chapter anchors and exports YAML', async ({
	page
}) => {
	test.slow();
	await loginAs(page, SEED_READER);
	const id = await createDocumentFromLibrary(page, 'Notiz');
	const title = `Rundreise-Notiz ${RUN_ID}`;
	const bodyMarker = `roundtrip-${RUN_ID}`;
	const markdown = `## Beobachtung\n\nEin **wichtiger** Gedanke mit Marker \`${bodyMarker}\`.\n`;
	const nestedTagLeaf = `Rundreise-${RUN_ID}`;
	const nestedTagPath = `E2E/${nestedTagLeaf}`;

	await saveMarkdownDocument(page, { title, markdown, requestMarker: bodyMarker });

	// Ctrl/Cmd+M is the documented keyboard path between portable Markdown and the visual editor.
	await page.getByRole('textbox', { name: 'Markdown' }).press('Control+m');
	await expect(page.getByRole('tab', { name: 'Visuell' })).toHaveAttribute('aria-selected', 'true');
	const visualEditor = page.getByRole('textbox', { name: 'Schreibe deine Gedanken …' });
	await expect(visualEditor.getByRole('heading', { name: 'Beobachtung' })).toBeVisible();
	await expect(visualEditor.locator('strong')).toHaveText('wichtiger');

	await visualEditor.press('Control+m');
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(markdown);

	const tags = page.getByPlaceholder('Theologie/Gnade, Predigt/Entwurf');
	await tags.fill(nestedTagPath);
	await page.getByRole('button', { name: 'Schlagwörter speichern' }).click();
	await expect(tags).toHaveValue(nestedTagPath);

	await page.getByPlaceholder(/z\. B\. Joh 3,16-18/).fill('1Mo 1,3-2,2');
	await page.getByLabel('Übersetzungsbezug').selectOption('');
	await page.getByRole('button', { name: 'Bibelstelle hinzufügen' }).click();
	const canonicalPassage = page.getByRole('listitem').filter({ hasText: '1Mo 1,3-2,2' });
	await expect(canonicalPassage.getByRole('link', { name: '1Mo 1,3-2,2' })).toBeVisible();
	await expect(canonicalPassage.getByText('Für alle Übersetzungen', { exact: true })).toBeVisible();

	await page.getByPlaceholder(/z\. B\. Joh 3,16-18/).fill('Joh 3,16-17');
	await page.getByLabel('Übersetzungsbezug').selectOption('SEEDDE');
	await page.getByRole('button', { name: 'Bibelstelle hinzufügen' }).click();
	await expect(page.getByRole('link', { name: 'Joh 3,16-17' })).toBeVisible();
	await expect(page.getByText('Nur Testübersetzung', { exact: true })).toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Exportieren', exact: true }).first().click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/\.md$/);
	const downloadPath = await download.path();
	expect(downloadPath).not.toBeNull();
	const exported = await readFile(downloadPath!, 'utf8');
	expect(exported).toContain(`title: ${title}`);
	expect(exported).toContain('type: note');
	expect(exported).toContain('reference: 1Mo 1,3-2,2');
	expect(exported).toContain('reference: Joh 3,16-17');
	expect(exported).toContain('resource: SEEDDE');
	expect(exported).toContain(nestedTagPath);
	expect(exported).toContain(bodyMarker);
	expect(exported).not.toContain(id);
	expect(exported).not.toContain(SEED_READER.email);

	await page.reload();
	await expect(page.getByLabel('Titel')).toHaveValue(title);
	await page.getByRole('tab', { name: 'Markdown' }).click();
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(markdown);

	await page.goto('/notes');
	await page
		.getByRole('navigation', { name: 'Schlagwörter' })
		.getByRole('link', { name: nestedTagLeaf, exact: true })
		.click();
	await expect(page).toHaveURL((url) => url.searchParams.get('tag') === nestedTagPath);
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toHaveCount(0);
});

test('Obsidian import previews without writes and confirms only a sanitised private document', async ({
	page
}) => {
	test.slow();
	await loginAs(page, SEED_READER);
	const title = `Sicherer Obsidian-Import ${RUN_ID}`;
	const source = `---
title: ${title}
type: note
tags:
  - E2E/Import
passages:
  - reference: Joh 3,16-17
    resource: SEEDDE
visibility: public
ownerId: forged-owner
---
# Importierter Inhalt

Ein Link zu [[Gebet und Antwort|einer anderen Notiz]].

![[geheimes-bild.png]]

<script>globalThis.__unsafeImport = true</script>
`;

	await page.goto('/notes/import');
	await page.getByLabel('Markdown-Datei').setInputFiles({
		name: `obsidian-${RUN_ID}.md`,
		mimeType: 'text/markdown',
		buffer: Buffer.from(source)
	});
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();

	const preview = page.getByTestId('import-preview');
	await expect(preview).toBeVisible();
	await expect(preview.getByRole('heading', { name: title })).toBeVisible();
	await expect(preview).toContainText('Privat');
	await expect(preview).toContainText(
		'Importe können weder Eigentum noch Veröffentlichungsstatus setzen'
	);
	await expect(preview).toContainText('Eine Obsidian-Einbettung wurde beim Import entfernt.');
	await expect(preview.locator('script, img')).toHaveCount(0);
	await expect(preview.getByRole('link', { name: 'einer anderen Notiz' })).toHaveAttribute(
		'href',
		/Gebet%20und%20Antwort/
	);

	const beforeConfirm = await page.evaluate(async (query) => {
		const response = await fetch(`/api/v1/documents?q=${encodeURIComponent(query)}`);
		return (await response.json()).documents as Array<{ id: string }>;
	}, title);
	expect(beforeConfirm).toEqual([]);

	await page.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
	const id = new URL(page.url()).pathname.split('/').at(-1)!;
	await expect(page.getByLabel('Titel')).toHaveValue(title);
	await expect(page.getByText('Aus Obsidian importiert')).toBeVisible();
	await expect(page.getByText('Nur Testübersetzung', { exact: true })).toBeVisible();

	const imported = await page.evaluate(async (documentId) => {
		const response = await fetch(`/api/v1/documents/${documentId}`);
		return {
			status: response.status,
			cache: response.headers.get('cache-control'),
			body: await response.json()
		};
	}, id);
	expect(imported.status).toBe(200);
	expect(imported.cache).toBe('private, no-store');
	expect(imported.body).toMatchObject({
		kind: 'note',
		visibility: 'private',
		source: 'obsidian',
		tags: ['E2E/Import'],
		passages: [
			{
				resourceId: 'SEEDDE',
				start: { book: 43, chapter: 3, verse: 16 },
				end: { book: 43, chapter: 3, verse: 17 }
			}
		]
	});
	expect(imported.body.bodyHtml).not.toContain('<script');
	expect(imported.body.bodyMarkdown).not.toContain('geheimes-bild.png');
});

test('the sermon manager creates from its template and persists workflow metadata', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	const title = `Predigtablauf ${RUN_ID}`;
	await page.goto('/sermons');
	await expect(page.getByRole('heading', { name: 'Geliebt und gesandt' })).toBeVisible();

	await page.getByLabel('Titel').fill(title);
	await page.getByRole('textbox', { name: 'Bibelstelle', exact: true }).fill('Joh 3,16-17');
	await page.getByLabel('Predigtreihe').fill('E2E-Reihe');
	await page.getByLabel('Predigttermin').fill('2026-12-24');
	await page.getByRole('button', { name: 'Erstellen' }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+\?returnTo=%2Fsermons$/);
	await expect(page.getByRole('link', { name: 'Zur Predigtvorbereitung' })).toHaveAttribute(
		'href',
		'/sermons'
	);

	await page.getByRole('tab', { name: 'Markdown' }).click();
	const markdown = page.getByRole('textbox', { name: 'Markdown' });
	await expect(markdown).toHaveValue(/## Bibeltext/);
	await expect(markdown).toHaveValue(/## Kerngedanke/);
	await expect(markdown).toHaveValue(/## Gliederung/);
	await expect(page.getByRole('link', { name: 'Joh 3,16-17' })).toBeVisible();

	const workflow = page.getByTestId('sermon-workflow');
	await workflow.getByLabel('Arbeitsstand').selectOption('research');
	await workflow.getByLabel('Predigttermin').fill('2027-01-03');
	await workflow.getByLabel('Predigtreihe').fill('E2E-Reihe aktualisiert');
	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			(response.request().postData()?.includes('"sermonStatus":"research"') ?? false)
	);
	await workflow.getByRole('button', { name: 'Predigtstatus speichern' }).click();
	expect((await saved).ok()).toBe(true);
	await expect(workflow.getByRole('status')).toHaveText('Gespeichert');

	await page.reload();
	await expect(workflow.getByLabel('Arbeitsstand')).toHaveValue('research');
	await expect(workflow.getByLabel('Predigttermin')).toHaveValue('2027-01-03');
	await expect(workflow.getByLabel('Predigtreihe')).toHaveValue('E2E-Reihe aktualisiert');

	await page.goto('/sermons?status=research');
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a normal account cannot publish an article through either the UI or a forged action', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	const id = await createDocumentFromLibrary(page, 'Artikel');
	await saveMarkdownDocument(page, {
		title: NORMAL_PRIVATE_ARTICLE_TITLE,
		markdown: `## Privat\n\nDieser Entwurf ${RUN_ID} darf nicht veröffentlicht werden.\n`,
		requestMarker: RUN_ID
	});

	const controls = page.getByTestId('publication-controls');
	await expect(controls).toContainText('Nur Administratoren können Artikel veröffentlichen.');
	await expect(controls.getByRole('button', { name: /veröffentlichen/i })).toHaveCount(0);

	const forged = await page.evaluate(async (documentId) => {
		const current = await fetch(`/api/documents/${documentId}`).then((response) => response.json());
		const form = new FormData();
		form.set('revision', String(current.document.revision));
		form.set('visibility', 'public');
		form.set('slug', `forged-${documentId}`);
		form.set('excerpt', 'Darf nicht erscheinen');
		const response = await fetch(`/notes/${documentId}?/publish`, {
			method: 'POST',
			body: form
		});
		return { status: response.status, body: await response.json() };
	}, id);
	// Named-action fetches use SvelteKit's JSON action envelope; the transport stays 200 while the
	// server-enforced failure retains its actual status inside the response.
	expect(forged.status).toBe(200);
	expect(forged.body).toMatchObject({ type: 'failure', status: 403 });
	expect(JSON.stringify(forged.body)).toContain('forbidden');
});

test('admin publication snapshots stay immutable until republish and discovery omits unlisted work', async ({
	page,
	request
}) => {
	test.slow();
	await loginAs(page, SEED_ADMIN);

	// The deterministic fixture itself demonstrates that a newer working copy does not leak into its
	// existing public snapshot.
	await page.goto(`/notes/${SEED_ADMIN_ARTICLE_ID}`);
	await expect(page.getByTestId('publication-controls')).toContainText(
		'Die Arbeitskopie enthält neuere Änderungen.'
	);
	const seededPublic = await request.get('/articles/demo-gnade-die-traegt');
	expect(await seededPublic.text()).not.toContain('Noch unveröffentlichte Ergänzung');

	await createDocumentFromLibrary(page, 'Artikel');
	const title = `Schnappschuss-Test ${RUN_ID}`;
	const slug = `snapshot-${RUN_ID}`;
	const oldMarker = `oeffentlich-alt-${RUN_ID}`;
	const newMarker = `arbeitskopie-neu-${RUN_ID}`;
	await saveMarkdownDocument(page, {
		title,
		markdown: `## Erste Fassung\n\n${oldMarker}\n`,
		requestMarker: oldMarker
	});

	let controls = page.getByTestId('publication-controls');
	await controls.getByLabel('Sichtbarkeit der Arbeitskopie').selectOption('public');
	await controls.getByLabel('Webadresse').fill(slug);
	await controls.getByLabel('Kurzbeschreibung').fill(`Snapshot-Test ${RUN_ID}`);
	await controls.getByRole('button', { name: 'Schnappschuss veröffentlichen' }).click();
	await expect(controls.getByRole('link', { name: 'Öffentliche Seite öffnen' })).toBeVisible();

	const publicPage = await page.context().newPage();
	const publicResponse = await publicPage.goto(`/articles/${slug}`);
	expect(publicResponse?.status()).toBe(200);
	await expect(publicPage.getByText(oldMarker)).toBeVisible();

	await page.getByRole('tab', { name: 'Markdown' }).click();
	const markdown = page.getByRole('textbox', { name: 'Markdown' });
	const changed = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			(response.request().postData()?.includes(newMarker) ?? false)
	);
	await markdown.fill(`## Zweite Fassung\n\n${newMarker}\n`);
	await markdown.press('Control+s');
	expect((await changed).ok()).toBe(true);
	await expect(controls).toContainText('Die Arbeitskopie enthält neuere Änderungen.');

	await publicPage.reload();
	await expect(publicPage.getByText(oldMarker)).toBeVisible();
	await expect(publicPage.getByText(newMarker)).toHaveCount(0);

	await controls.getByRole('button', { name: 'Veröffentlichung aktualisieren' }).click();
	await expect(controls).toContainText('Die Veröffentlichung entspricht der Arbeitskopie.');
	await publicPage.reload();
	await expect(publicPage.getByText(newMarker)).toBeVisible();
	await expect(publicPage.getByText(oldMarker)).toHaveCount(0);
	await publicPage.close();

	await createDocumentFromLibrary(page, 'Artikel');
	const unlistedTitle = `Nicht gelisteter Test ${RUN_ID}`;
	const unlistedSlug = `unlisted-${RUN_ID}`;
	await saveMarkdownDocument(page, {
		title: unlistedTitle,
		markdown: `## Nur per Link\n\nunlisted-marker-${RUN_ID}\n`,
		requestMarker: `unlisted-marker-${RUN_ID}`
	});
	controls = page.getByTestId('publication-controls');
	await controls.getByLabel('Sichtbarkeit der Arbeitskopie').selectOption('unlisted');
	await controls.getByLabel('Webadresse').fill(unlistedSlug);
	await controls.getByRole('button', { name: 'Schnappschuss veröffentlichen' }).click();
	await expect(controls.getByRole('link', { name: 'Öffentliche Seite öffnen' })).toBeVisible();

	const directUnlisted = await request.get(`/articles/${unlistedSlug}`);
	expect(directUnlisted.status()).toBe(200);
	expect(directUnlisted.headers()['cache-control']).toBe('private, no-store');
	expect(directUnlisted.headers()['x-robots-tag']).toBe('noindex, nofollow');
	const directUnlistedHtml = await directUnlisted.text();
	expect(directUnlistedHtml).toContain(unlistedTitle);
	expect(directUnlistedHtml).toContain('<meta name="robots" content="noindex, nofollow"');

	for (const path of ['/articles', '/articles/feed.xml', '/sitemap.xml']) {
		const response = await request.get(path);
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toContain(
			path === '/articles' ? 'private' : 'public'
		);
		const body = await response.text();
		expect(body).toContain(slug);
		expect(body).not.toContain(unlistedSlug);
		expect(body).not.toContain(NORMAL_PRIVATE_ARTICLE_TITLE);
	}

	const signedInIndex = await page.goto('/articles');
	expect(signedInIndex?.headers()['cache-control']).toBe('private, no-store');

	const robots = await request.get('/robots.txt');
	expect(robots.headers()['cache-control']).toContain('public');
	const robotsBody = await robots.text();
	expect(robotsBody).toContain('Disallow: /notes');
	expect(robotsBody).toContain('Disallow: /sermons');
});

test('the personal document API is additive while the legacy notes response stays compatible', async ({
	page,
	request
}) => {
	const unauthenticated = await request.get('/api/v1/documents', {
		headers: { origin: 'http://localhost:4173' }
	});
	expect(unauthenticated.status()).toBe(403);
	expect((await unauthenticated.json()).error.code).toBe('personal_scope_required');

	await loginAs(page, SEED_READER);
	const documentsResponse = await page.evaluate(async () => {
		const response = await fetch('/api/v1/documents?kind=note');
		return {
			status: response.status,
			cache: response.headers.get('cache-control'),
			body: await response.json()
		};
	});
	expect(documentsResponse.status).toBe(200);
	expect(documentsResponse.cache).toBe('private, no-store');
	expect(documentsResponse.body.documents).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: SEED_PRIVATE_NOTE_ID,
				kind: 'note',
				visibility: 'private'
			}),
			expect.objectContaining({
				source: 'legacy-verse-comment',
				legacyVerseCommentId: expect.any(String)
			})
		])
	);

	const detailResponse = await page.evaluate(async (id) => {
		const response = await fetch(`/api/v1/documents/${id}`);
		return {
			status: response.status,
			cache: response.headers.get('cache-control'),
			body: await response.json()
		};
	}, SEED_PRIVATE_NOTE_ID);
	expect(detailResponse.status).toBe(200);
	expect(detailResponse.cache).toBe('private, no-store');
	expect(detailResponse.body).toMatchObject({
		id: SEED_PRIVATE_NOTE_ID,
		tags: ['Bibelstudium/Johannes'],
		passages: [
			{
				resourceId: null,
				start: { book: 43, chapter: 3, verse: 16 },
				end: { book: 43, chapter: 3, verse: 16 }
			}
		]
	});

	const legacyResponse = await page.evaluate(async () => {
		const response = await fetch('/api/v1/notes');
		return {
			status: response.status,
			cache: response.headers.get('cache-control'),
			body: await response.json()
		};
	});
	expect(legacyResponse.status).toBe(200);
	expect(legacyResponse.cache).toBe('private, no-store');
	expect(Object.keys(legacyResponse.body)).toEqual(['notes']);
	expect(legacyResponse.body.notes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'translation',
				book: 43,
				chapter: 3,
				verse: 17,
				resourceId: 'SEEDDE',
				listId: null,
				itemId: null
			})
		])
	);
});

test('the notes workspace remains operable on mobile, by keyboard and in dark mode', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await loginAs(page, SEED_READER);
	await page.goto('/notes');
	await expect(page.getByTestId('notes-library')).toBeVisible();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
	).toBe(true);

	const darkMode = page.getByRole('button', { name: 'Dunkles Design' });
	await darkMode.focus();
	await expect(darkMode).toBeFocused();
	await darkMode.press('Enter');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await page.reload();
	await expect(page.locator('html')).toHaveClass(/dark/);

	await page.goto(`/notes/${SEED_PRIVATE_NOTE_ID}`);
	await expect(page.getByTestId('document-workspace')).toBeVisible();
	await expect(page.getByTestId('document-details')).toBeVisible();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
	).toBe(true);

	const title = page.getByLabel('Titel');
	await title.focus();
	await expect(title).toBeFocused();
	await title.press('Control+m');
	await expect(page.getByRole('tab', { name: 'Markdown' })).toHaveAttribute(
		'aria-selected',
		'true'
	);

	// Restore the deterministic account preference for subsequent manual use and future suites.
	const lightMode = page.getByRole('button', { name: 'Helles Design' });
	await lightMode.press('Enter');
	await expect(page.locator('html')).not.toHaveClass(/dark/);
});
