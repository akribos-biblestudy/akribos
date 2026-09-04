import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createDocument } from './documents';
import { addSermonDelivery, listSermonDeliveries, removeSermonDelivery } from './sermon-deliveries';
import {
	createSermonTemplate,
	deleteSermonTemplate,
	getSermonTemplate,
	listSermonTemplates,
	updateSermonTemplate
} from './sermon-templates';
import { createUser } from './users';

const db = getDb();
const ownerEmail = `sermon-owner-${randomUUID()}@example.com`;
const strangerEmail = `sermon-stranger-${randomUUID()}@example.com`;
const userIds: string[] = [];

async function account(email: string) {
	const result = await createUser(db, { email, password: 'a-fairly-good-password' });
	if (!result.ok) throw new Error('failed to create sermon workflow test user');
	userIds.push(result.user.id);
	return result.user;
}

afterAll(async () => {
	if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
	await closeDb();
});

describe.sequential('private sermon workflow repositories', () => {
	it('keeps arbitrary templates scoped to their owner', async () => {
		const owner = await account(ownerEmail);
		const stranger = await account(strangerEmail);
		const created = await createSermonTemplate(db, owner.id, {
			name: 'Meine Vorlage',
			bodyMarkdown: '## Einstieg\n'
		});

		expect((await listSermonTemplates(db, owner.id)).map((item) => item.id)).toContain(created.id);
		expect(await getSermonTemplate(db, stranger.id, created.id)).toBeUndefined();
		expect(
			await updateSermonTemplate(db, stranger.id, created.id, {
				name: 'Fremd',
				bodyMarkdown: 'Nicht erlaubt'
			})
		).toBeUndefined();
		expect(await deleteSermonTemplate(db, stranger.id, created.id)).toBe(false);

		const updated = await updateSermonTemplate(db, owner.id, created.id, {
			name: 'Meine neue Vorlage',
			bodyMarkdown: '## Hauptteil\n'
		});
		expect(updated).toMatchObject({ name: 'Meine neue Vorlage', bodyMarkdown: '## Hauptteil\n' });
		expect(await deleteSermonTemplate(db, owner.id, created.id)).toBe(true);
	});

	it('stores multiple delivery entries with optimistic revision and owner checks', async () => {
		const [owner] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
		const [stranger] = await db.select().from(users).where(eq(users.email, strangerEmail)).limit(1);
		const sermon = await createDocument(db, owner!.id, {
			kind: 'sermon',
			title: 'Wiederholt gehalten',
			bodyMarkdown: 'Text\n',
			bodyHtml: '<p>Text</p>',
			plainText: 'Text',
			visibility: 'private',
			sermonStatus: 'ready'
		});

		expect(
			await addSermonDelivery(db, stranger!.id, sermon.id, sermon.revision, {
				date: new Date('2026-09-06T00:00:00.000Z'),
				location: 'Fremde Gemeinde'
			})
		).toEqual({ ok: false, reason: 'notFound' });

		const first = await addSermonDelivery(db, owner!.id, sermon.id, sermon.revision, {
			date: new Date('2026-09-06T00:00:00.000Z'),
			location: 'Gemeinde Nord'
		});
		expect(first).toMatchObject({ ok: true, revision: sermon.revision + 1 });
		if (!first.ok) throw new Error('delivery should have been created');
		expect(
			await addSermonDelivery(db, owner!.id, sermon.id, sermon.revision, {
				date: new Date('2026-09-13T00:00:00.000Z'),
				location: 'Hauskreis Süd'
			})
		).toMatchObject({ ok: false, reason: 'conflict', currentRevision: first.revision });

		const second = await addSermonDelivery(db, owner!.id, sermon.id, first.revision, {
			date: new Date('2026-09-13T00:00:00.000Z'),
			location: 'Hauskreis Süd'
		});
		expect(second).toMatchObject({ ok: true, revision: first.revision + 1 });
		if (!second.ok) throw new Error('second delivery should have been created');
		const deliveries = await listSermonDeliveries(db, owner!.id, sermon.id);
		expect(deliveries.map((item) => item.location)).toEqual(['Hauskreis Süd', 'Gemeinde Nord']);
		expect(await listSermonDeliveries(db, stranger!.id, sermon.id)).toEqual([]);

		expect(
			await removeSermonDelivery(db, owner!.id, sermon.id, first.delivery!.id, second.revision)
		).toMatchObject({ ok: true, revision: second.revision + 1 });
	});
});
