/** Presentation isolation only; document/session authorization remains server-side. */
export function isAppEditorPath(pathname: string): boolean {
	return /^\/app\/editor\/[^/]+(?:\/__data\.json)?\/?$/.test(pathname);
}
