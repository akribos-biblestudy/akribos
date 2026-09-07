import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb, closeDb } from '../db/index.ts';
import { lexiconEntries, resources } from '../db/schema.ts';
import { findLexiconEntry } from '../repositories/strong.ts';
import { parseHebrewLexiconXml } from '../../bible/parse/hebrew-lexicon-xml.ts';
import { ingestLexicon } from './ingest-lexicon.ts';
import { backfillHebrewTranslations } from './backfill-hebrew-translations.ts';

const original = '<lexicon><entry id="H1"><w>אָב</w><meaning>father</meaning></entry></lexicon>';
const bilingual = original.replace(
	'</entry>',
	'<translation xml:lang="de" method="machine"><meaning>Vater</meaning></translation></entry>'
);

describe.sequential('Hebrew dictionary translation persistence', () => {
	const db = getDb();
	const ids: string[] = [];
	async function importEntry(xml: string, sourceFormat = 'hebrew-lexicon-xml') {
		const id = `HEBREW-TRANSLATION-${randomUUID()}`;
		ids.push(id);
		await ingestLexicon(db, parseHebrewLexiconXml(xml), { id, sourceFormat });
		await db.update(resources).set({ isPublic: true }).where(eq(resources.id, id));
		return id;
	}
	afterAll(async () => {
		await db.delete(resources).where(inArray(resources.id, ids));
		await closeDb();
	});

	it('imports both editions and removes an obsolete translation when replacing the source', async () => {
		const id = await importEntry(bilingual);
		expect(await findLexiconEntry(db, id, 'H1')).toMatchObject({
			definitionHtml: 'father',
			germanTranslation: { definitionHtml: 'Vater', machineTranslated: true }
		});
		await ingestLexicon(db, parseHebrewLexiconXml(original), {
			id,
			sourceFormat: 'hebrew-lexicon-xml'
		});
		expect((await findLexiconEntry(db, id, 'H1'))?.germanTranslation).toBeNull();
	});

	it('enriches identical legacy originals idempotently, while preserving other editions and edits', async () => {
		const legacy = await importEntry(original);
		const edited = await importEntry(original.replace('father', 'edited definition'));
		const other = await importEntry(original, 'strongs-xml');
		const translated = await importEntry(bilingual.replace('Vater', 'Eigene Übersetzung'));
		expect(await backfillHebrewTranslations(db, bilingual)).toBeGreaterThan(0);
		expect(await backfillHebrewTranslations(db, bilingual)).toBe(0);
		expect((await findLexiconEntry(db, legacy, 'H1'))?.germanTranslation?.definitionHtml).toBe(
			'Vater'
		);
		expect((await findLexiconEntry(db, edited, 'H1'))?.germanTranslation).toBeNull();
		expect((await findLexiconEntry(db, other, 'H1'))?.germanTranslation).toBeNull();
		expect((await findLexiconEntry(db, translated, 'H1'))?.germanTranslation?.definitionHtml).toBe(
			'Eigene Übersetzung'
		);
	});
});
