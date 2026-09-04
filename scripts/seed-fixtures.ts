/** Stable, development-only fixture identities shared by the seed and review tooling. */

export const SEED_ADMIN = {
	email: 'admin@example.com',
	password: 'seed-admin-password'
} as const;

export const SEED_READER = {
	email: 'reader@example.com',
	password: 'seed-reader-password'
} as const;

export const SEED_DOCUMENT_IDS = {
	privateNote: '5eed0000-0000-4000-8000-000000000001',
	crossChapterNote: '5eed0000-0000-4000-8000-000000000002',
	translationNote: '5eed0000-0000-4000-8000-000000000003',
	sermon: '5eed0000-0000-4000-8000-000000000004',
	publishedNote: '5eed0000-0000-4000-8000-000000000005'
} as const;

export const SEED_PASSAGE_IDS = {
	privateNote: '5eed1000-0000-4000-8000-000000000001',
	crossChapterNote: '5eed1000-0000-4000-8000-000000000002',
	translationNote: '5eed1000-0000-4000-8000-000000000003',
	sermon: '5eed1000-0000-4000-8000-000000000004',
	publishedNote: '5eed1000-0000-4000-8000-000000000005'
} as const;

export const SEED_TAG_IDS = {
	root: '5eed2000-0000-4000-8000-000000000001',
	child: '5eed2000-0000-4000-8000-000000000002'
} as const;

export const SEED_LEGACY_VERSE_COMMENT_ID = '5eed3000-0000-4000-8000-000000000001';

export const SEED_SERMON_TEMPLATE_ID = '5eed4000-0000-4000-8000-000000000001';

export const SEED_SERMON_DELIVERY_IDS = [
	'5eed5000-0000-4000-8000-000000000001',
	'5eed5000-0000-4000-8000-000000000002'
] as const;
