/**
 * Writes a parsed Strong's dictionary into the database.
 *
 * Lexicons are small — under 9,000 entries each — so this is deliberately simpler than the bible
 * ingester: no per-book buffering, just batched upserts.
 */

import { eq, sql } from 'drizzle-orm';
import type { ParsedLexiconEntry, ParseStream } from '../../bible/parse/types.ts';
import type { Database } from '../db/client.ts';
import { lexiconEntries, resources } from '../db/schema.ts';

export type LexiconIngestOptions = {
	/** Resource id, e.g. `STRONGS_GREEK`. Derived from the dictionary language when omitted. */
	id?: string;
	name?: string;
	sourceFormat: string;
	sourceFile?: string;
	onProgress?: (progress: { entries: number }) => void | Promise<void>;
};

export type LexiconIngestResult = {
	resourceId: string;
	entryCount: number;
	warnings: string[];
};

const BATCH_SIZE = 200;

export async function ingestLexicon(
	db: Database,
	stream: ParseStream,
	options: LexiconIngestOptions
): Promise<LexiconIngestResult> {
	const warnings: string[] = [];
	let batch: ParsedLexiconEntry[] = [];
	let entryCount = 0;
	let resourceId: string | undefined;
	let language: 'grc' | 'hbo' | undefined;
	/** Set by a `license` event, which — coming from a `<prologue>` before `<entries>` — always
	 *  arrives before the first `lexiconEntry` and so is ready by the time {@link ensureResource} runs. */
	let licenseHtml: string | undefined;
	/** Set by a `usageNotes` event; same timing guarantee as {@link licenseHtml} above. */
	let usageNotesHtml: string | undefined;

	const ensureResource = async (entry: ParsedLexiconEntry) => {
		if (resourceId) return;

		language = entry.language;
		resourceId = options.id ?? (language === 'grc' ? 'STRONGS_GREEK' : 'STRONGS_HEBREW');
		const name =
			options.name ??
			(language === 'grc' ? "Strong's Greek Dictionary" : "Strong's Hebrew and Aramaic Dictionary");

		await db
			.insert(resources)
			.values({
				id: resourceId,
				kind: 'lexicon',
				name,
				abbrev: language === 'grc' ? 'Strong Griechisch' : 'Strong Hebräisch',
				language,
				canon: language === 'grc' ? 'nt' : 'ot',
				direction: language === 'hbo' ? 'rtl' : 'ltr',
				licenseHtml: licenseHtml ?? null,
				usageNotesHtml: usageNotesHtml ?? null,
				sourceFormat: options.sourceFormat,
				sourceFile: options.sourceFile ?? null,
				status: 'importing'
			})
			.onConflictDoUpdate({
				target: resources.id,
				set: {
					sourceFormat: options.sourceFormat,
					sourceFile: options.sourceFile ?? null,
					status: 'importing',
					updatedAt: new Date()
				}
			});

		// A re-import replaces the whole dictionary rather than merging into it.
		await db.delete(lexiconEntries).where(eq(lexiconEntries.resourceId, resourceId));
	};

	const flush = async () => {
		if (batch.length === 0 || !resourceId) return;
		const rows = batch.map((entry) => ({
			resourceId: resourceId!,
			strong: entry.strong,
			language: entry.language,
			lemma: entry.lemma,
			transliteration: entry.transliteration ?? null,
			pronunciation: entry.pronunciation ?? null,
			definitionHtml: entry.definitionHtml ?? null,
			derivationHtml: entry.derivationHtml ?? null,
			kjvDefinitionHtml: entry.kjvDefinitionHtml ?? null,
			germanTranslation: entry.germanTranslation ?? null,
			seeAlso: entry.seeAlso ?? []
		}));
		batch = [];

		await db
			.insert(lexiconEntries)
			.values(rows)
			.onConflictDoUpdate({
				target: [lexiconEntries.resourceId, lexiconEntries.strong],
				set: {
					lemma: sql`excluded.lemma`,
					transliteration: sql`excluded.transliteration`,
					pronunciation: sql`excluded.pronunciation`,
					definitionHtml: sql`excluded.definition_html`,
					derivationHtml: sql`excluded.derivation_html`,
					kjvDefinitionHtml: sql`excluded.kjv_definition_html`,
					germanTranslation: sql`excluded.german_translation`,
					seeAlso: sql`excluded.see_also`
				}
			});

		await options.onProgress?.({ entries: entryCount });
	};

	for await (const event of stream) {
		switch (event.type) {
			case 'lexiconEntry':
				await ensureResource(event.entry);
				batch.push(event.entry);
				entryCount += 1;
				if (batch.length >= BATCH_SIZE) await flush();
				break;

			case 'warning':
				warnings.push(event.message);
				break;

			case 'license':
				licenseHtml = event.licenseHtml;
				break;

			case 'usageNotes':
				usageNotesHtml = event.usageNotesHtml;
				break;

			default:
				break;
		}
	}

	await flush();

	if (!resourceId) throw new Error('the source contained no dictionary entries');

	await db
		.update(resources)
		.set({ verseCount: 0, wordCount: entryCount, status: 'ready', updatedAt: new Date() })
		.where(eq(resources.id, resourceId));

	return { resourceId, entryCount, warnings };
}
