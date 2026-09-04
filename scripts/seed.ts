/**
 * Seeds a small, deterministic fixture: compact Bible resources, two development accounts and enough
 * unified-document data to exercise notes, articles, sermons and the legacy-comment migration.
 *
 * Used by CI and by the end-to-end tests, which need a database with known content but must not spend
 * a minute importing 37 MB of XML. Resource data goes through the real importers, so the fixture
 * exercises the same code path as a production import.
 *
 *   pnpm db:seed
 */

import { and, eq } from 'drizzle-orm';
import { passageToDbEndpoints, type Passage } from '../src/lib/bible/passage.ts';
import { parseVpl } from '../src/lib/bible/parse/vpl.ts';
import { parseZefania } from '../src/lib/bible/parse/zefania.ts';
import { parseStrongsXml } from '../src/lib/bible/parse/strongs-xml.ts';
import { parseCommentaryCsv } from '../src/lib/bible/parse/commentary.ts';
import { documentMarkdownToHtml } from '../src/lib/notes/document-markdown.ts';
import { GERMAN_SERMON_STARTER_TEMPLATE } from '../src/lib/notes/documents.ts';
import { createDb, type Database } from '../src/lib/server/db/client.ts';
import { refreshStrongStatisticsBlocking } from '../src/lib/server/db/statistics.ts';
import { backfillLegacyVerseComments } from '../src/lib/server/documents/legacy-backfill.ts';
import { ingestBible } from '../src/lib/server/import/ingest-bible.ts';
import { ingestLexicon } from '../src/lib/server/import/ingest-lexicon.ts';
import { ingestCommentary } from '../src/lib/server/import/ingest-simple.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import {
	documentPassages,
	documentPublications,
	documentTagLinks,
	documentTags,
	documents,
	resources,
	sermonDeliveries,
	sermonTemplates,
	users,
	verseComments
} from '../src/lib/server/db/schema.ts';
import {
	SEED_ADMIN,
	SEED_DOCUMENT_IDS,
	SEED_LEGACY_VERSE_COMMENT_ID,
	SEED_PASSAGE_IDS,
	SEED_READER,
	SEED_SERMON_DELIVERY_IDS,
	SEED_SERMON_TEMPLATE_ID,
	SEED_TAG_IDS
} from './seed-fixtures.ts';

const SEED_CREATED_AT = new Date('2025-01-15T10:00:00.000Z');
const SEED_PUBLISHED_AT = new Date('2025-02-01T10:00:00.000Z');
const SEED_READER_COLUMNS = ['SEEDDE', 'SEEDCOMMENTARY', 'STRONGS_GREEK'] as const;

/** A German translation with Strong's numbers, in the format of the bundled files. */
const GERMAN = `<?xml version="1.0" encoding="utf-8"?>
<XMLBIBLE biblename="Testübersetzung" type="x-bible">
	<INFORMATION>
		<title>Testübersetzung</title><identifier>SEEDDE</identifier>
		<language>GER</language><rights>Public Domain</rights>
	</INFORMATION>
	<BIBLEBOOK bnumber="1">
		<CHAPTER cnumber="1">
			<VERS vnumber="1">Im <gr str="7225">Anfang </gr><gr str="1254">schuf </gr><gr str="430">Gott </gr> die <gr str="8064">Himmel </gr> und die <gr str="776">Erde </gr>.</VERS>
			<VERS vnumber="2">Und die <gr str="776">Erde </gr> war wüst und leer.</VERS>
			<VERS vnumber="3">Und <gr str="430">Gott </gr> sprach: Es werde Licht!</VERS>
		</CHAPTER>
		<!-- A second chapter, so chapter navigation has somewhere to go. -->
		<CHAPTER cnumber="2">
			<VERS vnumber="1">Und so wurden <gr str="8064">Himmel </gr> und <gr str="776">Erde </gr> vollendet.</VERS>
			<VERS vnumber="2">Und <gr str="430">Gott </gr> ruhte am siebten Tag.</VERS>
		</CHAPTER>
	</BIBLEBOOK>
	<BIBLEBOOK bnumber="40">
		<CHAPTER cnumber="3">
			<VERS vnumber="12">Er hat die Worfschaufel in seiner Hand und wird seine Tenne gründlich reinigen.</VERS>
		</CHAPTER>
	</BIBLEBOOK>
	<BIBLEBOOK bnumber="43">
		<CHAPTER cnumber="3">
			<VERS vnumber="16">Denn also hat <gr str="2316">Gott </gr> die <gr str="2889">Welt </gr><gr str="25">geliebt </gr><note n="*">o. so sehr</note>, daß er seinen <gr str="5207">Sohn </gr> gab.</VERS>
			<VERS vnumber="17">Denn <gr str="2316">Gott </gr> hat seinen <gr str="5207">Sohn </gr> nicht gesandt, um zu richten.</VERS>
		</CHAPTER>
	</BIBLEBOOK>
</XMLBIBLE>`;

