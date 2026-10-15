/** An opt-in persistence mode, never an authentication or resource-access grant. */
export function isLocalReaderRequest(request: Request): boolean {
	return (
		request.headers.get('x-akribos-app') === '1' &&
		request.headers.get('x-akribos-reader-mode') === 'local'
	);
}
