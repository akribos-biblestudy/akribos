/** A source's explicit edition revision is plain, bounded display metadata, not a guessed version. */
export function normalizeSourceRevision(value: string | undefined): string | undefined {
	const revision = value?.replace(/\s+/gu, ' ').trim();
	if (!revision || revision.length > 80 || /[\p{Cc}\p{Cf}<>]/u.test(revision)) return undefined;
	return revision;
}