/** A second translation without Strong's numbers, so the reader has something to compare. */
const PLAIN = `Gen 1:1	Am Anfang schuf Gott Himmel und Erde.
Gen 1:2	Und die Erde war wüst und leer.
Gen 1:3	Und Gott sprach: Es werde Licht.
Gen 2:1	So wurden Himmel und Erde vollendet.
Gen 2:2	Und Gott ruhte am siebten Tag.
Joh 3:16	Denn so sehr hat Gott die Welt geliebt, dass er seinen Sohn gab.
Joh 3:17	Denn Gott hat seinen Sohn nicht in die Welt gesandt, damit er sie richte.
Joh 3:18	Wer glaubt, wird nicht gerichtet; wer nicht glaubt, ist gerichtet.`;

/** Tiny original-language source used to verify that grammar is merged into every lexicon tab. */
const GREEK = `<?xml version="1.0" encoding="utf-8"?>
<XMLBIBLE biblename="Testgrundtext" type="x-bible">
	<INFORMATION>
		<title>Testgrundtext</title><identifier>SEEDGRC</identifier><language>GRC</language>
	</INFORMATION>
	<BIBLEBOOK bnumber="43">
		<CHAPTER cnumber="3">
			<VERS vnumber="16"><gr str="2316" rmac="N-NSM">θεὸς </gr><gr str="25" rmac="V-AAI-3S">ἠγάπησεν </gr><gr str="2889" rmac="N-ASM">κόσμον</gr>.</VERS>
		</CHAPTER>
	</BIBLEBOOK>
</XMLBIBLE>`;

const LEXICON = `<?xml version="1.0" encoding="utf-8"?>
<strongsdictionary><prologue>Seed</prologue><entries>
	<entry strongs="00025"><strongs>25</strongs>
		<greek BETA="A)GAPA/W" unicode="ἀγαπάω" translit="agapáō"/>
		<pronunciation strongs="ag-ap-ah'-o"/>
		<strongs_def>to love; compare <strongsref language="GREEK" strongs="2316"/> and <verseref href="/Joh3,16" book="43" chapter="3" verse="16">Joh 3:16</verseref></strongs_def><kjv_def>:--(be-)love(-ed).</kjv_def>
	</entry>
	<entry strongs="02316"><strongs>2316</strongs>
		<greek BETA="QEO/S" unicode="θεός" translit="theós"/>
		<pronunciation strongs="theh'-os"/>
		<strongs_def>a deity, the supreme Divinity</strongs_def>
	</entry>
	<entry strongs="02889"><strongs>2889</strongs>
		<greek BETA="KO/SMOS" unicode="κόσμος" translit="kósmos"/>
		<strongs_def>orderly arrangement, the world</strongs_def>
	</entry>
</entries></strongsdictionary>`;

/** A Hebrew dictionary entry used to verify that Strong clicks choose and reuse lexicons by
 * language instead of treating every dictionary in a tab group as interchangeable. */
const HEBREW_LEXICON = `<?xml version="1.0" encoding="utf-8"?>
<strongsdictionary><prologue>Seed</prologue><entries>
	<entry strongs="00430"><strongs>430</strongs>
		<hebrew unicode="אֱלֹהִים" translit="ʼĕlôhîym"/>
		<pronunciation strongs="el-o-heem'"/>
		<strongs_def>God, gods</strongs_def>
	</entry>
</entries></strongsdictionary>`;

