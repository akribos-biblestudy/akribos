import { describe, expect, it } from 'vitest';
import { MARKDOWN_ROUND_TRIP_LIMITATIONS } from '$lib/notes/document-markdown';
import { localizeImportError, localizeImportMessage } from './import-messages.ts';

describe('German Obsidian import diagnostics', () => {
	it('localizes every published round-trip limitation', () => {
		for (const limitation of MARKDOWN_ROUND_TRIP_LIMITATIONS) {
			expect(localizeImportMessage(limitation)).not.toBe(limitation);
		}
		expect(localizeImportMessage(MARKDOWN_ROUND_TRIP_LIMITATIONS[0])).toMatch(/Rohes HTML/u);
	});

	it('localizes static and field-specific parser warnings without exposing English fallbacks', () => {
		expect(localizeImportMessage('An image or attachment was removed from the import.')).toMatch(
			/Bild oder Anhang/u
		);
		expect(
			localizeImportMessage(
				'Frontmatter field "ownerEmail" was ignored; imports cannot set ownership or publication state.'
			)
		).toContain('ownerEmail');
		expect(localizeImportMessage('Unknown frontmatter field "pluginData" was ignored.')).toContain(
			'pluginData'
		);
		expect(localizeImportMessage('Only the first 100 passage references were imported.')).toContain(
			'100'
		);
		expect(localizeImportMessage('A newly added untranslated warning.')).toMatch(/Anpassung/u);
	});

	it('uses German safe summaries for Markdown parser failures', () => {
		expect(localizeImportError('invalid_encoding')).toMatch(/UTF-8/u);
		expect(localizeImportError('file_too_large')).toMatch(/1 MiB/u);
		expect(localizeImportError('invalid_frontmatter')).toMatch(/YAML/u);
	});
});
