import { expect, test as base, type Page } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testDatabaseUrl } from '../scripts/lib/test-database.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import {
	documents,
	readerBrowserTabs,
	savedReaderWorkspaces,
	sessions,
	users
} from '../src/lib/server/db/schema.ts';
import { documentMarkdownToHtml } from '../src/lib/notes/document-markdown.ts';

type Message = Record<string, unknown>;
type NativePage = Window & {
	AkribosEditor: { postMessage: (raw: string) => void };
	akribosEditorBridge: { receive: (message: Message) => void };
	appEditorMessages: Message[];
};
type Fixture = {
	db: ReturnType<typeof createDb>['db'];
	userId: string;
	sessionId: string;
	create: (markdown: string) => Promise<string>;
};

// Exercise the embedded route exactly as WebView loads it: only the normal
// session cookie, no app headers, reader cookies, browser workspace or login UI.
const test = base.extend<{ editorAccount: Fixture }>({
	editorAccount: async ({ context, baseURL }, use) => {
		const { db, client } = createDb(
			process.env.E2E_DATABASE_URL ??
				testDatabaseUrl(
					process.env.DATABASE_URL ?? 'postgres://strongs:strongs@localhost:5432/strongs'
				),
			{ max: 1 }
		);
		const userId = randomUUID();
		const token = randomBytes(32).toString('base64url');
		const sessionId = createHash('sha256').update(token).digest('hex');
		try {
			await db.insert(users).values({
				id: userId,
				email: `app-editor-${userId}@example.test`,
				displayName: 'App Editor Test',
				emailVerifiedAt: new Date(),
				tourCompletedAt: new Date()
			});
			await db.insert(sessions).values({
				id: sessionId,
				userId,
				expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
			});
			await context.clearCookies();
			await context.addCookies([
				{ name: 'session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' }
			]);
			await use({
				db,
				userId,
				sessionId,
				create: async (markdown) => {
					const rendered = documentMarkdownToHtml(markdown);
					const id = randomUUID();
					await db.insert(documents).values({
						id,
						userId,
						kind: 'note',
						title: 'Getragen durch Hoffnung',
						bodyMarkdown: markdown,
						bodyHtml: rendered.html,
						plainText: rendered.plainText
					});
					return id;
				}
			});
		} finally {
			await db.delete(users).where(eq(users.id, userId));
			await client.end();
		}
	}
});

test.use({ viewport: { width: 390, height: 844 } });

async function openEditor(page: Page, documentId: string, theme = 'light') {
	await page.addInitScript(() => {
		const host = window as NativePage;
		host.appEditorMessages = [];
		host.AkribosEditor = {
			postMessage: (raw) => host.appEditorMessages.push(JSON.parse(raw) as Message)
		};
	});
	const instanceId = randomUUID();
	const response = await page.goto(
		`/app/editor/${documentId}?${new URLSearchParams({ instanceId, theme, fontScale: '100' })}`
	);
	expect(response?.status()).toBe(200);
	expect(response?.headers()['cache-control']).toBe('private, no-store');
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as NativePage).appEditorMessages.some((message) => message.type === 'ready')
			)
		)
		.toBe(true);
	const ready = await page.evaluate(() =>
		(window as NativePage).appEditorMessages.find((message) => message.type === 'ready')!
	);
	expect(ready.documentId).toBe(documentId);
	expect(ready.instanceId).toBe(instanceId);
	return async (method: string, payload: Message = {}) => {
		const id = randomUUID();
		await page.evaluate((message) => (window as NativePage).akribosEditorBridge.receive(message), {
			...payload,
			protocol: 1,
			documentId,
			userId: ready.userId,
			instanceId,
			id,
			method
		});
		await expect
			.poll(() =>
				page.evaluate(
					(id) =>
						(window as NativePage).appEditorMessages.some(
							(message) => message.type === 'response' && message.id === id
						),
					id
				)
			)
			.toBe(true);
		const reply = await page.evaluate(
			(id) =>
				(window as NativePage).appEditorMessages.find(
					(message) => message.type === 'response' && message.id === id
				)!,
			id
		);
		expect(reply.method).toBe(method);
		expect(reply.ok, String(reply.error ?? method)).toBe(true);
		return reply;
	};
}

