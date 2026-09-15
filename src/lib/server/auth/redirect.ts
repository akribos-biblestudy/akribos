/** Only local absolute paths, including when browsers normalize backslashes or whitespace. */
export function loginRedirect(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		/[\\\s]/.test(value) ||
		[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	)
		return '/account';
	try {
		const url = new URL(value, 'https://akribos.invalid');
		return url.origin === 'https://akribos.invalid'
			? `${url.pathname}${url.search}${url.hash}`
			: '/account';
	} catch {
		return '/account';
	}
}
