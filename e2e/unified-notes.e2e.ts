import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { lastMailLinkTo } from './lib/mail-outbox';

const PASSWORD = 'ein-sicheres-passwort';

test('note pagination limits cards and preserves filters while tag search reveals collapsed groups', async ({
	page
}) => {
	await register(page);
	await page.goto('/notes/import');
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles(
		Array.from({ length: 25 }, (_, index) => ({
			name: `seite-${index}.md`,
			mimeType: 'text/markdown',
			buffer: Buffer.from(
				`---\ntitle: Seitennotiz ${index}\ntags: [Sammlung/Untergruppe]\n---\nJoh 3,16 Paginationtext`
			)
		}))
	);
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	await page.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL('/notes');
	await expect(page.getByRole('heading', { name: /^Seitennotiz / })).toHaveCount(24);
	await expect(page.getByRole('link', { name: /^Untergruppe / })).toHaveCount(0);
	const search = page.getByRole('searchbox', { name: 'Schlagwörter suchen' });
	await search.fill('unterGRUPPE');
	await expect(page.getByRole('link', { name: /^Sammlung / })).toBeVisible();
	await expect(page.getByRole('link', { name: /^Untergruppe / })).toBeVisible();
	await search.fill('nichtvorhanden');
	await expect(page.getByText('Keine passenden Schlagwörter gefunden.')).toBeVisible();
	await search.fill('');
	await expect(page.getByRole('link', { name: /^Untergruppe / })).toHaveCount(0);
	await page.goto('/notes?q=Paginationtext&tag=Sammlung&passage=Joh3,16');
	await page
		.getByRole('navigation', { name: 'Notizseiten' })
		.getByRole('link', { name: 'Weiter' })
		.click();
	await expect(page.getByText('Seite 2 von 2', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Seitennotiz / })).toHaveCount(1);
	expect(new URL(page.url()).searchParams.get('tag')).toBe('Sammlung');
	expect(new URL(page.url()).searchParams.get('q')).toBe('Paginationtext');
	expect(new URL(page.url()).searchParams.get('passage')).toBe('Joh3,16');
	await page.reload();
	await expect(page.getByRole('heading', { name: /^Seitennotiz / })).toHaveCount(1);
	const secondPageUrl = page.url();
	await page.getByRole('heading', { name: /^Seitennotiz / }).click();
	await page.getByRole('link', { name: 'Zur Notizbibliothek' }).click();
	await expect(page).toHaveURL(secondPageUrl);
	await page.goBack();
	await expect(page.getByTestId('document-editor')).toBeVisible();
	await page.goForward();
	await expect(page).toHaveURL(secondPageUrl);
	await page
		.getByRole('navigation', { name: 'Schlagwörter' })
		.getByRole('link', { name: 'Alle', exact: true })
		.click();
	await expect(page).toHaveURL((url) => !url.searchParams.has('page'));
	await expect(page.getByRole('heading', { name: /^Seitennotiz / })).toHaveCount(24);
});

test('notes and sermons convert both ways without losing text or sermon metadata', async ({
	page
}) => {
	await register(page);
	const id = await createNoteFromLibrary(page);
	await page.getByRole('button', { name: 'Konto-Menü' }).click();
	await expect(
		page.getByRole('menuitem', { name: 'Notizen & Predigten', exact: true })
	).toBeVisible();
	await page.keyboard.press('Escape');
	await page.getByLabel('Titel').fill('Wechselnotiz');
	await page.getByRole('tab', { name: 'Markdown' }).click();
	await page.getByRole('textbox', { name: 'Markdown' }).fill('Ungespeicherter Text mit Joh 3,16.');
	await page.getByRole('button', { name: 'In Predigt umwandeln', exact: true }).click();
	await expect(page.getByTestId('sermon-workflow')).toBeVisible();
	const read = async () => (await (await page.request.get(`/api/documents/${id}`)).json()).document;
	let document = await read();
	expect(document).toMatchObject({
		id,
		kind: 'sermon',
		title: 'Wechselnotiz',
		bodyMarkdown: 'Ungespeicherter Text mit Joh 3,16.\n',
		sermonStatus: 'idea'
	});
	const staleRevision = document.revision;
	const updated = await page.request.patch(`/api/documents/${id}`, {
		data: {
			revision: document.revision,
			title: document.title,
			markdown: document.bodyMarkdown,
			sermonStatus: 'ready',
			sermonDate: '06.09.2026',
			sermonSeries: 'Erhaltene Serie'
		}
	});
	expect(updated.ok(), await updated.text()).toBe(true);
	const stale = await page.request.post(`/notes/${id}?/changeKind`, {
		headers: { origin: new URL(page.url()).origin },
		form: { revision: String(staleRevision), kind: 'note' }
	});
	expect(await stale.json()).toMatchObject({ type: 'failure', status: 409 });
	await page.reload();
	await page.getByRole('button', { name: 'In Notiz umwandeln', exact: true }).click();
	await expect(page.getByTestId('sermon-workflow')).toHaveCount(0);
	document = await read();
	expect(document).toMatchObject({
		id,
		kind: 'note',
		sermonStatus: 'ready',
		sermonSeries: 'Erhaltene Serie'
	});
	expect(document.sermonDate).toContain('2026-09-06');
	await page.goto('/notes');
	await expect(page.getByRole('heading', { name: 'Wechselnotiz', exact: true })).toBeVisible();
	await page.goto(`/notes/${id}`);
	await page.getByRole('button', { name: 'In Predigt umwandeln', exact: true }).click();
	await expect(page.getByTestId('sermon-workflow')).toBeVisible();
	expect(await read()).toMatchObject({
		id,
		kind: 'sermon',
		sermonStatus: 'ready',
		sermonSeries: 'Erhaltene Serie',
		bodyMarkdown: document.bodyMarkdown
	});
	await page.goto('/notes');
	await expect(page.getByRole('heading', { name: 'Wechselnotiz', exact: true })).toHaveCount(0);
	await page.goto('/sermons');
	await expect(page.getByText('Wechselnotiz', { exact: true })).toBeVisible();
});

