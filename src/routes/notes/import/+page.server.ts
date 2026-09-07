import { importSermonColumn, SermonColumnImportError } from '$lib/server/repositories/sermon-board';
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
	extractObsidianMarkdownArchive,
	MAX_OBSIDIAN_ARCHIVE_BYTES,
	MAX_OBSIDIAN_DECOMPRESSED_BYTES,
	MAX_OBSIDIAN_IMPORT_FILES,
	ObsidianArchiveError,
	type ObsidianMarkdownSource
} from '$lib/notes/obsidian-archive';
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
import { addSermonDelivery } from '$lib/server/repositories/sermon-deliveries';
import {
	InvalidFormBodyError,
	readBoundedFormData,
	RequestBodyTooLargeError
} from '$lib/server/http/bounded-form-data';
import { localizeImportError, localizeImportMessage } from './import-messages';

const MAX_IMPORT_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_IMPORT_PREVIEW_REQUEST_BYTES =
	MAX_OBSIDIAN_ARCHIVE_BYTES + MAX_IMPORT_MULTIPART_OVERHEAD_BYTES;
// Browsers may normalise every textarea LF to CRLF inside the confirmation multipart body.
const MAX_IMPORT_CONFIRM_REQUEST_BYTES =
	MAX_OBSIDIAN_DECOMPRESSED_BYTES * 2 + MAX_IMPORT_MULTIPART_OVERHEAD_BYTES;

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
	filename?: string;
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

