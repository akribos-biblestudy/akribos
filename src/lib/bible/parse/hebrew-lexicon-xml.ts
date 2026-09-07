/**
 * Parser for the Open Scriptures Hebrew Lexicon's Strong dictionary XML (`HebrewStrong.xml`).
 *
 * No project publishes a Hebrew dictionary in the same schema as the Greek one in `strongs-xml.ts`,
 * so this is a different shape, but it produces the same `ParsedLexiconEntry`:
 *
 *   <entry id="H1">
 *     <w pos="n-m" pron="awb" xlit="ʼâb" xml:lang="heb">אָב</w>
 *     <source>a primitive word;</source>
 *     <meaning><def>father</def>, in a literal and immediate, or figurative and remote application</meaning>
 *     <usage>chief, (fore-) father(-less), × patrimony, principal. Compare names in 'Abi-'.</usage>
 *   </entry>
 *
 * `source`/`meaning`/`usage` are mixed content: prose interleaved with `<def>` (the emphasised gloss,
 * rendered bold), `<w src="H24">24</w>` cross-references (rendered as links, the equivalent of
 * `strongs-xml.ts`'s `<strongsref>`) and editorial `<note>`s, which are kept inline where they appear
 * inside a field but dropped where they annotate the entry itself (e.g. a corrected transliteration)
 * rather than its meaning.
 *
 * CC BY 4.0, Open Scriptures Hebrew Bible Project — the dictionary text itself is public domain.
 */

import { makeStrongId } from '../strong.ts';
import { attribute, readXml } from './xml.ts';
import type { ParseStream, SourceInput } from './types.ts';

type Field = 'source' | 'meaning' | 'usage';
type Inline = 'headword' | 'reference' | 'quoted' | 'def' | 'note';

export async function* parseHebrewLexiconXml(input: SourceInput): ParseStream {
	let entry: { lemma?: string; transliteration?: string; pronunciation?: string } = {};
	let strongNumber: number | undefined;
	let field: Field | undefined;
	let inline: Inline | undefined;
	const originalHtml: Record<Field, string> = { source: '', meaning: '', usage: '' };
	const germanHtml: Record<Field, string> = { source: '', meaning: '', usage: '' };
	let html = originalHtml;
	let translated = false;
	let machineTranslated = false;
	let skipDepth = 0;
	let entriesSeen = 0;

	const resetEntry = () => {
		entry = {};
		strongNumber = undefined;
		field = undefined;
		inline = undefined;
		for (const fields of [originalHtml, germanHtml]) {
			fields.source = '';
			fields.meaning = '';
			fields.usage = '';
		}
		html = originalHtml;
		translated = false;
		machineTranslated = false;
		skipDepth = 0;
	};

	for await (const event of readXml(input)) {
		if (skipDepth) {
			if (event.type === 'open') skipDepth += 1;
			else if (event.type === 'close') skipDepth -= 1;
			continue;
		}
		if (event.type === 'open') {
			switch (event.name) {
				case 'translation':
					if (attribute(event.attributes, 'lang') !== 'de' || translated || field) {
						skipDepth = 1;
						break;
					}
					translated = true;
					machineTranslated = attribute(event.attributes, 'method') === 'machine';
					html = germanHtml;
					inline = undefined;
					break;
				case 'entry':
					resetEntry();
					strongNumber = toNumber(attribute(event.attributes, 'id'));
					break;

				case 'source':
				case 'meaning':
				case 'usage':
					field = event.name;
					break;

				case 'w': {
					const reference = toNumber(attribute(event.attributes, 'src'));
					if (!field && html === germanHtml) break;
					if (!field) {
						inline = 'headword';
						entry.transliteration = attribute(event.attributes, 'xlit');
						entry.pronunciation = attribute(event.attributes, 'pron');
					} else if (reference !== undefined) {
						inline = 'reference';
						const id = makeStrongId('hebrew', reference);
						html[field] += `<a class="strong-link" href="/${id}">${id}</a>`;
					} else {
						inline = 'quoted';
						html[field] += '<span class="original">';
					}
					break;
				}

				case 'def':
					if (field) {
						inline = 'def';
						html[field] += '<strong>';
					}
					break;

				case 'note':
					inline = 'note';
					break;

				default:
					break;
			}
			continue;
		}

		if (event.type === 'text') {
			if (inline === 'headword') entry.lemma = (entry.lemma ?? '') + event.text;
			// A reference's own digits (`<w src="H24">24</w>`) are redundant once rendered as a link.
			else if (inline !== 'reference' && field) html[field] += escapeHtml(event.text);
			continue;
		}

		switch (event.name) {
			case 'translation':
				html = originalHtml;
				field = undefined;
				inline = undefined;
				break;

			case 'w':
				if (inline === 'quoted' && field) html[field] += '</span>';
				inline = undefined;
				break;

			case 'def':
				if (inline === 'def' && field) html[field] += '</strong>';
				inline = undefined;
				break;

			case 'note':
				inline = undefined;
				break;

			case 'source':
			case 'meaning':
			case 'usage':
				field = undefined;
				break;

			case 'entry': {
				if (strongNumber === undefined || !entry.lemma) {
					yield {
						type: 'warning',
						message: `skipped a Hebrew dictionary entry without a usable number or headword (${strongNumber ?? '?'})`
					};
					break;
				}

				const completeTranslation =
					translated &&
					(['meaning', 'source', 'usage'] as const).every(
						(key) => !cleanup(originalHtml[key]) || Boolean(cleanup(germanHtml[key]))
					);
				if (translated && !completeTranslation) {
					yield {
						type: 'warning',
						message: `incomplete German translation for H${strongNumber}; kept the original`
					};
				}
				entriesSeen += 1;
				yield {
					type: 'lexiconEntry',
					entry: {
						strong: makeStrongId('hebrew', strongNumber),
						language: 'hbo',
						lemma: entry.lemma,
						...(entry.transliteration ? { transliteration: entry.transliteration } : {}),
						...(entry.pronunciation ? { pronunciation: entry.pronunciation } : {}),
						...(completeTranslation
							? {
									germanTranslation: {
										definitionHtml: cleanup(germanHtml.meaning) || null,
										derivationHtml: cleanup(germanHtml.source) || null,
										kjvDefinitionHtml: cleanup(germanHtml.usage) || null,
										machineTranslated
									}
								}
							: {}),
						...(cleanup(html.meaning) ? { definitionHtml: cleanup(html.meaning) } : {}),
						...(cleanup(html.source) ? { derivationHtml: cleanup(html.source) } : {}),
						...(cleanup(html.usage) ? { kjvDefinitionHtml: cleanup(html.usage) } : {})
					}
				};

				if (entriesSeen % 500 === 0) yield { type: 'progress', done: entriesSeen };
				break;
			}

			default:
				break;
		}
	}

	yield { type: 'progress', done: entriesSeen, total: entriesSeen };
}

/** `id="H1"` or `src="H24"` — both are the same Hebrew-numbered IDREF, just at different positions. */
function toNumber(value: string | undefined): number | undefined {
	const match = value ? /^h?(\d+)$/i.exec(value.trim()) : null;
	if (!match) return undefined;
	const parsed = Number.parseInt(match[1]!, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanup(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