async function saved(fixture: Fixture, id: string) {
	return (await fixture.db.select().from(documents).where(eq(documents.id, id)))[0]!;
}

const richSource =
	'## Hoffnung\n\nEin unveränderter Absatz mit <u>Unterstreichung</u> und <mark>Hervorhebung</mark>.\n\n' +
	'-   **Verantwortung**\n\n    -   Ein Kindpunkt\n\n        > Ein Zitat innerhalb der Unterliste.\n\n-   Ein zweiter Hauptpunkt\n\n' +
	'| Gedanke | Quelle |\n| :--- | ---: |\n| **Geduld** | Hinweis[^quelle] |\n\n' +
	'[Bibelstelle](/Joh3,16) und nochmals dieselbe Quelle[^quelle].\n\n' +
	'[^quelle]: Eine **formatierte Fußnote**.\n\n    Ein zweiter Absatz bleibt erhalten.\n';

test('embedded open and reading changes preserve source and never initialize a Reader workspace', async ({
	page,
	editorAccount
}) => {
	const id = await editorAccount.create(richSource);
	const writes: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'PATCH') writes.push(new URL(request.url()).pathname);
	});
	const command = await openEditor(page, id);
	await expect(page.locator('.tiptap')).toHaveAttribute('contenteditable', 'false');
	await command('initialize', { mode: 'edit' });
	await command('prepareMutation');
	await command('setMode', { mode: 'read' });
	await command('cancelMutation');
	await expect(page.locator('.tiptap')).toHaveAttribute('contenteditable', 'false');
	await expect(page.locator('[data-document-editor] h1')).toHaveText('Getragen durch Hoffnung');
	await command('prepareMutation');
	await command('setMode', { mode: 'edit' });
	await command('cancelMutation');
	await command('flush');
	expect(writes).toEqual([]);
	expect(await saved(editorAccount, id)).toMatchObject({ bodyMarkdown: richSource, revision: 1 });
	expect(
		await editorAccount.db
			.select()
			.from(savedReaderWorkspaces)
			.where(eq(savedReaderWorkspaces.userId, editorAccount.userId))
	).toEqual([]);
	expect(
		await editorAccount.db
			.select()
			.from(readerBrowserTabs)
			.where(eq(readerBrowserTabs.sessionId, editorAccount.sessionId))
	).toEqual([]);
	const [account] = await editorAccount.db
		.select()
		.from(users)
		.where(eq(users.id, editorAccount.userId));
	expect(account?.readerWorkspace).toBeNull();
	const [session] = await editorAccount.db
		.select()
		.from(sessions)
		.where(eq(sessions.id, editorAccount.sessionId));
	expect(session).toMatchObject({ activeReaderWorkspaceId: null, readerWorkspaceVersion: 0 });
	expect((await page.context().cookies()).map((cookie) => cookie.name)).toEqual(['session']);
});

test('real input rules and native lifecycle reserve, save and resume the same editor', async ({
	page,
	editorAccount
}) => {
	const id = await editorAccount.create('');
	const command = await openEditor(page, id);
	await command('initialize', { mode: 'edit' });
	const editor = page.locator('.tiptap');
	await editor.click();
	await page.keyboard.type('## ');
	await expect(editor.locator('h2')).toHaveCount(1);
	await page.keyboard.insertText('Hoffnung wächst');
	await page.keyboard.press('Enter');
	await page.keyboard.type('- ');
	await expect(editor.locator('ul > li')).toHaveCount(1);
	await page.keyboard.insertText('Geduld lernen');
	await command('prepareMutation');
	await command('pause');
	await expect(editor).toHaveAttribute('contenteditable', 'false');
	const first = await saved(editorAccount, id);
	expect(first.bodyMarkdown).toContain('## Hoffnung wächst');
	expect(first.bodyMarkdown).toMatch(/-\s+Geduld lernen/);
	await command('resume');
	await expect(editor).toHaveAttribute('contenteditable', 'true');
	await editor.locator('li p').click();
	await page.keyboard.press('End');
	await page.keyboard.insertText(' und weitergeben');
	const prepared = await command('prepareMutation');
	const revision = (prepared.snapshot as { revision: number }).revision;
	const update = await page.request.patch(`/api/documents/${id}`, {
		data: {
			revision,
			title: 'Hoffnung gemeinsam leben',
			markdown: (prepared.snapshot as { markdown: string }).markdown
		}
	});
	expect(update.ok()).toBe(true);
	const current = (await update.json()).document;
	await command('finishMutation', { document: current });
	await expect(editor).toHaveAttribute('contenteditable', 'true');
	await expect(page.getByTestId('reader-notes-sidecar-title')).toHaveValue(
		'Hoffnung gemeinsam leben'
	);
	await command('flush');
	expect((await saved(editorAccount, id)).bodyMarkdown).toContain('und weitergeben');
});

