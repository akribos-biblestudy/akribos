/** Embedded raster images share the document's access, snapshot and backup lifetime. */
export const MAX_DOCUMENT_IMAGE_BYTES = 512 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

export type DocumentImage = {
	type: 'png' | 'jpg';
	bytes: Uint8Array;
	width: number;
	height: number;
};

export const documentImageAlignments = ['left', 'center', 'right'] as const;
export const documentImageWidths = [25, 50, 75] as const;

export type DocumentImageLayout = {
	align: (typeof documentImageAlignments)[number] | null;
	width: (typeof documentImageWidths)[number] | null;
};

export function documentImageLayout(align: unknown, width: unknown): DocumentImageLayout {
	return {
		align: documentImageAlignments.find((option) => option === align) ?? null,
		width:
			documentImageWidths.find((option) => option === width || String(option) === width) ?? null
	};
}

/** A standard Markdown image title carries the optional layout for Akribos renderers. */
export function parseDocumentImageLayoutTitle(title?: string | null): DocumentImageLayout {
	const match = /^akribos:image:(left|center|right|auto):(25|50|75|auto)$/.exec(title ?? '');
	return documentImageLayout(match?.[1], match?.[2]);
}

/** Accept bounded PNG/JPEG data only. Remote URLs, SVG and arbitrary data URIs are inert. */
export function parseDocumentImage(source: string): DocumentImage | null {
	if (source.length > Math.ceil(MAX_DOCUMENT_IMAGE_BYTES / 3) * 4 + 32) return null;
	const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
	if (!match || match[2]!.length % 4 !== 0) return null;
	let bytes: Uint8Array;
	try {
		bytes = Uint8Array.from(atob(match[2]!), (character) => character.charCodeAt(0));
	} catch {
		return null;
	}
	if (!bytes.length || bytes.length > MAX_DOCUMENT_IMAGE_BYTES) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width = 0;
	let height = 0;
	if (match[1] === 'png') {
		if (
			bytes.length < 45 ||
			[137, 80, 78, 71, 13, 10, 26, 10].some((value, i) => bytes[i] !== value)
		)
			return null;
		let offset = 8;
		let hasData = false;
		let ended = false;
		while (offset + 12 <= bytes.length) {
			const length = view.getUint32(offset);
			const tag = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
			if (offset + length + 12 > bytes.length) return null;
			if (
				crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
				view.getUint32(offset + 8 + length)
			)
				return null;
			if (offset === 8) {
				if (tag !== 'IHDR' || length !== 13) return null;
				width = view.getUint32(offset + 8);
				height = view.getUint32(offset + 12);
			}
			if (tag === 'IDAT') hasData = true;
			offset += length + 12;
			if (tag === 'IEND') {
				ended = length === 0 && offset === bytes.length;
				break;
			}
		}
		if (!hasData || !ended) return null;
	} else {
		if (
			bytes.length < 12 ||
			bytes[0] !== 255 ||
			bytes[1] !== 216 ||
			bytes.at(-2) !== 255 ||
			bytes.at(-1) !== 217
		)
			return null;
		let offset = 2;
		let hasScan = false;
		while (offset + 4 <= bytes.length) {
			if (bytes[offset] !== 255) return null;
			const marker = bytes[offset + 1]!;
			const length = view.getUint16(offset + 2);
			if (length < 2 || offset + 2 + length > bytes.length) return null;
			if (marker === 218) {
				hasScan = true;
				break;
			}
			if ([192, 193, 194].includes(marker)) {
				if (length < 8) return null;
				height = view.getUint16(offset + 5);
				width = view.getUint16(offset + 7);
			}
			offset += length + 2;
		}
		if (!hasScan) return null;
	}
	if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) return null;
	return { type: match[1] === 'png' ? 'png' : 'jpg', bytes, width, height };
}

/** Downsize a selected image once, before inserting it into the ordinary autosave transaction. */
export async function prepareDocumentImage(file: File): Promise<string> {
	if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024)
		throw new Error('Bitte wähle eine PNG- oder JPEG-Datei mit höchstens 20 MiB.');
	const bitmap = await createImageBitmap(file);
	try {
		if (bitmap.width * bitmap.height > 40_000_000)
			throw new Error('Das Bild hat zu viele Pixel. Bitte verkleinere es zuerst.');
		let scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		for (let attempt = 0; attempt < 8; attempt += 1) {
			canvas.width = Math.max(1, Math.round(bitmap.width * scale));
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Das Bild konnte nicht verarbeitet werden.');
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const source = canvas.toDataURL(file.type, 0.88);
			if (parseDocumentImage(source)) return source;
			scale *= 0.75;
		}
		throw new Error('Das Bild ist zu groß. Bitte verkleinere es zuerst.');
	} finally {
		bitmap.close();
	}
}
