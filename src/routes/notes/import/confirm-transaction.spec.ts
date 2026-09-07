import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_DOCUMENT_MARKDOWN_BYTES,
	MAX_OBSIDIAN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES,
	utf8ByteLength
} from '$lib/notes/documents';

const mocks = vi.hoisted(() => ({
	db: { transaction: vi.fn() },
	transactionDb: { marker: 'import-transaction' },
	listBibles: vi.fn(),
	createDocument: vi.fn(),
	importSermonColumn: vi.fn(),
	syncDocumentTags: vi.fn(),
	replaceDocumentPassages: vi.fn(),
	addSermonDelivery: vi.fn(),
	committed: false,
	rolledBack: false
}));

vi.mock('$lib/server/db', () => ({ getDb: () => mocks.db }));

vi.mock('$lib/server/repositories/resources', () => ({
	listBibles: mocks.listBibles
}));

vi.mock('$lib/server/repositories/document-tags', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/repositories/document-tags')>();
	return { ...actual, syncDocumentTags: mocks.syncDocumentTags };
});

vi.mock('$lib/server/repositories/documents', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/repositories/documents')>();
	return {
		...actual,
		createDocument: mocks.createDocument,
		replaceDocumentPassages: mocks.replaceDocumentPassages
	};
});

vi.mock('$lib/server/repositories/sermon-board', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/repositories/sermon-board')>();
	return { ...actual, importSermonColumn: mocks.importSermonColumn };
});

vi.mock('$lib/server/repositories/sermon-deliveries', () => ({
	addSermonDelivery: mocks.addSermonDelivery
}));

import { actions } from './+page.server.ts';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.importSermonColumn.mockImplementation(async (_db, _user, status) => status);
	mocks.committed = false;
	mocks.rolledBack = false;
	mocks.db.transaction.mockImplementation(async (callback) => {
		try {
			const result = await callback(mocks.transactionDb);
			mocks.committed = true;
			return result;
		} catch (caught) {
			mocks.rolledBack = true;
			throw caught;
		}
	});
});