function markdownFailure(caught: DocumentMarkdownError, filename?: string) {
	return fail(caught.code === 'file_too_large' ? 413 : 400, {
		error: caught.code,
		message: localizeImportError(caught.code),
		...(filename ? { filename } : {})
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

function archiveFailure(caught: ObsidianArchiveError, archiveFilename: string) {
	return fail(caught.code === 'archive_too_large' ? 413 : 400, {
		error: caught.code,
		message: t(`documents.import.error.${caught.code}`),
		filename: caught.filename ?? archiveFilename
	});
}

function sourcePackage(value: unknown): Array<{ filename: string; source: string }> | null {
	const encoder = new TextEncoder();
	if (
		typeof value !== 'string' ||
		encoder.encode(value).byteLength > MAX_OBSIDIAN_DECOMPRESSED_BYTES * 2
	) {
		return null;
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_OBSIDIAN_IMPORT_FILES)
			return null;
		let totalBytes = 0;
		const result = parsed.map((item) => {
			if (!item || typeof item !== 'object') throw new Error('invalid package');
			const candidate = item as Record<string, unknown>;
			if (typeof candidate.filename !== 'string' || typeof candidate.source !== 'string')
				throw new Error('invalid package');
			totalBytes += encoder.encode(candidate.source).byteLength;
			return { filename: candidate.filename, source: candidate.source };
		});
		if (totalBytes > MAX_OBSIDIAN_DECOMPRESSED_BYTES) return null;
		return result;
	} catch {
		return null;
	}
}

export async function load({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	requireDocumentUser(locals.user, url);

	return {
		maxFileBytes: MAX_OBSIDIAN_IMPORT_BYTES,
		maxBodyBytes: MAX_DOCUMENT_MARKDOWN_BYTES,
		maxFrontmatterBytes: MAX_OBSIDIAN_FRONTMATTER_BYTES,
		maxPassages: MAX_DOCUMENT_PASSAGES,
		maxFiles: MAX_OBSIDIAN_IMPORT_FILES,
		maxArchiveBytes: MAX_OBSIDIAN_ARCHIVE_BYTES,
		limitations: MARKDOWN_ROUND_TRIP_LIMITATIONS.map(localizeImportMessage),
		bibles: await listBibles(getDb())
	};
}

export const actions = {
	/** Parse and sanitise Markdown uploads or one ZIP without writing document state. */
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
		if (candidates.length > MAX_OBSIDIAN_IMPORT_FILES) {
			return fail(400, {
				error: 'too_many_files' as const,
				message: t('documents.import.error.fileCountExceeded', {
					count: candidates.length,
					maximum: MAX_OBSIDIAN_IMPORT_FILES
				})
			});
		}
		if (candidates.length < 1 || candidates.some((candidate) => !(candidate instanceof File))) {
			return fail(400, {
				error: 'fileCount' as const,
				message: t('documents.import.error.fileCount')
			});
		}

		const files = candidates as File[];
		const emptyFile = files.find((file) => file.size === 0);
		if (emptyFile) {
			return fail(400, {
				error: 'emptyFile' as const,
				message: t('documents.import.error.emptyFile'),
				filename: emptyFile.name
			});
		}
		const zipFiles = files.filter((file) => /\.zip$/iu.test(file.name));
		if (zipFiles.length > 0 && (zipFiles.length !== 1 || files.length !== 1)) {
			return fail(400, {
				error: 'mixedArchive' as const,
				message: t('documents.import.error.mixedArchive')
			});
		}
		if (files.reduce((sum, file) => sum + file.size, 0) > MAX_OBSIDIAN_ARCHIVE_BYTES) {
			return fail(413, {
				error: 'file_too_large' as const,
				message: t('documents.import.error.fileTooLarge')
			});
		}

		try {
			let sources: ObsidianMarkdownSource[];
			if (zipFiles[0]) {
				sources = extractObsidianMarkdownArchive(new Uint8Array(await zipFiles[0].arrayBuffer()));
			} else {
				sources = await Promise.all(
					files.map(async (file) => ({
						filename: file.name,
						bytes: new Uint8Array(await file.arrayBuffer())
					}))
				);
			}
			const total = sources.reduce((sum, source) => sum + source.bytes.byteLength, 0);
			if (total > MAX_OBSIDIAN_DECOMPRESSED_BYTES)
				throw new ObsidianArchiveError('archive_too_large');
			const validBibleIds = new Set((await listBibles(getDb())).map((bible) => bible.id));
			const prepared = [];
			const fileErrors: Array<{ filename: string; error: string; message: string }> = [];
			for (const { filename, archivePath, bytes } of sources) {
				try {
					const preview = previewObsidianMarkdown(filename, bytes);
					const inspected = inspectImport(preview, validBibleIds);
					prepared.push({
						preview: { ...preview, warnings: inspected.warnings },
						inspected,
						source: decodedSource(bytes)
					});
				} catch (caught) {
					if (caught instanceof DocumentMarkdownError) {
						fileErrors.push({
							filename: archivePath ?? filename,
							error: caught.code,
							message: localizeImportError(caught.code)
						});
						continue;
					}
					throw caught;
				}
			}
			if (fileErrors.length > 0) {
				return fail(fileErrors.some((issue) => issue.error === 'file_too_large') ? 413 : 400, {
					...fileErrors[0],
					fileErrors
				});
			}
			const packaged = JSON.stringify(
				prepared.map((item) => ({ filename: item.preview.sourceFilename, source: item.source }))
			);
			return {
				preview: prepared[0]!.preview,
				previews: prepared.map((item) => item.preview),
				source: prepared.length === 1 ? prepared[0]!.source : '',
				sourcePackage: packaged,
				canImport: prepared.every((item) => item.inspected.issues.length === 0),
				issues: prepared.flatMap((item) => item.inspected.issues)
			};
		} catch (caught) {
			if (caught instanceof DocumentMarkdownError) return markdownFailure(caught);
			if (caught instanceof ObsidianArchiveError) {
				return archiveFailure(caught, zipFiles[0]?.name ?? files[0]!.name);
			}
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
		let sources = sourcePackage(form.get('sourcePackage'));
		if (!sources) {
			const filenameValue = form.get('filename') ?? form.get('sourceFilename');
			const sourceValue = form.get('source');
			if (typeof filenameValue === 'string' && typeof sourceValue === 'string') {
				sources = [{ filename: filenameValue, source: sourceValue }];
			}
		}
		if (!sources) return fail(400, { error: 'previewRequired' as const });

		const previews: ObsidianDocumentPreview[] = [];
		for (const { filename, source } of sources) {
			try {
				previews.push(previewObsidianMarkdown(filename, source));
			} catch (caught) {
				if (caught instanceof DocumentMarkdownError) return markdownFailure(caught, filename);
				throw caught;
			}
		}

		const db = getDb();
		const validBibleIds = new Set((await listBibles(db)).map((bible) => bible.id));
		const inspected = previews.map((preview) => inspectImport(preview, validBibleIds));
		const issues = inspected.flatMap((item) => item.issues);
		if (issues.length > 0) {
			return fail(400, {
				error: issues[0]!.code,
				filename: previews[inspected.findIndex((item) => item.issues.length > 0)]!.sourceFilename,
				issues,
				preview: { ...previews[0]!, warnings: inspected[0]!.warnings },
				previews: previews.map((preview, index) => ({
					...preview,
					warnings: inspected[index]!.warnings
				})),
				sourcePackage: JSON.stringify(sources)
			});
		}

		const sermonDates: Array<Date | null> = [];
		for (const preview of previews) {
			let sermonDate: Date | null = null;
			if (preview.sermon?.date) {
				const parsedDate = parseCalendarDate(preview.sermon.date);
				if (!parsedDate.ok || !parsedDate.value) {
					return fail(400, {
						error: 'invalidSermonDate' as const,
						filename: preview.sourceFilename
					});
				}
				sermonDate = parsedDate.value;
			}
			sermonDates.push(sermonDate);
		}

		let created: Array<Awaited<ReturnType<typeof createDocument>>>;
		let activeFilename: string | undefined;
		try {
			created = await db.transaction(async (transaction) => {
				// Repository mutations open their own transactions; postgres-js maps these nested calls to
				// savepoints while this outer transaction remains the all-or-nothing import boundary.
				const transactionDb = transaction as unknown as typeof db;
				const imported = [];
				for (const [index, preview] of previews.entries()) {
					activeFilename = preview.sourceFilename;
					const document = await createDocument(transactionDb, user.id, {
						kind: preview.kind,
						title: preview.title,
						visibility: 'private',
						source: 'obsidian',
						sourceFilename: preview.sourceFilename,
						sermonStatus:
							preview.kind === 'sermon'
								? await importSermonColumn(
										transactionDb,
										user.id,
										preview.sermon?.status ?? 'idea',
										preview.sermon?.statusName
									)
								: undefined,
						sermonDate: preview.kind === 'sermon' ? sermonDates[index] : undefined,
						sermonSeries: preview.kind === 'sermon' ? preview.sermon?.series : undefined,
						sermonFormat: preview.kind === 'sermon' ? preview.sermon?.format : undefined,
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
									currentRevision: tags.currentRevision,
									filename: preview.sourceFilename
								});
							}
							throw new ImportPersistenceError(500, {
								error: tags.reason,
								filename: preview.sourceFilename
							});
						}
						currentRevision = tags.revision;
					}

					if (inspected[index]!.passages.length > 0) {
						const passages = await replaceDocumentPassages(
							transactionDb,
							user.id,
							document.id,
							inspected[index]!.passages,
							currentRevision
						);
						if (!passages.ok) {
							if (passages.reason === 'conflict') {
								throw new ImportPersistenceError(409, {
									error: passages.reason,
									currentRevision: passages.currentRevision,
									filename: preview.sourceFilename
								});
							}
							if (passages.reason === 'invalidResource') {
								throw new ImportPersistenceError(400, {
									error: passages.reason,
									resourceId: passages.resourceId,
									filename: preview.sourceFilename
								});
							}
							throw new ImportPersistenceError(500, {
								error: passages.reason,
								filename: preview.sourceFilename
							});
						}
						currentRevision = passages.revision;
					}

					for (const delivery of preview.sermon?.deliveries ?? []) {
						const deliveryDate = parseCalendarDate(delivery.date);
						if (!deliveryDate.ok || !deliveryDate.value) {
							throw new ImportPersistenceError(400, {
								error: 'notFound',
								filename: preview.sourceFilename
							});
						}
						const added = await addSermonDelivery(
							transactionDb,
							user.id,
							document.id,
							currentRevision,
							{ date: deliveryDate.value, location: delivery.location }
						);
						if (!added.ok) {
							if (added.reason === 'conflict') {
								throw new ImportPersistenceError(409, {
									error: added.reason,
									currentRevision: added.currentRevision,
									filename: preview.sourceFilename
								});
							}
							throw new ImportPersistenceError(500, {
								error: added.reason,
								filename: preview.sourceFilename
							});
						}
						currentRevision = added.revision;
					}
					imported.push(document);
				}
				return imported;
			});
		} catch (caught) {
			if (caught instanceof SermonColumnImportError)
				return fail(400, {
					error: 'sermonFields' as const,
					message: caught.message,
					filename: activeFilename
				});
			if (caught instanceof ImportPersistenceError) {
				return fail(caught.status, caught.failure);
			}
			if (caught instanceof InvalidTagPathError) {
				return fail(400, { error: 'invalidTag' as const, filename: activeFilename });
			}
			if (caught instanceof InvalidDocumentInputError) {
				return fail(400, { error: caught.code, filename: activeFilename });
			}
			if (caught instanceof DocumentMarkdownError) return markdownFailure(caught, activeFilename);
			throw caught;
		}

		redirect(303, created.length === 1 ? `/notes/${encodeURIComponent(created[0]!.id)}` : '/notes');
	}
};
