export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 200 * 1024 * 1024;
export const MAX_DOCUMENT_ATTACHMENTS = 50;

export type DocumentAttachmentMetadata = {
	id: string;
	filename: string;
	mediaType: string;
	sizeBytes: number;
	createdAt: Date | string;
};

export function formatAttachmentSize(bytes: number): string {
	return bytes < 1024 * 1024
		? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(bytes / 1024)} KiB`
		: `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MiB`;
}
