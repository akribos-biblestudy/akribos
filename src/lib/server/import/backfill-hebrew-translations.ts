import { createReadStream } from 'node:fs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { parseHebrewLexiconXml } from '../../bible/parse/hebrew-lexicon-xml.ts';
import type { ParsedLexiconEntry, SourceInput } from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import { lexiconEntries, resources } from '../db/schema.ts';

/** Enrich only identical Open Scriptures originals. Never replace an administrator's own edition. */
export async function backfillHebrewTranslations(
	db: Database,
	input?: SourceInput
): Promise<number> {
	const candidates = await db
		.select({ id: resources.id })
		.from(resources)
		.innerJoin(lexiconEntries, eq(lexiconEntries.resourceId, resources.id))
		.where(
			and(
				eq(resources.sourceFormat, 'hebrew-lexicon-xml'),
				eq(resources.status, 'ready'),
				eq(resources.kind, 'lexicon'),
				eq(lexiconEntries.language, 'hbo'),
				isNull(lexiconEntries.germanTranslation)
			)
		)
		.limit(1);
	if (candidates.length === 0) return 0;
	let updated = 0;
	let batch: ParsedLexiconEntry[] = [];
	const flush = async () => {
		if (batch.length === 0) return;
		const rows = await db.execute(sql`
			update lexicon_entries as entry
			set german_translation = translated."germanTranslation"
			from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as translated(
				strong text, lemma text, "definitionHtml" text, "derivationHtml" text,
				"kjvDefinitionHtml" text, "germanTranslation" jsonb
			), resources as resource
			where entry.resource_id = resource.id and resource.source_format = 'hebrew-lexicon-xml'
				and resource.status = 'ready' and resource.kind = 'lexicon' and entry.language = 'hbo'
				and entry.german_translation is null and entry.strong = translated.strong
				and entry.lemma = translated.lemma
				and entry.definition_html is not distinct from translated."definitionHtml"
				and entry.derivation_html is not distinct from translated."derivationHtml"
				and entry.kjv_definition_html is not distinct from translated."kjvDefinitionHtml"
			returning entry.strong
		`);
		updated += rows.length;
		batch = [];
	};
	for await (const event of parseHebrewLexiconXml(
		input ?? createReadStream('data/hebrewstrong.xml', { encoding: 'utf8' })
	)) {
		if (event.type !== 'lexiconEntry' || !event.entry.germanTranslation) continue;
		batch.push(event.entry);
		if (batch.length >= 200) await flush();
	}
	await flush();
	return updated;
}
