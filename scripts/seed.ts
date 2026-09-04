/**
 * Seeds a small, deterministic fixture: one translation, one Greek source, a dictionary entry and an
 * admin account.
 *
 * Used by CI and by the end-to-end tests, which need a database with known content but must not spend
 * a minute importing 37 MB of XML. Everything goes through the real importers, so the fixture exercises
 * the same code path as a production import.
 *
 *   pnpm db:seed
 */

import { eq } from 'drizzle-orm';
import { parseVpl } from '../src/lib/bible/parse/vpl.ts';
import { parseZefania } from '../src/lib/bible/parse/zefania.ts';
import { parseStrongsXml } from '../src/lib/bible/parse/strongs-xml.ts';
import { parseCommentaryCsv } from '../src/lib/bible/parse/commentary.ts';
import { createDb } from '../src/lib/server/db/client.ts';
import { refreshStrongStatisticsBlocking } from '../src/lib/server/db/statistics.ts';
import { ingestBible } from '../src/lib/server/import/ingest-bible.ts';
import { ingestLexicon } from '../src/lib/server/import/ingest-lexicon.ts';
import { ingestCommentary } from '../src/lib/server/import/ingest-simple.ts';
import { hashPassword } from '../src/lib/server/auth/password.ts';
import { resources, users } from '../src/lib/server/db/schema.ts';

const SEED_ADMIN = { email: 'admin@example.com', password: 'seed-admin-password' };

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

	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, SEED_ADMIN.email))
		.limit(1);

	if (!existing) {
		await db.insert(users).values({
			email: SEED_ADMIN.email,
			passwordHash: await hashPassword(SEED_ADMIN.password),
			displayName: 'Seed Admin',
			role: 'admin',
			// Created directly, not through registration, so there is no activation link to click.
			emailVerifiedAt: new Date()
		});
	}

	console.log(
		'seeded: SEEDDE, SEEDPLAIN, SEEDGRC, SEEDCOMMENTARY, STRONGS_GREEK, STRONGS_HEBREW and the admin account'
	);
} catch (error) {
	console.error('seeding failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}

export { SEED_ADMIN };