/** A commentary entry on the same verse as the fixture translations, so the reader has something to
 *  show alongside them. */
const COMMENTARY = `Joh 3,16\tDer bekannteste Vers der Bibel. **Also** meint hier: auf diese Weise.`;

type SeedAccount = {
	email: string;
	password: string;
};

async function ensureSeedAccount(
	db: Database,
	account: SeedAccount,
	displayName: string,
	role: 'user' | 'admin'
): Promise<string> {
	const passwordHash = await hashPassword(account.password);
	const readerColumns = [...SEED_READER_COLUMNS];
	const readerWorkspace = {
		version: 1 as const,
		layout: 'columns-3' as const,
		tiles: readerColumns.map((resourceId, index) => ({
			id: `tile-${index + 1}`,
			tabs: [
				{
					id: `tab-${index + 1}`,
					resourceId,
					linkSet: 'A' as const,
					reference: { book: 43, chapter: 3, verse: 16 },
					lookup: null,
					studyContext: null
				}
			],
			activeTabId: `tab-${index + 1}`
		})),
		focusedTileId: 'tile-1',
		layoutSizes: {}
	};
	const [user] = await db
		.insert(users)
		.values({
			email: account.email,
			passwordHash,
			displayName,
			role,
			readerColumns,
			readerWorkspace,
			tourCompletedAt: SEED_CREATED_AT,
			emailVerifiedAt: SEED_CREATED_AT
		})
		.onConflictDoUpdate({
			target: users.email,
			// These example.com addresses are reserved fixtures. Refreshing their login and deterministic
			// compact reader workspace keeps the documented walkthrough reliable without touching any other
			// development account or user-created document.
			set: {
				passwordHash,
				displayName,
				role,
				readerColumns,
				readerWorkspace,
				tourCompletedAt: SEED_CREATED_AT,
				emailVerifiedAt: SEED_CREATED_AT,
				disabledAt: null,
				updatedAt: new Date()
			}
		})
		.returning({ id: users.id });
	if (!user) throw new Error(`could not create seed account ${account.email}`);
	return user.id;
}

function seedBody(markdown: string): {
	bodyMarkdown: string;
	bodyHtml: string;
	plainText: string;
} {
	const rendered = documentMarkdownToHtml(markdown);
	return { bodyMarkdown: markdown, bodyHtml: rendered.html, plainText: rendered.plainText };
}

function seedPassage(
	id: string,
	documentId: string,
	passage: Passage,
	resourceId: string | null = null
): typeof documentPassages.$inferInsert {
	const endpoints = passageToDbEndpoints(passage);
	if (!endpoints) throw new Error(`invalid passage in seed document ${documentId}`);
	return {
		id,
		documentId,
		resourceId,
		...endpoints,
		position: 0,
		createdAt: SEED_CREATED_AT
	};
}

async function ensureSeedTag(
	db: Database,
	input: {
		id: string;
		userId: string;
		name: string;
		normalizedName: string;
		path: string;
		normalizedPath: string;
		parentId?: string | null;
	}
): Promise<string> {
	await db
		.insert(documentTags)
		.values({ ...input, parentId: input.parentId ?? null, createdAt: SEED_CREATED_AT })
		.onConflictDoNothing({ target: [documentTags.userId, documentTags.normalizedPath] });
	const [tag] = await db
		.select({ id: documentTags.id })
		.from(documentTags)
		.where(
			and(
				eq(documentTags.userId, input.userId),
				eq(documentTags.normalizedPath, input.normalizedPath)
			)
		)
		.limit(1);
	if (!tag) throw new Error(`could not create seed tag ${input.path}`);
	return tag.id;
}