test('conversion rejects foreign documents and requires explicit unpublishing', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	const foreign = await page.request.post(`/notes/${SEED_ADMIN_PUBLISHED_NOTE_ID}?/changeKind`, {
		headers: { origin: new URL(page.url()).origin },
		form: { revision: '1', kind: 'sermon' }
	});
	expect(foreign.status()).toBe(404);
	await page.context().clearCookies();
	await loginAs(page, SEED_ADMIN);
	await page.goto(`/notes/${SEED_ADMIN_PUBLISHED_NOTE_ID}`);
	await expect(
		page.getByRole('button', { name: 'In Predigt umwandeln', exact: true })
	).toBeDisabled();
	const { document } = await (
		await page.request.get(`/api/documents/${SEED_ADMIN_PUBLISHED_NOTE_ID}`)
	).json();
	const rejected = await page.request.post(`/notes/${SEED_ADMIN_PUBLISHED_NOTE_ID}?/changeKind`, {
		headers: { origin: new URL(page.url()).origin },
		form: { revision: String(document.revision), kind: 'sermon' }
	});
	const rejection = await rejected.json();
	expect(rejection).toMatchObject({ type: 'failure', status: 400 });
	expect(JSON.stringify(rejection)).toContain('publishedConversion');
});

test('the current-passage library finds imported notes and sermons by body references without anchors', async ({
	page,
	browser
}) => {
	await register(page);
	const titles = ['Fließtextnotiz', 'Fließtextpredigt', 'Nur Code'] as const;
	await page.goto('/notes/import');
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles([
		{
			name: 'notiz.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from(
				`---\ntitle: ${titles[0]}\ntype: note\n---\n[Johannes 3,15-17](http://strongs.de/joh3,15)`
			)
		},
		{
			name: 'predigt.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from(`---\ntitle: ${titles[1]}\ntype: sermon\n---\nJohannes **3,16**`)
		},
		{
			name: 'code.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from(`---\ntitle: ${titles[2]}\n---\n\`Joh 3,16\``)
		}
	]);
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	await page.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL('/notes');
	await page.goto('/notes?passage=Joh3,16');
	await expect(page.getByRole('heading', { name: titles[0], exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: titles[2], exact: true })).toHaveCount(0);
	await page.goto('/Joh3,16');
	await page.getByTestId('layout-picker').click();
	await page.getByTestId('reader-notes-sidecar-toggle').click();
	const sidecar = page.getByTestId('reader-notes-sidecar');
	await sidecar.getByLabel('Nur Dokumente zur aktuellen Stelle').check();
	const library = sidecar.getByTestId('reader-notes-library');
	await expect(library.getByText(titles[0], { exact: true })).toBeVisible();
	await expect(library.getByText(titles[1], { exact: true })).toBeVisible();
	await expect(library.getByText(titles[2], { exact: true })).toHaveCount(0);
	const filtered = await page.request.get(
		'/api/documents?passage=Joh3,16&resource=SEEDPLAIN&kind=sermon'
	);
	expect(filtered.headers()['cache-control']).toBe('private, no-store');
	expect((await filtered.json()).documents.map((row: { title: string }) => row.title)).toEqual([
		titles[1]
	]);
	const all = await (await page.request.get('/api/documents')).json();
	const noteId = all.documents.find((row: { title: string }) => row.title === titles[0]).id;
	const detail = await page.evaluate(async (id) => {
		const response = await fetch(`/api/v1/documents/${id}`);
		if (!response.ok) throw new Error(`document detail: ${response.status}`);
		return response.json();
	}, noteId);
	expect(detail.passages).toEqual([]);
	const stranger = await browser.newContext();
	const strangerPage = await stranger.newPage();
	await loginAs(strangerPage, SEED_ADMIN);
	const strangerRows = await (
		await strangerPage.request.get('/api/documents?passage=Joh3,16')
	).json();
	expect(strangerRows.documents.map((row: { id: string }) => row.id)).not.toContain(noteId);
	await stranger.close();
	const changed = await page.request.patch(`/api/documents/${noteId}`, {
		data: {
			revision: detail.revision,
			title: detail.title,
			markdown: 'Die Referenz wurde entfernt.'
		}
	});
	expect(changed.ok(), await changed.text()).toBe(true);
	const after = await (await page.request.get('/api/documents?passage=Joh3,16')).json();
	expect(after.documents.map((row: { title: string }) => row.title)).toEqual([titles[1]]);
});

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

	// Opening from the layout menu starts at the currently visible verse, without requiring its
	// contextual menu, and exposes the filterable personal library.
	await page.getByTestId('layout-picker').click();
	await page.getByTestId('reader-notes-sidecar-toggle').click();
	let sidecar = page.getByTestId('reader-notes-sidecar');
	await expect(sidecar.getByTestId('reader-notes-current-context')).toContainText('Johannes 3,16');
	await expect(sidecar.getByTestId('reader-notes-sidecar-create')).toBeVisible();
	await expect(sidecar.getByText('Keine passenden Dokumente gefunden.')).toBeVisible();
	await expect(sidecar.getByLabel('Dokumenttyp filtern')).toHaveCount(0);
	await expect(sidecar.getByLabel('Tag filtern')).toBeVisible();
	await sidecar.getByRole('button', { name: 'Notizbereich schließen' }).click();

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

	sidecar = page.getByTestId('reader-notes-sidecar');
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

	// The sidecar maximizes the existing editor, including a pending edit and the same save queue.
	await body.press('Control+Shift+f');
	const zen = page.getByRole('dialog', { name: 'Zen-Modus', exact: true });
	await expect(zen).toBeVisible();
	await expect(zen.getByTestId('reader-notes-sidecar-body-markdown')).toHaveValue(
		new RegExp(bodyMarker)
	);
	await expect(zen.getByTestId('document-counts')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(zen).toHaveCount(0);
	await expect(sidecar.getByTestId('reader-notes-sidecar-body-markdown')).toHaveValue(
		new RegExp(bodyMarker)
	);

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
	const resizeHandle = page.getByTestId('reader-notes-sidecar-resize');
	const widthBeforeKeyboardResize = await sidecar.evaluate(
		(element) => element.getBoundingClientRect().width
	);
	await resizeHandle.focus();
	await resizeHandle.press('ArrowLeft');
	await expect
		.poll(() => sidecar.evaluate((element) => element.getBoundingClientRect().width))
		.toBeGreaterThan(widthBeforeKeyboardResize);

	// The device-local sidecar preference survives a reload, while its private document id does not.
	// The freshly loaded passage context offers the owned note, whose persisted content can be opened.
	await page.reload();
	sidecar = page.getByTestId('reader-notes-sidecar');
	await sidecar.getByTestId('reader-notes-open-document').filter({ hasText: title }).click();
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
const SEED_ADMIN_PUBLISHED_NOTE_ID = '5eed0000-0000-4000-8000-000000000005';
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NORMAL_PRIVATE_NOTE_TITLE = `Private Lesernotiz ${RUN_ID}`;
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

async function createNoteFromLibrary(page: import('@playwright/test').Page): Promise<string> {
	await page.goto('/notes');
	await page.getByRole('button', { name: 'Neue Notiz', exact: true }).click();
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

	const foreign = await page.goto(`/notes/${SEED_ADMIN_PUBLISHED_NOTE_ID}`);
	expect(foreign?.status()).toBe(404);
	await expect(page.getByText('Dokument nicht gefunden')).toBeVisible();

	const internalForeign = await page.evaluate(async (id) => {
		const response = await fetch(`/api/documents/${id}`);
		return {
			status: response.status,
			cache: response.headers.get('cache-control'),
			body: await response.json()
		};
	}, SEED_ADMIN_PUBLISHED_NOTE_ID);
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

	await expect(page.getByRole('heading', { name: 'Notizen', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Schöpfung und Ruhe' })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Wortwahl in der Testübersetzung' })
	).toBeVisible();
	await expect(page.getByText('Aus Verskommentar übernommen')).toBeVisible();

	await expect(page.getByRole('link', { name: 'Johannes (1)', exact: true })).toHaveCount(0);
	await page.getByRole('searchbox', { name: 'Schlagwörter suchen' }).fill('JOHANNES');
	await expect(page.getByRole('link', { name: /^Bibelstudium \(/ })).toBeVisible();
	await page.getByRole('link', { name: 'Johannes (1)', exact: true }).click();
	await expect(page).toHaveURL(/tag=Bibelstudium%2FJohannes/);
	await expect(page.getByRole('heading', { name: 'Gebet und Antwort' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Geliebt und gesandt' })).toHaveCount(0);
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
	await expect(preview).toHaveAttribute('role', 'dialog');
	await expect(preview).toContainText('Matthäus 3,12');
	await expect(preview).toContainText(MATTHEW_PREVIEW_TEXT);
	await expect(preview.getByRole('button', { name: 'Bibeltext einfügen' })).toBeVisible();
	const previewId = await preview.getAttribute('id');
	expect(previewId).toBeTruthy();
	await expect(reference).toHaveAttribute('aria-describedby', previewId!);

	await page.mouse.move(0, 0);
	await expect(preview).toBeHidden();
	await reference.focus();
	await expect(reference).toBeFocused();
	await expect(preview).toContainText(MATTHEW_PREVIEW_TEXT);
	await page.keyboard.press('Tab');
	await expect(preview.getByRole('button', { name: 'Bibeltext einfügen' })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(reference).toBeFocused();
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
	await expect(page).toHaveURL(`/notes/${SEED_PRIVATE_NOTE_ID}`);
	const opened = page.waitForEvent('popup');
	await preview.getByRole('link', { name: 'Bibelstelle öffnen' }).click();
	const reader = await opened;
	await expect(reader).toHaveURL((url) => url.pathname === '/Mt3,12');
	await expect(reader.locator('[data-verse-key="40:3:12"]').first()).toContainText('Worfschaufel');
	await reader.close();
});

test('imported Bible links preview and contextual link actions preserve formatting through reload', async ({
	page,
	context
}) => {
	await loginAs(page, SEED_READER);
	await page.goto('/notes/import');
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles({
		name: 'bibel-links.md',
		mimeType: 'text/markdown',
		buffer: Buffer.from(
			'[Matthäus 3,12](http://strongs.de/mt3,12) und [Web](https://example.com/)\n\nFormatierung\n'
		)
	});
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	const preview = page.getByTestId('import-preview');
	await expect(preview.getByRole('link', { name: 'Matthäus 3,12' })).toHaveAttribute(
		'href',
		'/Mt3,12'
	);
	await preview.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	const url = page.url();
	const prose = page.locator('.document-prose');
	const bible = prose.locator('.verse-ref');
	await bible.hover();
	await expect(page.getByTestId('bible-reference-preview')).toContainText(MATTHEW_PREVIEW_TEXT);
	await page.keyboard.press('Escape');
	await bible.click();
	await expect(page).toHaveURL(url);
	const web = prose.locator('a[href^="https://example.com/"]');
	await expect(web).toHaveCSS('text-decoration-line', 'underline');
	await expect(web.locator('[title]')).toHaveAttribute('title', 'https://example.com/');
	await web.click();
	await expect(page).toHaveURL(url);
	await page.keyboard.type('X');
	await expect(web).toContainText('X');
	await page
		.getByRole('toolbar', { name: 'Text formatieren', exact: true })
		.getByRole('button', { name: 'Link bearbeiten', exact: true })
		.click();
	await expect(page.getByLabel('Linkziel')).toHaveValue('https://example.com/');
	await page.getByLabel('Linkziel').fill('https://example.com/edited');
	await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
	await expect(web).toHaveAttribute('href', 'https://example.com/edited');
	await context.route('https://example.com/**', (route) =>
		route.fulfill({ body: 'Externes Linkziel' })
	);
	const opened = page.waitForEvent('popup');
	await page
		.getByRole('toolbar', { name: 'Text formatieren', exact: true })
		.getByRole('button', { name: 'Link bearbeiten', exact: true })
		.click();
	await page.getByRole('link', { name: 'Link öffnen', exact: true }).click();
	const external = await opened;
	await expect(external).toHaveURL('https://example.com/edited');
	await external.close();
	await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
	await prose.getByText('Formatierung', { exact: true }).click();
	await page.getByLabel('Überschrift', { exact: true }).selectOption('6');
	await expect(prose.locator('h6')).toHaveText('Formatierung');
	await prose.locator('h6').selectText();
	await page
		.getByRole('toolbar', { name: 'Auswahl formatieren' })
		.getByRole('button', { name: 'Unterstreichen', exact: true })
		.click();
	await page
		.getByRole('toolbar', { name: 'Auswahl formatieren' })
		.getByRole('button', { name: 'Hervorheben', exact: true })
		.click();
	await expect(prose.locator('h6 u')).toHaveText('Formatierung');
	await expect(prose.locator('h6 mark')).toHaveText('Formatierung');
	await page.getByRole('tab', { name: 'Markdown' }).click();
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
		/###### .*<u>.*<mark>|###### .*<mark>.*<u>/
	);
	await page.getByRole('textbox', { name: 'Markdown' }).press('Control+s');
	await expect(page.getByTestId('document-editor').locator('.save-status')).toHaveText(
		'Gespeichert'
	);
	await page.reload();
	await expect(prose.locator('h6 u')).toHaveText('Formatierung');
	await expect(prose.locator('h6 mark')).toHaveText('Formatierung');
});

test('import preview names each invalid file and explains an oversized selection', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	await page.goto('/notes/import');
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles([
		{ name: 'gut.md', mimeType: 'text/markdown', buffer: Buffer.from('Gültig') },
		{
			name: 'defekt.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('---\ntitle: [offen\n---\nText')
		},
		{
			name: 'kaputt.md',
			mimeType: 'text/markdown',
			buffer: Buffer.from('---\ntitle: [offen\n---\nText')
		}
	]);
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	await expect(page.getByRole('alert')).toContainText('defekt.md');
	await expect(page.getByRole('alert')).toContainText('kaputt.md');
	await expect(page.getByRole('alert')).not.toContainText('gut.md');
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles(
		Array.from({ length: 101 }, (_, index) => ({
			name: `${index}.md`,
			mimeType: 'text/markdown',
			buffer: Buffer.from('Text')
		}))
	);
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	await expect(page.getByRole('alert')).toContainText('101 Dateien');
	await expect(page.getByRole('alert')).toContainText('höchstens 100');
});

test('a published note exposes inline references to keyboard users with public previews', async ({
	page
}) => {
	await page.goto('/notes/published/demo-gnade-die-traegt');

	const publishedNote = page.getByTestId('published-note');
	const reference = publishedNote.locator('a.bible-reference.verse-ref[data-reference="Mt3,12"]');
	await expect(reference).toHaveText('Mt 3,12');
	await expect(reference).toHaveAttribute('href', '/Mt3,12');

	const responsePromise = waitForMatthewChapter(page);
	await publishedNote.locator('a.publication-chip').first().focus();
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

	await publishedNote.locator('a.publication-chip').first().focus();
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
	const id = await createNoteFromLibrary(page);
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

	await visualEditor.press('Control+End');
	await visualEditor.press('Enter');
	await visualEditor.pressSequentially('/bibel Mt 3,12');
	const quotationResponse = waitForMatthewChapter(page);
	await visualEditor.press('Enter');
	expect((await quotationResponse).ok()).toBe(true);
	await expect(visualEditor.locator('blockquote')).toContainText(MATTHEW_PREVIEW_TEXT);
	await expect(visualEditor.locator('blockquote')).toContainText('Matthäus 3,12');

	await visualEditor.press('Control+m');
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
		new RegExp(`${bodyMarker}[\\s\\S]*Worfschaufel[\\s\\S]*Matthäus 3,12`)
	);

	const tags = page.getByPlaceholder('Theologie/Gnade, Predigt/Entwurf');
	await tags.fill(nestedTagPath);
	const tagsSaved = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('?/syncTags')
	);
	await page.getByRole('button', { name: 'Schlagwörter speichern' }).click();
	expect((await tagsSaved).ok()).toBe(true);
	await page.waitForLoadState('networkidle');
	await expect(tags).toHaveValue(nestedTagPath);

	await page.getByPlaceholder(/z\. B\. Joh 3,16-18/).fill('1Mo 1,3-2,2');
	await page.getByLabel('Übersetzungsbezug').selectOption('');
	const canonicalPassageSaved = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('?/addPassage')
	);
	await page.getByRole('button', { name: 'Bibelstelle hinzufügen' }).click();
	expect((await canonicalPassageSaved).ok()).toBe(true);
	const canonicalPassage = page.getByRole('listitem').filter({ hasText: '1Mo 1,3-2,2' });
	await expect(canonicalPassage.getByRole('link', { name: '1Mo 1,3-2,2' })).toBeVisible();
	await expect(canonicalPassage.getByText('Für alle Übersetzungen', { exact: true })).toBeVisible();

	await page.getByPlaceholder(/z\. B\. Joh 3,16-18/).fill('Joh 3,16-17');
	await page.getByLabel('Übersetzungsbezug').selectOption('SEEDDE');
	const translatedPassageSaved = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('?/addPassage')
	);
	await page.getByRole('button', { name: 'Bibelstelle hinzufügen' }).click();
	expect((await translatedPassageSaved).ok()).toBe(true);
	await expect(page.getByRole('link', { name: 'Joh 3,16-17' })).toBeVisible();
	await expect(page.getByText('Nur Testübersetzung', { exact: true })).toBeVisible();

	await page.locator('.export-menu > summary').click();
	const downloadPromise = page.waitForEvent('download');
	await page.locator('.export-menu').getByRole('link', { name: 'Markdown', exact: true }).click();
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
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
		new RegExp(`${bodyMarker}[\\s\\S]*Worfschaufel[\\s\\S]*Matthäus 3,12`)
	);

	await page.goto('/notes');
	await page.getByRole('searchbox', { name: 'Schlagwörter suchen' }).fill(nestedTagLeaf);
	await page
		.getByRole('navigation', { name: 'Schlagwörter' })
		.getByRole('link', { name: new RegExp(`^${nestedTagLeaf} \\(1\\)$`) })
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
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles({
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

test('Obsidian import accepts multiple Markdown files and safe ZIP archives', async ({ page }) => {
	test.slow();
	await loginAs(page, SEED_READER);
	const firstTitle = `Mehrfachimport Eins ${RUN_ID}`;
	const secondTitle = `Mehrfachimport Zwei ${RUN_ID}`;
	await page.goto('/notes/import');
	const brokenFilename = `defekt-${RUN_ID}.md`;
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles([
		{
			name: `gueltig-${RUN_ID}.md`,
			mimeType: 'text/markdown',
			buffer: Buffer.from('# Gültig\n')
		},
		{
			name: brokenFilename,
			mimeType: 'text/markdown',
			buffer: Buffer.from('---\ntitle: [ungueltig\n---\nText\n')
		}
	]);
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	await expect(page.getByRole('alert')).toContainText(brokenFilename);

	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles([
		{
			name: `multi-one-${RUN_ID}.md`,
			mimeType: 'text/markdown',
			buffer: Buffer.from(`---\ntitle: ${firstTitle}\n---\nErster Inhalt\n`)
		},
		{
			name: `multi-two-${RUN_ID}.md`,
			mimeType: 'text/markdown',
			buffer: Buffer.from(`---\ntitle: ${secondTitle}\n---\nZweiter Inhalt\n`)
		}
	]);
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	const multiPreview = page.getByTestId('import-preview');
	await expect(multiPreview).toContainText('2 Dokumente in der Vorschau');
	await expect(multiPreview.getByRole('heading', { name: firstTitle })).toBeVisible();
	await expect(multiPreview.getByRole('heading', { name: secondTitle })).toBeVisible();
	await multiPreview.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL('/notes');
	await expect(page.getByRole('heading', { name: firstTitle })).toBeVisible();
	await expect(page.getByRole('heading', { name: secondTitle })).toBeVisible();

	const zipTitle = `ZIP-Import ${RUN_ID}`;
	const archive = zipSync({
		[`Notizen/${RUN_ID}.md`]: strToU8(
			`---\ntitle: ${zipTitle}\ntags: [E2E/ZIP]\n---\nSicher aus ZIP importiert.\n`
		),
		'Anlagen/ignoriert.txt': strToU8('Kein Dokument')
	});
	await page.goto('/notes/import');
	await page.getByLabel('Markdown-Dateien oder ZIP-Archiv').setInputFiles({
		name: `obsidian-${RUN_ID}.zip`,
		mimeType: 'application/zip',
		buffer: Buffer.from(archive)
	});
	await page.getByRole('button', { name: 'Importvorschau erstellen' }).click();
	const zipPreview = page.getByTestId('import-preview');
	await expect(zipPreview).toContainText('Ein Dokument in der Vorschau');
	await expect(zipPreview.getByRole('heading', { name: zipTitle })).toBeVisible();
	await zipPreview.getByRole('button', { name: 'Als privates Dokument importieren' }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
	await expect(page.getByLabel('Titel')).toHaveValue(zipTitle);
	await expect(page.getByLabel('Schlagwörter')).toHaveValue('E2E/ZIP');
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
	await page.getByLabel('Predigttermin').fill('24.12.2026');
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
	await workflow.getByLabel('Predigttermin').fill('03.01.2027');
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
	await expect(workflow.getByLabel('Predigttermin')).toHaveValue('03.01.2027');
	await expect(workflow.getByLabel('Predigtreihe')).toHaveValue('E2E-Reihe aktualisiert');

	await page.goto('/sermons?status=research');
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('custom sermon templates, delivery history, rich exports and board movement work together', async ({
	page
}) => {
	test.slow();
	await loginAs(page, SEED_READER);
	const templateName = `E2E-Vorlage ${RUN_ID}`;
	const templateMarker = `eigene-vorlage-${RUN_ID}`;
	await page.goto('/sermons/templates');
	const createTemplate = page
		.getByTestId('sermon-templates')
		.locator('[data-tour-target="sermon-template-create"]');
	await createTemplate.getByLabel('Name der Vorlage').fill(templateName);
	await createTemplate
		.getByLabel('Vorlagentext (Markdown)')
		.fill(`## Eigener Aufbau\n\n${templateMarker}\n`);
	await createTemplate.getByRole('button', { name: 'Vorlage erstellen' }).click();
	await expect(page.getByText(templateName, { exact: true })).toBeVisible();

	const sermonTitle = `Vorlagenpredigt ${RUN_ID}`;
	await page.goto('/sermons');
	const createSermon = page.locator('[data-tour-target="sermon-create"]');
	await createSermon.getByLabel('Titel').fill(sermonTitle);
	await createSermon.getByLabel('Predigttermin').fill('06.09.2026');
	await createSermon.getByLabel('Vorlage').selectOption({ label: templateName });
	await createSermon.getByRole('button', { name: 'Erstellen' }).click();
	await page.getByRole('tab', { name: 'Markdown' }).click();
	await expect(page.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
		new RegExp(templateMarker)
	);

	let deliveries = page.getByTestId('sermon-deliveries');
	await deliveries.getByLabel('Datum').fill('13.09.2026');
	await deliveries.getByLabel('Ort').fill('Gemeinde Nord');
	await deliveries.getByRole('button', { name: 'Durchführung hinzufügen' }).click();
	deliveries = page.getByTestId('sermon-deliveries');
	await expect(deliveries).toContainText('13.09.2026');
	await expect(deliveries).toContainText('Gemeinde Nord');
	await deliveries.getByLabel('Datum').fill('04.10.2026');
	await deliveries.getByLabel('Ort').fill('Hauskreis Süd');
	await deliveries.getByRole('button', { name: 'Durchführung hinzufügen' }).click();
	deliveries = page.getByTestId('sermon-deliveries');
	await expect(deliveries).toContainText('04.10.2026');
	await expect(deliveries).toContainText('Hauskreis Süd');

	await page.locator('.export-menu > summary').click();
	const wordDownload = page.waitForEvent('download');
	await page.locator('.export-menu').getByRole('link', { name: 'Word (.docx)' }).click();
	const wordPath = await (await wordDownload).path();
	expect(wordPath).not.toBeNull();
	expect((await readFile(wordPath!)).subarray(0, 2).toString('ascii')).toBe('PK');

	const pdfDownload = page.waitForEvent('download');
	await page.locator('.export-menu').getByRole('link', { name: 'PDF', exact: true }).click();
	const pdfPath = await (await pdfDownload).path();
	expect(pdfPath).not.toBeNull();
	expect((await readFile(pdfPath!)).subarray(0, 4).toString('ascii')).toBe('%PDF');

	await page.goto('/sermons');
	let card = page.getByTestId('sermon-card').filter({ hasText: sermonTitle });
	const outlineColumn = page.getByRole('group', { name: 'Gliederung' });
	await expect(card).toHaveAttribute('draggable', 'true');
	// Chromium's coordinate-based `dragTo` can miss a horizontally scrolling Kanban target when the
	// complete suite runs under load. Dispatch the same native drag events with one shared transfer so
	// this assertion remains about the application's DnD contract, not browser autoscroll timing.
	const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
	const dragMove = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('?/move')
	);
	await card.dispatchEvent('pointerdown', { pointerType: 'mouse' });
	await card.dispatchEvent('dragstart', { dataTransfer });
	await outlineColumn.dispatchEvent('dragover', { dataTransfer });
	await outlineColumn.dispatchEvent('drop', { dataTransfer });
	expect((await dragMove).ok()).toBe(true);
	await dataTransfer.dispose();
	card = page.getByTestId('sermon-card').filter({ hasText: sermonTitle });
	await expect(
		outlineColumn.getByTestId('sermon-card').filter({ hasText: sermonTitle })
	).toBeVisible();
	await card.getByRole('link').focus();
	const keyboardMove = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('?/move')
	);
	await card.getByRole('link').press('Alt+ArrowRight');
	expect((await keyboardMove).ok()).toBe(true);
	await expect(
		page
			.getByRole('group', { name: 'Bereit' })
			.getByTestId('sermon-card')
			.filter({ hasText: sermonTitle })
	).toBeVisible();
});

test('a normal account cannot publish a note through either the UI or a forged action', async ({
	page
}) => {
	await loginAs(page, SEED_READER);
	const id = await createNoteFromLibrary(page);
	await saveMarkdownDocument(page, {
		title: NORMAL_PRIVATE_NOTE_TITLE,
		markdown: `## Privat\n\nDieser Entwurf ${RUN_ID} darf nicht veröffentlicht werden.\n`,
		requestMarker: RUN_ID
	});

	const controls = page.getByTestId('publication-controls');
	await expect(controls).toContainText('Nur Administratoren können Notizen veröffentlichen.');
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
	await page.goto(`/notes/${SEED_ADMIN_PUBLISHED_NOTE_ID}`);
	await expect(page.getByTestId('publication-controls')).toContainText(
		'Die Arbeitskopie enthält neuere Änderungen.'
	);
	const seededPublic = await request.get('/notes/published/demo-gnade-die-traegt');
	expect(await seededPublic.text()).not.toContain('Noch unveröffentlichte Ergänzung');

	await createNoteFromLibrary(page);
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
	const publicResponse = await publicPage.goto(`/notes/published/${slug}`);
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

	await createNoteFromLibrary(page);
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

	const directUnlisted = await request.get(`/notes/published/${unlistedSlug}`);
	expect(directUnlisted.status()).toBe(200);
	expect(directUnlisted.headers()['cache-control']).toBe('private, no-store');
	expect(directUnlisted.headers()['x-robots-tag']).toBe('noindex, nofollow');
	const directUnlistedHtml = await directUnlisted.text();
	expect(directUnlistedHtml).toContain(unlistedTitle);
	expect(directUnlistedHtml).toContain('<meta name="robots" content="noindex, nofollow"');

	for (const path of ['/notes/published', '/notes/published/feed.xml', '/sitemap.xml']) {
		const response = await request.get(path);
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toContain(
			path === '/notes/published' ? 'private' : 'public'
		);
		const body = await response.text();
		expect(body).toContain(slug);
		expect(body).not.toContain(unlistedSlug);
		expect(body).not.toContain(NORMAL_PRIVATE_NOTE_TITLE);
	}
	const signedInIndex = await page.goto('/notes/published');
	expect(signedInIndex?.headers()['cache-control']).toBe('private, no-store');

	const robots = await request.get('/robots.txt');
	expect(robots.headers()['cache-control']).toContain('public');
	const robotsBody = await robots.text();
	expect(robotsBody).toContain('Disallow: /notes');
	expect(robotsBody).toContain('Allow: /notes/published');
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

test('editor selection tools, outline, counts and Zen mode preserve the same document', async ({
	page
}) => {
	await register(page);
	await createNoteFromLibrary(page);
	await page.getByRole('tab', { name: 'Markdown' }).click();
	const source = '# Anfang\n\nHallo Welt\n\n## Ende\n\n' + 'Langer Absatz.\n\n'.repeat(35);
	await page.getByRole('textbox', { name: 'Markdown' }).fill(source);
	await page.getByRole('tab', { name: 'Visuell' }).click();
	const editor = page.getByTestId('document-editor');
	const prose = editor.locator('.document-prose');
	await expect(editor.getByTestId('document-counts')).toContainText('74 Wörter');
	const bounds = await editor.boundingBox();
	expect(bounds!.height).toBeLessThan(page.viewportSize()!.height);
	expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
	await prose.getByText('Hallo Welt', { exact: true }).selectText();
	const bubble = page.getByRole('toolbar', { name: 'Auswahl formatieren' });
	await expect(bubble).toBeVisible();
	const selectionBounds = await prose.getByText('Hallo Welt', { exact: true }).boundingBox();
	const bubbleBounds = await bubble.boundingBox();
	expect(Math.abs(bubbleBounds!.y - selectionBounds!.y)).toBeLessThan(100);
	await bubble.getByRole('button', { name: 'Hervorheben', exact: true }).click();
	await expect(prose.locator('mark')).toHaveText('Hallo Welt');
	await expect(bubble.getByRole('button', { name: 'Hervorheben', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await bubble.getByRole('button', { name: 'Link bearbeiten' }).click();
	await page.getByLabel('Linkziel').fill('https://example.com');
	await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
	await expect(prose.locator('a[href="https://example.com"]')).toHaveText('Hallo Welt');
	const outline = editor.getByRole('complementary', { name: 'Inhalt und Verknüpfungen' });
	const outlinePanel = outline.locator('.outline-panel');
	await expect(outline.locator('.outline-strokes > span')).toHaveCount(2);
	await expect(outlinePanel).not.toBeVisible();
	await outline.locator('.outline-rail').hover();
	await expect(outlinePanel).toBeVisible();
	await outlinePanel.getByRole('button', { name: 'Ende', exact: true }).click();
	await expect(prose.locator('h2')).toBeInViewport();
	await prose.press('Control+Shift+f');
	const zen = page.getByRole('dialog', { name: 'Zen-Modus', exact: true });
	await expect(zen).toBeVisible();
	await expect(zen.locator('mark')).toHaveText('Hallo Welt');
	await expect(zen.getByTestId('document-counts')).toContainText('74 Wörter');
	await zen.locator('mark').scrollIntoViewIfNeeded();
	await zen.locator('mark').selectText();
	await zen
		.getByRole('toolbar', { name: 'Auswahl formatieren' })
		.getByRole('button', { name: 'Link bearbeiten' })
		.click();
	await zen.getByLabel('Linkziel').press('Escape');
	await expect(zen.getByLabel('Linkziel')).toHaveCount(0);
	await expect(zen).toBeVisible();
	await page.keyboard.press('Control+Shift+f');
	await expect(zen).toHaveCount(0);
	await editor.getByRole('button', { name: 'Zen-Modus', exact: true }).click();
	await expect(zen).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(zen).toHaveCount(0);
	await page.getByRole('tab', { name: 'Markdown' }).click();
	await page.getByRole('textbox', { name: 'Markdown' }).fill('Hallo Welt');
	await expect(editor.getByTestId('document-counts')).toHaveText('2 Wörter 10 Zeichen');
	await page.getByRole('textbox', { name: 'Markdown' }).press('Control+s');
	await expect(editor.locator('.save-status')).toHaveText('Gespeichert');
	await page.reload();
	await expect(page.locator('.document-prose')).toHaveText('Hallo Welt');
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByTestId('document-counts')).toBeInViewport();
	await page.getByRole('button', { name: 'Zen-Modus', exact: true }).click();
	await expect(zen).toBeVisible();
	await expect(zen.getByTestId('document-counts')).toBeInViewport();
	await page.getByRole('button', { name: 'Zen-Modus beenden', exact: true }).click();
	await expect(zen).toHaveCount(0);
});

test('slash commands create blocks and mentions add owner-private backlinks', async ({ page }) => {
	await register(page);
	const targetId = await createNoteFromLibrary(page);
	await saveMarkdownDocument(page, {
		title: 'Zielbeitrag',
		markdown: 'Inhalt des Zielbeitrags',
		requestMarker: 'Zielbeitrag'
	});

	const sourceId = await createNoteFromLibrary(page);
	await page.getByLabel('Titel').fill('Quellbeitrag');
	const prose = page.getByTestId('document-editor').locator('.document-prose');
	await prose.click();
	await page.keyboard.type('/');
	const commands = page.getByRole('listbox', { name: 'Befehle' });
	await expect(commands).toBeVisible();
	await commands.getByRole('option', { name: /^Überschrift 2/ }).click();
	await page.keyboard.type('Einleitung');
	await page.keyboard.press('Enter');
	await page.keyboard.type('@Zielbeitrag');
	const ownDocuments = page.getByRole('listbox', { name: 'Eigene Beiträge' });
	await expect(ownDocuments.getByRole('option', { name: /Zielbeitrag/ })).toBeVisible();
	const linkedSave = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			response.url().endsWith(`/api/documents/${sourceId}`) &&
			(response.request().postData()?.includes(targetId) ?? false)
	);
	await ownDocuments.getByRole('option', { name: /Zielbeitrag/ }).click();
	await expect(prose.locator('h2')).toHaveText('Einleitung');
	await expect(prose.locator(`a[href="/notes/${targetId}"]`)).toHaveText('Zielbeitrag');
	expect((await linkedSave).ok()).toBe(true);
	await expect(page.getByTestId('document-editor').locator('.save-status')).toHaveText(
		'Gespeichert'
	);

	const sidePanel = page.getByRole('complementary', { name: 'Inhalt und Verknüpfungen' });
	await sidePanel.locator('.outline-rail').focus();
	await expect(sidePanel.getByRole('tab', { name: 'Verknüpfungen' })).toBeVisible();
	await sidePanel.getByRole('tab', { name: 'Verknüpfungen' }).click();
	const outgoing = sidePanel.getByRole('heading', { name: 'Verweist auf' }).locator('..');
	await expect(outgoing.getByRole('link', { name: /Zielbeitrag/ })).toBeVisible();
	await outgoing.getByRole('link', { name: /Zielbeitrag/ }).click();
	await expect(page).toHaveURL(`/notes/${targetId}`);

	const targetPanel = page.getByRole('complementary', { name: 'Inhalt und Verknüpfungen' });
	await targetPanel.locator('.outline-rail').focus();
	await expect(targetPanel.getByRole('tab', { name: 'Verknüpfungen' })).toBeVisible();
	await targetPanel.getByRole('tab', { name: 'Verknüpfungen' }).click();
	const incoming = targetPanel.getByRole('heading', { name: 'Hier erwähnt' }).locator('..');
	await expect(incoming.getByRole('link', { name: /Quellbeitrag/ })).toHaveAttribute(
		'href',
		`/notes/${sourceId}`
	);
});
