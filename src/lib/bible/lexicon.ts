/** The original dictionary fields remain intact; translated prose is a separate edition. */
export type LexiconTranslation = {
	definitionHtml: string | null;
	derivationHtml: string | null;
	kjvDefinitionHtml: string | null;
	machineTranslated: boolean;
};

type LexiconText = {
	definitionHtml: string | null;
	derivationHtml: string | null;
	kjvDefinitionHtml: string | null;
	germanTranslation: LexiconTranslation | null;
};

/** Fall back as a whole, so a translated article never silently mixes English and German fields. */
export function lexiconText(entry: LexiconText, language: 'de' | 'en') {
	return language === 'de' && entry.germanTranslation ? entry.germanTranslation : entry;
}