describe('Obsidian import confirmation transaction', () => {
	it('identifies the failing file in a loose Markdown preview batch', async () => {
		mocks.listBibles.mockResolvedValue([]);
		const form = new FormData();
		form.append('file', new File(['# Gültig\n'], 'gueltig.md', { type: 'text/markdown' }));
		form.append(
			'file',
			new File(['---\ntitle: [ungueltig\n---\nText\n'], 'defekt.md', {
				type: 'text/markdown'
			})
		);
		const request = new Request('http://localhost/notes/import?/preview', {
			method: 'POST',
			body: form
		});

		const result = await actions.preview({
			request,
			url: new URL(request.url),
			locals: { user: { id: 'import-owner' } }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'invalid_frontmatter', filename: 'defekt.md' }
		});
	});

	it('accepts a near-limit LF upload after browser textarea submission expands it to CRLF', async () => {
		mocks.listBibles.mockResolvedValue([]);
		mocks.createDocument.mockResolvedValue({
			id: '75ad7f30-7480-4c25-8778-72bfa1878a66',
			revision: 1
		});

		const repeatedLines = 'x\n'.repeat(MAX_OBSIDIAN_FRONTMATTER_BYTES + 32);
		const prefix = `# Grenzfall\n${repeatedLines}`;
		const filler = 'z'.repeat(MAX_DOCUMENT_MARKDOWN_BYTES - utf8ByteLength(prefix) - 1);
		const uploadedSource = `${prefix}${filler}\n`;
		const submittedSource = uploadedSource.replaceAll('\n', '\r\n');
		expect(utf8ByteLength(uploadedSource)).toBe(MAX_DOCUMENT_MARKDOWN_BYTES);
		expect(utf8ByteLength(submittedSource)).toBeGreaterThan(MAX_OBSIDIAN_IMPORT_BYTES);

		const form = new FormData();
		form.set('filename', 'crlf-grenzfall.md');
		form.set('source', submittedSource);
		const request = new Request('http://localhost/notes/import?/confirm', {
			method: 'POST',
			body: form
		});

		await expect(
			actions.confirm({
				request,
				url: new URL(request.url),
				locals: { user: { id: 'import-owner' } }
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/notes/75ad7f30-7480-4c25-8778-72bfa1878a66'
		});

		expect(mocks.committed).toBe(true);
		expect(mocks.rolledBack).toBe(false);
		expect(mocks.createDocument).toHaveBeenCalledWith(
			mocks.transactionDb,
			'import-owner',
			expect.objectContaining({
				bodyMarkdown: uploadedSource,
				source: 'obsidian',
				visibility: 'private'
			})
		);
	});

	it('rolls back document and tags when passage persistence fails', async () => {
		mocks.listBibles.mockResolvedValue([{ id: 'REMOVED-BIBLE' }]);
		mocks.createDocument.mockResolvedValue({
			id: '44c252c5-305c-4cb2-a927-e193b86dbbd8',
			revision: 1
		});
		mocks.syncDocumentTags.mockResolvedValue({ ok: true, revision: 2, tags: [] });
		mocks.replaceDocumentPassages.mockResolvedValue({
			ok: false,
			reason: 'invalidResource',
			resourceId: 'REMOVED-BIBLE'
		});

		const form = new FormData();
		form.set('filename', 'atomar.md');
		form.set(
			'source',
			`---
title: Atomarer Import
tags: [Import/Rollback]
passages:
  - reference: Joh 3,16
    resource: REMOVED-BIBLE
---
Text
`
		);
		const request = new Request('http://localhost/notes/import?/confirm', {
			method: 'POST',
			body: form
		});

		const result = await actions.confirm({
			request,
			url: new URL(request.url),
			locals: { user: { id: 'import-owner' } }
		} as never);

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'invalidResource', resourceId: 'REMOVED-BIBLE' }
		});
		expect(mocks.committed).toBe(false);
		expect(mocks.rolledBack).toBe(true);
		expect(mocks.createDocument.mock.calls[0]?.[0]).toBe(mocks.transactionDb);
		expect(mocks.syncDocumentTags.mock.calls[0]?.[0]).toBe(mocks.transactionDb);
		expect(mocks.replaceDocumentPassages.mock.calls[0]?.[0]).toBe(mocks.transactionDb);
		expect(mocks.syncDocumentTags).toHaveBeenCalledBefore(mocks.replaceDocumentPassages);
	});

	it('imports multiple loose-file previews in one transaction and returns to the unified library', async () => {
		mocks.listBibles.mockResolvedValue([]);
		mocks.createDocument
			.mockResolvedValueOnce({ id: '75ad7f30-7480-4c25-8778-72bfa1878a61', revision: 1 })
			.mockResolvedValueOnce({ id: '75ad7f30-7480-4c25-8778-72bfa1878a62', revision: 1 });
		const form = new FormData();
		form.set(
			'sourcePackage',
			JSON.stringify([
				{ filename: 'eins.md', source: 'Erste Notiz\n' },
				{ filename: 'zwei.md', source: 'Zweite Notiz\n' }
			])
		);
		const request = new Request('http://localhost/notes/import?/confirm', {
			method: 'POST',
			body: form
		});

		await expect(
			actions.confirm({
				request,
				url: new URL(request.url),
				locals: { user: { id: 'import-owner' } }
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/notes' });

		expect(mocks.committed).toBe(true);
		expect(mocks.createDocument).toHaveBeenCalledTimes(2);
		expect(mocks.createDocument.mock.calls.every((call) => call[0] === mocks.transactionDb)).toBe(
			true
		);
	});

	it('restores exported sermon delivery history with revision guards', async () => {
		mocks.listBibles.mockResolvedValue([]);
		mocks.createDocument.mockResolvedValue({
			id: '75ad7f30-7480-4c25-8778-72bfa1878a63',
			revision: 1
		});
		mocks.addSermonDelivery
			.mockResolvedValueOnce({ ok: true, revision: 2 })
			.mockResolvedValueOnce({ ok: true, revision: 3 });
		const form = new FormData();
		form.set('filename', 'predigt.md');
		form.set(
			'source',
			`---
title: Ausarbeitung
type: sermon
sermon:
  status: delivered
  deliveries:
    - date: 2026-09-06
      location: Gemeinde Nord
    - date: 2026-09-13
      location: Hauskreis Süd
---
Text
`
		);
		const request = new Request('http://localhost/notes/import?/confirm', {
			method: 'POST',
			body: form
		});

		await expect(
			actions.confirm({
				request,
				url: new URL(request.url),
				locals: { user: { id: 'import-owner' } }
			} as never)
		).rejects.toMatchObject({ status: 303 });

		expect(mocks.importSermonColumn).toHaveBeenCalledWith(
			mocks.transactionDb,
			'import-owner',
			'delivered',
			undefined
		);
		expect(mocks.addSermonDelivery).toHaveBeenNthCalledWith(
			1,
			mocks.transactionDb,
			'import-owner',
			'75ad7f30-7480-4c25-8778-72bfa1878a63',
			1,
			expect.objectContaining({ location: 'Gemeinde Nord' })
		);
		expect(mocks.addSermonDelivery).toHaveBeenNthCalledWith(
			2,
			mocks.transactionDb,
			'import-owner',
			'75ad7f30-7480-4c25-8778-72bfa1878a63',
			2,
			expect.objectContaining({ location: 'Hauskreis Süd' })
		);
	});
});
