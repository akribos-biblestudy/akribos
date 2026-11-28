export const PDF_TEMPLATES = ['studienausgabe', 'buchsatz', 'lesemanuskript'] as const;

export type PdfTemplate = (typeof PDF_TEMPLATES)[number];

export const DEFAULT_PDF_TEMPLATE: PdfTemplate = 'studienausgabe';

export function isPdfTemplate(value: unknown): value is PdfTemplate {
	return PDF_TEMPLATES.some((template) => template === value);
}
