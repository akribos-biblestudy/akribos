/**
 * Small application-layer helpers shared by the notes pages and JSON endpoints.
 *
 * The repositories own database authorization and optimistic locking. These helpers keep request
 * parsing, Markdown derivation and redirect/cache policy consistent without pulling HTTP concerns
 * into the pure document domain.
 */

import { redirect } from '@sveltejs/kit';
import { documentMarkdownToHtml, normalizeDocumentMarkdown } from '$lib/notes/document-markdown';
import type { PreparedDocumentBody } from '$lib/server/repositories/documents';

export const PRIVATE_NO_STORE = 'private, no-store';
export const MAX_DOCUMENT_JSON_BYTES = 2 * 1024 * 1024 + 64 * 1024;
export const MAX_DOCUMENT_QUERY_LENGTH = 200;
export const MAX_PUBLICATION_EXCERPT_LENGTH = 500;

export function setPrivateNoStore(setHeaders: (headers: Record<string, string>) => void): void {
	setHeaders({ 'cache-control': PRIVATE_NO_STORE });
}

export function requireDocumentUser(
	user: App.Locals['user'],
	url: URL
): NonNullable<App.Locals['user']> {
	if (!user) {
		const redirectTo = `${url.pathname}${url.search}`;
		redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}
	return user;
}

/** Store Markdown only after the portable source and both derivatives agree. */
export function prepareDocumentBody(markdown: string): PreparedDocumentBody {
	const bodyMarkdown = normalizeDocumentMarkdown(markdown);
	const { html: bodyHtml, plainText } = documentMarkdownToHtml(bodyMarkdown);
	return { bodyMarkdown, bodyHtml, plainText };
}

/** A same-origin path that is safe to place in links or redirects. */
export function safeReturnTo(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const candidate = value.trim();
	if (
		!candidate.startsWith('/') ||
		candidate.startsWith('//') ||
		candidate.includes('\\') ||
		Array.from(candidate).some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code <= 0x1f || code === 0x7f;
		})
	) {
		return null;
	}
	try {
		const parsed = new URL(candidate, 'https://akribos.local');
		return parsed.origin === 'https://akribos.local'
			? `${parsed.pathname}${parsed.search}${parsed.hash}`
			: null;
	} catch {
		return null;
	}
}

export function parseOptionalRevision(value: unknown): number | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	const revision = typeof value === 'number' ? value : Number(String(value));
	return Number.isSafeInteger(revision) && revision > 0 ? revision : undefined;
}

export function parseRequiredRevision(value: unknown): number | null {
	return parseOptionalRevision(value) ?? null;
}

export function isUuid(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
	);
}

export function parseCalendarDate(
	value: unknown
): { ok: true; value: Date | null } | { ok: false } {
	if (value === null || value === undefined || value === '') return { ok: true, value: null };
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return { ok: false };

	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year!, month! - 1, day!));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month! - 1 ||
		date.getUTCDate() !== day
	) {
		return { ok: false };
	}
	return { ok: true, value: date };
}

export function formatCalendarDate(value: Date | null): string | undefined {
	return value?.toISOString().slice(0, 10);
}

/** German-friendly, deterministic publication slug. */
export function slugifyArticle(value: string): string {
	return value
		.normalize('NFKC')
		.replaceAll('ß', 'ss')
		.replaceAll('ẞ', 'ss')
		.replaceAll('ä', 'ae')
		.replaceAll('ö', 'oe')
		.replaceAll('ü', 'ue')
		.replaceAll('Ä', 'Ae')
		.replaceAll('Ö', 'Oe')
		.replaceAll('Ü', 'Ue')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 160)
		.replace(/-+$/u, '');
}

export function normalizeExcerpt(value: unknown): string {
	return typeof value === 'string'
		? value.replace(/\s+/gu, ' ').trim().slice(0, MAX_PUBLICATION_EXCERPT_LENGTH)
		: '';
}

export function documentEditorUrl(documentId: string, returnTo: unknown): string {
	const safe = safeReturnTo(returnTo);
	const query = safe ? `?returnTo=${encodeURIComponent(safe)}` : '';
	return `/notes/${encodeURIComponent(documentId)}${query}`;
}
