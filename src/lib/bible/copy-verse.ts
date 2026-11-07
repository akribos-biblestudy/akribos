export type VerseCopyOptions = {
	copyReferencePosition: 'before' | 'after';
	copyIncludeSource: boolean;
};

export type CopiedVerse = { reference: string; text: string; source: string };

/** Format each selected verse independently, so its reference is never ambiguous. */
export function formatCopiedVerses(verses: CopiedVerse[], options: VerseCopyOptions): string {
	return verses
		.map(({ reference, text, source }) => {
			const citation = options.copyIncludeSource && source ? `${reference} (${source})` : reference;
			return options.copyReferencePosition === 'after'
				? `${text}\n– ${citation}`
				: `${citation}\n${text}`;
		})
		.join('\n\n');
}
