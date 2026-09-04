import { fail, redirect } from '@sveltejs/kit';
import { parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import {
	DocumentMarkdownError,
	MARKDOWN_ROUND_TRIP_LIMITATIONS,
	MAX_DOCUMENT_MARKDOWN_BYTES,
	previewObsidianMarkdown,
	type ObsidianDocumentPreview
} from '$lib/notes/document-markdown';
import { MAX_DOCUMENT_TAGS } from '$lib/notes/documents';
import {
	parseCalendarDate,
	prepareDocumentBody,
	requireDocumentUser,
	setPrivateNoStore
} from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	InvalidTagPathError,
	normalizeTagPath,
	syncDocumentTags
} from '$lib/server/repositories/document-tags';
import {
	createDocument,
	InvalidDocumentInputError,
	replaceDocumentPassages,
	softDeleteDocument,
	type DocumentPassageInput
} from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';

type ImportIssue =
	| { code: 'invalidPassage'; reference: string }
	| { code: 'invalidResource'; resourceId: string; reference: string }
	| { code: 'invalidTag'; tag: string }
	| { code: 'tooManyTags'; maximum: number };

type InspectedImport = {
	issues: ImportIssue[];
	warnings: string[];
	passages: DocumentPassageInput[];
};

function inspectImport(
	preview: ObsidianDocumentPreview,
	validBibleIds: ReadonlySet<string>
): InspectedImport {
	const issues: ImportIssue[] = [];
	const warnings = [...preview.warnings];
	const passages: DocumentPassageInput[] = [];

	for (const [position, candidate] of preview.passages.entries()) {
		const parsed = parsePassage(candidate.reference);
		const endpoints = parsed && passageToDbEndpoints(parsed);
		if (!endpoints) {
			issues.push({ code: 'invalidPassage', reference: candidate.reference });
			continue;
		}
		if (candidate.resourceId && !validBibleIds.has(candidate.resourceId)) {
			issues.push({
				code: 'invalidResource',
				resourceId: candidate.resourceId,
				reference: candidate.reference
			});
			continue;
		}
		passages.push({
			...endpoints,
			resourceId: candidate.resourceId ?? null,
			position
		});
	}

	if (preview.tags.length > MAX_DOCUMENT_TAGS) {
		issues.push({ code: 'tooManyTags', maximum: MAX_DOCUMENT_TAGS });
	}
	for (const tag of preview.tags) {
		try {
			normalizeTagPath(tag);
		} catch (caught) {
			if (!(caught instanceof InvalidTagPathError)) throw caught;
			issues.push({ code: 'invalidTag', tag });
		}
	}

	if (issues.some((issue) => issue.code === 'invalidPassage')) {
		warnings.push('At least one Bible passage could not be parsed and must be corrected.');
	}
	if (issues.some((issue) => issue.code === 'invalidResource')) {
		warnings.push('At least one passage names an unavailable Bible resource.');
	}
	if (issues.some((issue) => issue.code === 'invalidTag')) {
		warnings.push('At least one tag path is invalid or nested too deeply.');
	}
	if (issues.some((issue) => issue.code === 'tooManyTags')) {
		warnings.push(`A document may have at most ${MAX_DOCUMENT_TAGS} tags.`);
	}

	return { issues, warnings, passages };
}

function markdownFailure(caught: DocumentMarkdownError) {
	return fail(caught.code === 'file_too_large' ? 413 : 400, {
		error: caught.code,
		message: caught.message
	});
}

