import { t, type MessageKey } from '$lib/i18n';
import type { DocumentMarkdownErrorCode } from '$lib/notes/document-markdown';

const STATIC_MESSAGE_KEYS = new Map<string, MessageKey>([
	['Raw HTML, media, embeds and attributes are removed.', 'documents.import.limitation.rawHtml'],
	[
		'Heading levels deeper than three are folded into level three.',
		'documents.import.limitation.headingDepth'
	],
	[
		'Table layout, ordered-list start numbers and link titles are not retained.',
		'documents.import.limitation.layout'
	],
	['Task checkboxes become ordinary readable text.', 'documents.import.limitation.taskCheckboxes'],
	[
		'Line endings and trailing whitespace are normalised.',
		'documents.import.limitation.whitespace'
	],
	[
		'An attachment link was reduced to its readable label.',
		'documents.import.warning.attachmentLink'
	],
	[
		'An image or attachment was removed from the import.',
		'documents.import.warning.attachmentRemoved'
	],
	['Raw HTML was removed from the import.', 'documents.import.warning.rawHtml'],
	['An Obsidian embed was removed from the import.', 'documents.import.warning.embed'],
	[
		'An unsafe or attachment wikilink was reduced to readable text.',
		'documents.import.warning.unsafeWikilink'
	],
	[
		'Obsidian wikilinks were converted to ordinary internal links.',
		'documents.import.warning.wikilink'
	],
	[
		'Exported timestamps are informational and are not restored during import.',
		'documents.import.warning.timestamps'
	],
	[
		'The frontmatter title was invalid; the filename was used.',
		'documents.import.warning.invalidTitle'
	],
	[
		'Both type and kind were present; type took precedence.',
		'documents.import.warning.kindConflict'
	],
	['The document type was invalid and defaulted to note.', 'documents.import.warning.invalidKind'],
	['Tags must be a string or a list of strings.', 'documents.import.warning.invalidTags'],
	['A non-text tag was ignored.', 'documents.import.warning.nonTextTag'],
	['An invalid tag was ignored.', 'documents.import.warning.invalidTag'],
	[
		'A passage had both resource and resourceId; resource took precedence.',
		'documents.import.warning.passageResourceConflict'
	],
	['An invalid passage entry was ignored.', 'documents.import.warning.invalidPassageEntry'],
	[
		'A passage without a valid reference was ignored.',
		'documents.import.warning.missingPassageReference'
	],
	[
		'An invalid passage resource was ignored; the reference was retained.',
		'documents.import.warning.invalidPassageResource'
	],
	['Sermon metadata must be a mapping.', 'documents.import.warning.invalidSermon'],
	[
		'Sermon metadata was ignored for a non-sermon document.',
		'documents.import.warning.sermonOnOtherKind'
	],
	[
		'The sermon status was invalid and defaulted to idea.',
		'documents.import.warning.invalidSermonStatus'
	],
	['An invalid sermon date was ignored.', 'documents.import.warning.invalidSermonDate'],
	['An invalid sermon series was ignored.', 'documents.import.warning.invalidSermonSeries'],
	[
		'At least one Bible passage could not be parsed and must be corrected.',
		'documents.import.warning.unparsedPassage'
	],
	[
		'At least one passage names an unavailable Bible resource.',
		'documents.import.warning.unavailableBible'
	],
	[
		'At least one tag path is invalid or nested too deeply.',
		'documents.import.warning.invalidTagPath'
	]
]);

const MARKDOWN_ERROR_KEYS: Record<DocumentMarkdownErrorCode, MessageKey> = {
	invalid_filename: 'documents.import.error.invalidFilename',
	invalid_encoding: 'documents.import.error.invalidEncoding',
	binary_file: 'documents.import.error.binaryFile',
	file_too_large: 'documents.import.error.fileTooLarge',
	invalid_frontmatter: 'documents.import.error.invalidFrontmatter',
	invalid_export: 'documents.import.error.invalidFrontmatter'
};

/** Converts the Markdown core's locale-neutral diagnostics before they become visible in the UI. */
export function localizeImportMessage(message: string): string {
	const key = STATIC_MESSAGE_KEYS.get(message);
	if (key) return t(key);

	const unsafeField = /^Frontmatter field "([^"]+)" was ignored;/u.exec(message);
	if (unsafeField) {
		return t('documents.import.warning.unsafeMetadata', { field: unsafeField[1]! });
	}
	const unknownField = /^Unknown frontmatter field "([^"]+)" was ignored\.$/u.exec(message);
	if (unknownField) {
		return t('documents.import.warning.unknownMetadata', { field: unknownField[1]! });
	}
	const importedTagLimit = /^Only the first (\d+) tags were imported\.$/u.exec(message);
	if (importedTagLimit) {
		return t('documents.import.warning.tooManyTags', { maximum: importedTagLimit[1]! });
	}
	const importedPassageLimit = /^Only the first (\d+) passage references were imported\.$/u.exec(
		message
	);
	if (importedPassageLimit) {
		return t('documents.import.warning.tooManyPassages', {
			maximum: importedPassageLimit[1]!
		});
	}
	const documentTagLimit = /^A document may have at most (\d+) tags\.$/u.exec(message);
	if (documentTagLimit) {
		return t('documents.import.warning.documentTagLimit', { maximum: documentTagLimit[1]! });
	}
	const documentPassageLimit = /^A document may have at most (\d+) passage anchors\.$/u.exec(
		message
	);
	if (documentPassageLimit) {
		return t('documents.import.warning.documentPassageLimit', {
			maximum: documentPassageLimit[1]!
		});
	}

	return t('documents.import.warning.unspecified');
}

export function localizeImportError(code: DocumentMarkdownErrorCode): string {
	return t(MARKDOWN_ERROR_KEYS[code]);
}