async function seedUnifiedDocuments(
	db: Database,
	readerUserId: string,
	adminUserId: string
): Promise<void> {
	const privateNoteMarkdown = `Gottes Liebe in Johannes 3 lädt zu einer persönlichen Antwort ein. Das Bild aus Mt 3,12 ruft zu einer entschiedenen Antwort.

## Gebetsimpuls

Wo wird aus dem gelesenen Wort heute eine konkrete Antwort?
`;
	const crossChapterMarkdown = `Der Übergang von der Schöpfung zur Ruhe verbindet **Genesis 1** und **Genesis 2**.

## Beobachtung

Der literarische Zusammenhang endet nicht an der Kapitelgrenze.
`;
	const translationNoteMarkdown = `Diese Beobachtung bezieht sich bewusst auf die Testübersetzung mit Strong-Verknüpfungen.

## Wortwahl

Der übersetzungsspezifische Anker bleibt von kanonischen Verknüpfungen unterscheidbar.
`;
	const sermonMarkdown = `${GERMAN_SERMON_STARTER_TEMPLATE}
## Nächster Schritt

Die Gliederung mit einer konkreten Anwendung ergänzen.
`;
	const publishedArticleMarkdown = `Gottes Liebe geht dem Menschen entgegen. Dieser Absatz ist der veröffentlichte Demo-Stand. Mt 3,12 erinnert zugleich an Gottes gerechtes Handeln.

## Getragen im Alltag

Gnade bleibt nicht abstrakt, sondern prägt Hoffnung, Gebet und gelebte Nächstenliebe.
`;
	const workingArticleMarkdown = `${publishedArticleMarkdown}
## Noch unveröffentlichte Ergänzung

Diese Änderung existiert nur in der Arbeitskopie, bis ein Admin erneut veröffentlicht.
`;

	const documentsToInsert: (typeof documents.$inferInsert)[] = [
		{
			id: SEED_DOCUMENT_IDS.privateNote,
			userId: readerUserId,
			kind: 'note',
			title: 'Gebet und Antwort',
			...seedBody(privateNoteMarkdown),
			visibility: 'private',
			revision: 1,
			source: 'native',
			createdAt: SEED_CREATED_AT,
			updatedAt: SEED_CREATED_AT
		},
		{
			id: SEED_DOCUMENT_IDS.crossChapterNote,
			userId: readerUserId,
			kind: 'note',
			title: 'Schöpfung und Ruhe',
			...seedBody(crossChapterMarkdown),
			visibility: 'private',
			revision: 1,
			source: 'native',
			createdAt: SEED_CREATED_AT,
			updatedAt: SEED_CREATED_AT
		},
		{
			id: SEED_DOCUMENT_IDS.translationNote,
			userId: readerUserId,
			kind: 'note',
			title: 'Wortwahl in der Testübersetzung',
			...seedBody(translationNoteMarkdown),
			visibility: 'private',
			revision: 1,
			source: 'native',
			createdAt: SEED_CREATED_AT,
			updatedAt: SEED_CREATED_AT
		},
		{
			id: SEED_DOCUMENT_IDS.sermon,
			userId: readerUserId,
			kind: 'sermon',
			title: 'Geliebt und gesandt',
			...seedBody(sermonMarkdown),
			visibility: 'private',
			revision: 1,
			source: 'native',
			sermonStatus: 'outline',
			sermonDate: new Date('2025-03-16T00:00:00.000Z'),
			sermonSeries: 'Johannes entdecken',
			createdAt: SEED_CREATED_AT,
			updatedAt: SEED_CREATED_AT
		},
		{
			id: SEED_DOCUMENT_IDS.article,
			userId: adminUserId,
			kind: 'article',
			title: 'Gnade, die trägt',
			...seedBody(workingArticleMarkdown),
			visibility: 'public',
			// Revision 1 is the snapshot below; revision 2 demonstrates unpublished working-copy changes.
			revision: 2,
			source: 'native',
			createdAt: SEED_CREATED_AT,
			updatedAt: new Date('2025-02-15T10:00:00.000Z')
		}
	];

	await db
		.insert(documents)
		.values(documentsToInsert)
		.onConflictDoNothing({ target: documents.id });

	const passages = [
		seedPassage(SEED_PASSAGE_IDS.privateNote, SEED_DOCUMENT_IDS.privateNote, {
			start: { book: 43, chapter: 3, verse: 16 },
			end: { book: 43, chapter: 3, verse: 16 }
		}),
		seedPassage(SEED_PASSAGE_IDS.crossChapterNote, SEED_DOCUMENT_IDS.crossChapterNote, {
			start: { book: 1, chapter: 1, verse: 3 },
			end: { book: 1, chapter: 2, verse: 2 }
		}),
		seedPassage(
			SEED_PASSAGE_IDS.translationNote,
			SEED_DOCUMENT_IDS.translationNote,
			{
				start: { book: 43, chapter: 3, verse: 16 },
				end: { book: 43, chapter: 3, verse: 17 }
			},
			'SEEDDE'
		),
		seedPassage(SEED_PASSAGE_IDS.sermon, SEED_DOCUMENT_IDS.sermon, {
			start: { book: 43, chapter: 3, verse: 16 },
			end: { book: 43, chapter: 3, verse: 17 }
		}),
		seedPassage(SEED_PASSAGE_IDS.article, SEED_DOCUMENT_IDS.article, {
			start: { book: 43, chapter: 3, verse: 16 },
			end: { book: 43, chapter: 3, verse: 17 }
		})
	];
	await db
		.insert(documentPassages)
		.values(passages)
		.onConflictDoNothing({ target: documentPassages.id });

	await db
		.insert(sermonTemplates)
		.values({
			id: SEED_SERMON_TEMPLATE_ID,
			userId: readerUserId,
			name: 'Auslegungspredigt kompakt',
			bodyMarkdown: `## Textbeobachtung

## Eine Hauptaussage

## Gliederung

1. Was steht da?
2. Was bedeutet das?
3. Was folgt daraus?

## Anwendung
`,
			createdAt: SEED_CREATED_AT,
			updatedAt: SEED_CREATED_AT
		})
		.onConflictDoNothing({ target: sermonTemplates.id });

	await db
		.insert(sermonDeliveries)
		.values([
			{
				id: SEED_SERMON_DELIVERY_IDS[0],
				documentId: SEED_DOCUMENT_IDS.sermon,
				userId: readerUserId,
				date: new Date('2025-03-16T00:00:00.000Z'),
				location: 'Evangelische Gemeinde Musterstadt',
				createdAt: SEED_CREATED_AT,
				updatedAt: SEED_CREATED_AT
			},
			{
				id: SEED_SERMON_DELIVERY_IDS[1],
				documentId: SEED_DOCUMENT_IDS.sermon,
				userId: readerUserId,
				date: new Date('2025-04-06T00:00:00.000Z'),
				location: 'Hauskreis Nord',
				createdAt: SEED_CREATED_AT,
				updatedAt: SEED_CREATED_AT
			}
		])
		.onConflictDoNothing({ target: sermonDeliveries.id });

	const rootTagId = await ensureSeedTag(db, {
		id: SEED_TAG_IDS.root,
		userId: readerUserId,
		name: 'Bibelstudium',
		normalizedName: 'bibelstudium',
		path: 'Bibelstudium',
		normalizedPath: 'bibelstudium'
	});
	const childTagId = await ensureSeedTag(db, {
		id: SEED_TAG_IDS.child,
		userId: readerUserId,
		name: 'Johannes',
		normalizedName: 'johannes',
		path: 'Bibelstudium/Johannes',
		normalizedPath: 'bibelstudium/johannes',
		parentId: rootTagId
	});
	await db
		.insert(documentTagLinks)
		.values([
			{ documentId: SEED_DOCUMENT_IDS.privateNote, tagId: childTagId },
			{ documentId: SEED_DOCUMENT_IDS.sermon, tagId: childTagId }
		])
		.onConflictDoNothing();

	const publishedArticleBody = seedBody(publishedArticleMarkdown);
	const articlePassage = passages.find(
		(passage) => passage.documentId === SEED_DOCUMENT_IDS.article
	)!;
	await db
		.insert(documentPublications)
		.values({
			documentId: SEED_DOCUMENT_IDS.article,
			slug: 'demo-gnade-die-traegt',
			title: 'Gnade, die trägt',
			excerpt: 'Ein veröffentlichter Demo-Artikel über Gottes zugewandte Liebe.',
			bodyHtml: publishedArticleBody.bodyHtml,
			bodyMarkdown: publishedArticleBody.bodyMarkdown,
			authorName: 'Akribos Demo-Redaktion',
			visibility: 'public',
			passages: [
				{
					resourceId: articlePassage.resourceId ?? null,
					startBookId: articlePassage.startBookId,
					startChapter: articlePassage.startChapter,
					startVerse: articlePassage.startVerse,
					endBookId: articlePassage.endBookId,
					endChapter: articlePassage.endChapter,
					endVerse: articlePassage.endVerse,
					startKey: articlePassage.startKey,
					endKey: articlePassage.endKey,
					position: articlePassage.position ?? 0
				}
			],
			tags: ['Demo/Artikel'],
			publicationRevision: 1,
			firstPublishedAt: SEED_PUBLISHED_AT,
			publishedAt: SEED_PUBLISHED_AT
		})
		// Never republish on a seed rerun: a developer may deliberately be inspecting another snapshot.
		.onConflictDoNothing();

	await db
		.insert(verseComments)
		.values({
			id: SEED_LEGACY_VERSE_COMMENT_ID,
			userId: readerUserId,
			bookId: 43,
			chapter: 3,
			verse: 17,
			resourceId: 'SEEDDE',
			commentHtml: '<p>Historischer Verskommentar für die Migrationsprüfung.</p>',
			createdAt: SEED_CREATED_AT,
			updatedAt: SEED_CREATED_AT
		})
		.onConflictDoNothing();
}

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const { client, db } = createDb(url, { max: 2 });

