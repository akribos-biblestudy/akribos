/** SWORD distributes TSK using a commentary driver, although its content is a cross-reference work. */
export function isSwordTsk(resource: {
	id: string;
	abbrev: string;
	name: string;
	sourceFormat: string | null;
}): boolean {
	return (
		resource.sourceFormat === 'sword-commentary' &&
		(resource.id.toUpperCase() === 'TSK' ||
			resource.abbrev.toUpperCase() === 'TSK' ||
			resource.name.trim().toLowerCase() === 'treasury of scripture knowledge')
	);
}
