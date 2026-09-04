import { and, asc, eq } from 'drizzle-orm';
import { isValidDocumentMarkdown, MAX_SERMON_TEMPLATE_NAME_LENGTH } from '$lib/notes/documents';
import type { Database } from '$lib/server/db/client';
import { sermonTemplates, type SermonTemplate } from '$lib/server/db/schema';

export class InvalidSermonTemplateError extends Error {
	readonly code: 'name' | 'body';

	constructor(code: InvalidSermonTemplateError['code']) {
		super(`invalid sermon template ${code}`);
		this.name = 'InvalidSermonTemplateError';
		this.code = code;
	}
}

function cleanName(value: string): string {
	const name = value.replace(/\s+/gu, ' ').trim();
	if (!name || Array.from(name).length > MAX_SERMON_TEMPLATE_NAME_LENGTH) {
		throw new InvalidSermonTemplateError('name');
	}
	return name;
}

function validateBody(markdown: string): void {
	if (!isValidDocumentMarkdown(markdown)) throw new InvalidSermonTemplateError('body');
}

export async function listSermonTemplates(db: Database, userId: string): Promise<SermonTemplate[]> {
	return db
		.select()
		.from(sermonTemplates)
		.where(eq(sermonTemplates.userId, userId))
		.orderBy(asc(sermonTemplates.name), asc(sermonTemplates.id));
}

export async function getSermonTemplate(
	db: Database,
	userId: string,
	id: string
): Promise<SermonTemplate | undefined> {
	const [template] = await db
		.select()
		.from(sermonTemplates)
		.where(and(eq(sermonTemplates.id, id), eq(sermonTemplates.userId, userId)))
		.limit(1);
	return template;
}

export async function createSermonTemplate(
	db: Database,
	userId: string,
	input: { name: string; bodyMarkdown: string }
): Promise<SermonTemplate> {
	const name = cleanName(input.name);
	validateBody(input.bodyMarkdown);
	const [created] = await db
		.insert(sermonTemplates)
		.values({ userId, name, bodyMarkdown: input.bodyMarkdown })
		.returning();
	return created!;
}

export async function updateSermonTemplate(
	db: Database,
	userId: string,
	id: string,
	input: { name: string; bodyMarkdown: string }
): Promise<SermonTemplate | undefined> {
	const name = cleanName(input.name);
	validateBody(input.bodyMarkdown);
	const [updated] = await db
		.update(sermonTemplates)
		.set({ name, bodyMarkdown: input.bodyMarkdown, updatedAt: new Date() })
		.where(and(eq(sermonTemplates.id, id), eq(sermonTemplates.userId, userId)))
		.returning();
	return updated;
}

export async function deleteSermonTemplate(
	db: Database,
	userId: string,
	id: string
): Promise<boolean> {
	const deleted = await db
		.delete(sermonTemplates)
		.where(and(eq(sermonTemplates.id, id), eq(sermonTemplates.userId, userId)))
		.returning({ id: sermonTemplates.id });
	return deleted.length > 0;
}