try {
	await ingestBible(db, parseZefania(GERMAN), { sourceFormat: 'zefania' });

	await ingestBible(db, parseVpl(PLAIN), {
		sourceFormat: 'vpl',
		overrides: { id: 'SEEDPLAIN', name: 'Testübersetzung schlicht', abbrev: 'Schlicht' }
	});
	await ingestBible(db, parseZefania(GREEK), { sourceFormat: 'zefania' });

	await ingestLexicon(db, parseStrongsXml(LEXICON), { sourceFormat: 'strongs-xml' });
	await ingestLexicon(db, parseStrongsXml(HEBREW_LEXICON), { sourceFormat: 'strongs-xml' });

	await ingestCommentary(db, parseCommentaryCsv(COMMENTARY), {
		sourceFormat: 'commentary-csv',
		overrides: { id: 'SEEDCOMMENTARY', name: 'Testkommentar', abbrev: 'Kommentar' }
	});

	// Deterministic column order, so the end-to-end tests can rely on which column is which.
	await db.update(resources).set({ sortOrder: 10 }).where(eq(resources.id, 'SEEDDE'));
	await db
		.update(resources)
		.set({
			sortOrder: 20,
			tabTitle: 'Schlicht Tab'
		})
		.where(eq(resources.id, 'SEEDPLAIN'));
	await db.update(resources).set({ sortOrder: 30 }).where(eq(resources.id, 'SEEDCOMMENTARY'));
	await db
		.update(resources)
		.set({ sortOrder: 40, kind: 'morphology' })
		.where(eq(resources.id, 'SEEDGRC'));

	await refreshStrongStatisticsBlocking(db);

	const [adminUserId, readerUserId] = await Promise.all([
		ensureSeedAccount(db, SEED_ADMIN, 'Seed-Administrator', 'admin'),
		ensureSeedAccount(db, SEED_READER, 'Demo-Leser', 'user')
	]);

	await seedUnifiedDocuments(db, readerUserId, adminUserId);
	const backfill = await backfillLegacyVerseComments(db);

	console.log(
		'seeded: compact resources, reader/admin accounts, notes, nested tags, sermon template/history and article snapshot'
	);
	console.log(
		`legacy verse-comment documents: ${backfill.created} created, ${backfill.alreadyPresent} already present`
	);
} catch (error) {
	console.error('seeding failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}

export * from './seed-fixtures.ts';