test('editing preserves nested quotes, tables and repeated rich footnotes, and links stay inside the native bridge', async ({
	page,
	editorAccount
}, testInfo) => {
	const id = await editorAccount.create(richSource);
	const command = await openEditor(page, id);
	await command('initialize', { mode: 'edit' });
	const editor = page.locator('.tiptap');
	await expect(editor.locator('ul ul blockquote')).toContainText('Zitat innerhalb der Unterliste');
	await expect(editor.locator('table th')).toHaveCount(2);
	await expect(editor.locator('sup[data-footnote-ref="quelle"]')).toHaveCount(2);
	await expect(editor.locator('li[data-footnote-id="quelle"]')).toContainText(
		'Ein zweiter Absatz bleibt erhalten'
	);
	const paragraph = editor.locator(':scope > p').first();
	await paragraph.click();
	await paragraph.evaluate((element) => {
		const caret = document.createRange();
		caret.selectNodeContents(element);
		caret.collapse(false);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(caret);
	});
	await page.keyboard.insertText(' Eine Ergänzung.');
	// Native draft cleanup needs unsolicited autosave acknowledgements, not just
	// a later explicit flush response. Exercise the actual debounce/effect path.
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as NativePage).appEditorMessages.some((message) => {
					const state = message.snapshot as Message | undefined;
					return (
						message.type === 'state' &&
						state?.status === 'saved' &&
						typeof state.markdown === 'string' &&
						state.markdown.includes('Eine Ergänzung.')
					);
				})
			)
		)
		.toBe(true);
	await command('flush');
	const stored = await saved(editorAccount, id);
	expect(stored.bodyMarkdown).toContain('Eine Ergänzung.');
	expect(stored.bodyHtml).toContain('<u>Unterstreichung</u>');
	expect(stored.bodyHtml).toContain('<mark>Hervorhebung</mark>');
	expect(stored.bodyHtml).toContain('<blockquote>');
	expect(stored.bodyHtml).toContain('<table>');
	expect(stored.bodyHtml.match(/data-footnote-ref="quelle"/g)).toHaveLength(2);
	expect(stored.bodyHtml).toContain('<strong>formatierte Fußnote</strong>');
	await command('prepareMutation');
	await command('setMode', { mode: 'read' });
	await command('cancelMutation');
	await editor.getByRole('link', { name: 'Bibelstelle', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as NativePage).appEditorMessages.some(
					(message) => message.type === 'navigate' && message.path === '/Joh3,16'
				)
			)
		)
		.toBe(true);
	expect(new URL(page.url()).pathname).toBe(`/app/editor/${id}`);
	const reopened = await openEditor(page, id);
	await reopened('initialize', { mode: 'read' });
	await expect(editor.locator('ul ul blockquote')).toContainText('Zitat innerhalb der Unterliste');
	await expect(editor.locator('table th')).toHaveCount(2);
	await expect(editor.locator('sup[data-footnote-ref="quelle"]')).toHaveCount(2);
	await page.screenshot({ path: testInfo.outputPath('editor-phone-390.png') });
	await page.setViewportSize({ width: 840, height: 1000 });
	const dark = await openEditor(page, id, 'dark');
	await dark('initialize', { mode: 'read' });
	await page.screenshot({ path: testInfo.outputPath('editor-tablet-840-dark.png') });
});