function decodedSource(bytes: Uint8Array): string {
	// `previewObsidianMarkdown()` has already applied the same fatal UTF-8 check. Decode again only so
	// the exact textual upload can travel through the explicit preview/confirm boundary.
	return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function load({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	requireDocumentUser(locals.user, url);

	return {
		maxFileBytes: MAX_DOCUMENT_MARKDOWN_BYTES,
		limitations: MARKDOWN_ROUND_TRIP_LIMITATIONS,
		bibles: await listBibles(getDb())
	};
}

export const actions = {
	/** Parse and sanitise one upload without writing any document state. */
	preview: async ({ request, locals, url, setHeaders }) => {
		setPrivateNoStore(setHeaders);
		requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const candidates = form.getAll('file');
		if (candidates.length !== 1 || !(candidates[0] instanceof File)) {
			return fail(400, {
				error: 'fileCount' as const,
				message: 'Select exactly one Markdown file.'
			});
		}

		const file = candidates[0];
		if (file.size === 0) {
			return fail(400, { error: 'emptyFile' as const, message: 'The Markdown file is empty.' });
		}
		if (file.size > MAX_DOCUMENT_MARKDOWN_BYTES) {
			return fail(413, {
				error: 'file_too_large' as const,
				message: 'Markdown files are limited to 1 MiB.'
			});
		}

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const preview = previewObsidianMarkdown(file.name, bytes);
			const validBibleIds = new Set((await listBibles(getDb())).map((bible) => bible.id));
			const inspected = inspectImport(preview, validBibleIds);
			return {
				preview: { ...preview, warnings: inspected.warnings },
				source: decodedSource(bytes),
				canImport: inspected.issues.length === 0,
				issues: inspected.issues
			};
		} catch (caught) {
			if (caught instanceof DocumentMarkdownError) return markdownFailure(caught);
			throw caught;
		}
	},

	/** Reparse the source shown in the preview; hidden parsed metadata is never authoritative. */
	confirm: async ({ request, locals, url, setHeaders }) => {
		setPrivateNoStore(setHeaders);
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const filenameValue = form.get('filename') ?? form.get('sourceFilename');
		const sourceValue = form.get('source');
		if (typeof filenameValue !== 'string' || typeof sourceValue !== 'string') {
			return fail(400, { error: 'previewRequired' as const });
		}

		let preview: ObsidianDocumentPreview;
		try {
			preview = previewObsidianMarkdown(filenameValue, sourceValue);
		} catch (caught) {
			if (caught instanceof DocumentMarkdownError) return markdownFailure(caught);
			throw caught;
		}

		const db = getDb();
		const validBibleIds = new Set((await listBibles(db)).map((bible) => bible.id));
		const inspected = inspectImport(preview, validBibleIds);
		if (inspected.issues.length > 0) {
			return fail(400, {
				error: inspected.issues[0]!.code,
				issues: inspected.issues,
				preview: { ...preview, warnings: inspected.warnings },
				source: sourceValue
			});
		}

		let sermonDate: Date | null = null;
		if (preview.sermon?.date) {
			const parsedDate = parseCalendarDate(preview.sermon.date);
			if (!parsedDate.ok || !parsedDate.value) {
				return fail(400, { error: 'invalidSermonDate' as const });
			}
			sermonDate = parsedDate.value;
		}

		let created: Awaited<ReturnType<typeof createDocument>> | undefined;
		let currentRevision: number | undefined;
		try {
			created = await createDocument(db, user.id, {
				kind: preview.kind,
				title: preview.title,
				visibility: 'private',
				source: 'obsidian',
				sourceFilename: preview.sourceFilename,
				sermonStatus: preview.kind === 'sermon' ? (preview.sermon?.status ?? 'idea') : undefined,
				sermonDate: preview.kind === 'sermon' ? sermonDate : undefined,
				sermonSeries: preview.kind === 'sermon' ? preview.sermon?.series : undefined,
				...prepareDocumentBody(preview.markdown)
			});
			currentRevision = created.revision;

			if (preview.tags.length > 0) {
				const tags = await syncDocumentTags(db, user.id, created.id, preview.tags, currentRevision);
				if (!tags.ok) {
					await softDeleteDocument(db, user.id, created.id);
					return fail(tags.reason === 'conflict' ? 409 : 500, {
						error: tags.reason,
						...(tags.reason === 'conflict' ? { currentRevision: tags.currentRevision } : {})
					});
				}
				currentRevision = tags.revision;
			}

			if (inspected.passages.length > 0) {
				const passages = await replaceDocumentPassages(
					db,
					user.id,
					created.id,
					inspected.passages,
					currentRevision
				);
				if (!passages.ok) {
					await softDeleteDocument(db, user.id, created.id);
					if (passages.reason === 'conflict') {
						return fail(409, {
							error: passages.reason,
							currentRevision: passages.currentRevision
						});
					}
					if (passages.reason === 'invalidResource') {
						return fail(400, {
							error: passages.reason,
							resourceId: passages.resourceId
						});
					}
					return fail(500, { error: passages.reason });
				}
				currentRevision = passages.revision;
			}
		} catch (caught) {
			if (created) {
				await softDeleteDocument(db, user.id, created.id, currentRevision).catch(() => undefined);
			}
			if (caught instanceof InvalidTagPathError) {
				return fail(400, { error: 'invalidTag' as const });
			}
			if (caught instanceof InvalidDocumentInputError) {
				return fail(400, { error: caught.code });
			}
			if (caught instanceof DocumentMarkdownError) return markdownFailure(caught);
			throw caught;
		}

		redirect(303, `/notes/${encodeURIComponent(created.id)}`);
	}
};
