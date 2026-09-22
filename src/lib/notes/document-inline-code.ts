/** GFM cannot express an odd literal backslash immediately before a pipe in a backtick cell. */
export function encodeDocumentInlineCode(text: string): string {
	return `<code>${text.replace(/[!-/:-@[-`{-~\r\n]/g, (character) => `&#${character.codePointAt(0)};`)}</code>`;
}

/** Only an attribute-free inline code pair, with literal text or bounded numeric entities. */
export function readDocumentInlineCode(source: string): { raw: string; text: string } | undefined {
	const match = /^<code>((?:[^<&\r\n]|&#(?:\d{1,7}|x[0-9a-fA-F]{1,6});)*)<\/code>/.exec(source);
	if (!match) return;
	const text = match[1]!.replace(/&#(\d{1,7}|x[0-9a-fA-F]{1,6});/g, (_entity, digits: string) => {
		const code = digits.startsWith('x') ? parseInt(digits.slice(1), 16) : Number(digits);
		return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
			? String.fromCodePoint(code)
			: '\uFFFD';
	});
	return { raw: match[0], text };
}
