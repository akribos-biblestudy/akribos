import { fail, redirect } from '@sveltejs/kit';
import { parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import { t } from '$lib/i18n';
import {
	DocumentMarkdownError,
	MARKDOWN_ROUND_TRIP_LIMITATIONS,
	previewObsidianMarkdown,
	type ObsidianDocumentPreview
} from '$lib/notes/document-markdown';
import {
	isDocumentPassageCountAllowed,
	MAX_DOCUMENT_MARKDOWN_BYTES,
	MAX_DOCUMENT_PASSAGES,
	MAX_DOCUMENT_TAGS,
	MAX_OBSIDIAN_FRONTMATTER_BYTES,
	MAX_OBSIDIAN_IMPORT_BYTES
} from '$lib/notes/documents';
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
	type DocumentPassageInput
} from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';
import {
	InvalidFormBodyError,
	readBoundedFormData,
	RequestBodyTooLargeError
} from './bounded-form-data';
import { localizeImportError, localizeImportMessage } from './import-messages';

const MAX_IMPORT_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_IMPORT_PREVIEW_REQUEST_BYTES =
	MAX_OBSIDIAN_IMPORT_BYTES + MAX_IMPORT_MULTIPART_OVERHEAD_BYTES;
// Browsers may normalise every textarea LF to CRLF inside the confirmation multipart body.
const MAX_IMPORT_CONFIRM_REQUEST_BYTES =
	MAX_OBSIDIAN_IMPORT_BYTES * 2 + MAX_IMPORT_MULTIPART_OVERHEAD_BYTES;

type ImportIssue =
	| { code: 'invalidPassage'; reference: string }
	| { code: 'invalidResource'; resourceId: string; reference: string }
	| { code: 'invalidTag'; tag: string }
	| { code: 'tooManyTags'; maximum: number }
	| { code: 'tooManyPassages'; maximum: number };

type InspectedImport = {
	issues: ImportIssue[];
	warnings: string[];
	passages: DocumentPassageInput[];
};

type ImportPersistenceFailure = {
	error: 'conflict' | 'invalidResource' | 'notFound';
	currentRevision?: number;
	resourceId?: string;
};

/** Throwing this value makes the outer transaction roll back before the action formats its reply. */
class ImportPersistenceError extends Error {
	readonly status: 400 | 409 | 500;
	readonly failure: ImportPersistenceFailure;

	constructor(status: 400 | 409 | 500, failure: ImportPersistenceFailure) {
		super(`document import persistence failed: ${failure.error}`);
		this.name = 'ImportPersistenceError';
		this.status = status;
		this.failure = failure;
	}
}

function inspectImport(
	preview: ObsidianDocumentPreview,
	validBibleIds: ReadonlySet<string>
): InspectedImport {
	const issues: ImportIssue[] = [];
	const warnings = [...preview.warnings];
	const passages: DocumentPassageInput[] = [];

	if (!isDocumentPassageCountAllowed(preview.passages.length)) {
		issues.push({ code: 'tooManyPassages', maximum: MAX_DOCUMENT_PASSAGES });
	}
	for (const [position, candidate] of preview.passages.slice(0, MAX_DOCUMENT_PASSAGES).entries()) {
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
	if (issues.some((issue) => issue.code === 'tooManyPassages')) {
		warnings.push(`A document may have at most ${MAX_DOCUMENT_PASSAGES} passage anchors.`);
	}

	return { issues, warnings: warnings.map(localizeImportMessage), passages };
}

function markdownFailure(caught: DocumentMarkdownError) {
	return fail(caught.code === 'file_too_large' ? 413 : 400, {
		error: caught.code,
		message: localizeImportError(caught.code)
	});
}

function importFormFailure(caught: unknown) {
	if (caught instanceof RequestBodyTooLargeError) {
		return fail(413, {
			error: 'request_too_large' as const,
			message: t('documents.import.error.requestTooLarge')
		});
	}
	if (caught instanceof InvalidFormBodyError) {
		return fail(400, {
			error: 'invalid_form' as const,
			message: t('documents.import.error.invalidForm')
		});
	}
	return null;
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
		maxFileBytes: MAX_OBSIDIAN_IMPORT_BYTES,
		maxBodyBytes: MAX_DOCUMENT_MARKDOWN_BYTES,
		maxFrontmatterBytes: MAX_OBSIDIAN_FRONTMATTER_BYTES,
		maxPassages: MAX_DOCUMENT_PASSAGES,
		limitations: MARKDOWN_ROUND_TRIP_LIMITATIONS.map(localizeImportMessage),
		bibles: await listBibles(getDb())
	};
}

export const actions = {
	/** Parse and sanitise one upload without writing any document state. */
	preview: async ({ request, locals, url }) => {
		requireDocumentUser(locals.user, url);
		let form: FormData;
		try {
			form = await readBoundedFormData(request, MAX_IMPORT_PREVIEW_REQUEST_BYTES);
		} catch (caught) {
			const failure = importFormFailure(caught);
			if (failure) return failure;
			throw caught;
		}
		const candidates = form.getAll('file');
		if (candidates.length !== 1 || !(candidates[0] instanceof File)) {
			return fail(400, {
				error: 'fileCount' as const,
				message: t('documents.import.error.fileCount')
			});
		}

		const file = candidates[0];
		if (file.size === 0) {
			return fail(400, {
				error: 'emptyFile' as const,
				message: t('documents.import.error.emptyFile')
			});
		}
		if (file.size > MAX_OBSIDIAN_IMPORT_BYTES) {
			return fail(413, {
				error: 'file_too_large' as const,
				message: t('documents.import.error.fileTooLarge')
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
	confirm: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		let form: FormData;
		try {
			form = await readBoundedFormData(request, MAX_IMPORT_CONFIRM_REQUEST_BYTES);
		} catch (caught) {
			const failure = importFormFailure(caught);
			if (failure) return failure;
			throw caught;
		}
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

		let created: Awaited<ReturnType<typeof createDocument>>;
		try {
			created = await db.transaction(async (transaction) => {
				// Repository mutations open their own transactions; postgres-js maps these nested calls to
				// savepoints while this outer transaction remains the all-or-nothing import boundary.
				const transactionDb = transaction as unknown as typeof db;
				const document = await createDocument(transactionDb, user.id, {
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
				let currentRevision = document.revision;

				if (preview.tags.length > 0) {
					const tags = await syncDocumentTags(
						transactionDb,
						user.id,
						document.id,
						preview.tags,
						currentRevision
					);
					if (!tags.ok) {
						if (tags.reason === 'conflict') {
							throw new ImportPersistenceError(409, {
								error: tags.reason,
								currentRevision: tags.currentRevision
							});
						}
						throw new ImportPersistenceError(500, { error: tags.reason });
					}
					currentRevision = tags.revision;
				}

				if (inspected.passages.length > 0) {
					const passages = await replaceDocumentPassages(
						transactionDb,
						user.id,
						document.id,
						inspected.passages,
						currentRevision
					);
					if (!passages.ok) {
						if (passages.reason === 'conflict') {
							throw new ImportPersistenceError(409, {
								error: passages.reason,
								currentRevision: passages.currentRevision
							});
						}
						if (passages.reason === 'invalidResource') {
							throw new ImportPersistenceError(400, {
								error: passages.reason,
								resourceId: passages.resourceId
							});
						}
						throw new ImportPersistenceError(500, { error: passages.reason });
					}
				}

				return document;
			});
		} catch (caught) {
			if (caught instanceof ImportPersistenceError) {
				return fail(caught.status, caught.failure);
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
