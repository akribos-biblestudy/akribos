/** A lossy exchange representation. The Akribos JSON snapshot remains the backup format. */
import { strToU8, zipSync } from 'fflate';
import { taggedWordSegments, type VerseSegment } from '../../bible/segments.ts';
import { strongAssignmentNotes } from '../../bible/strong-assignment.ts';
import { fingerprint } from '../strong-review/repository.ts';
import {
	decisionNote,
	usxDecisionSchema,
	usxHash,
	USX_ARCHIVE_MAX_BYTES,
	USX_BOOK_MAX_BYTES,
	USX_REVIEW_MANIFEST_MAX_BYTES,
	USX_REVIEW_MANIFEST_MAX_REVIEWS,
	USX_TOTAL_MAX_BYTES,
	type UsxDecision
} from './usx-reviews.ts';
import type { bibleSnapshot } from './snapshot.ts';

type Snapshot = NonNullable<Awaited<ReturnType<typeof bibleSnapshot>>>;
export class UsxExportLimitError extends Error {}
const limitMessage =
	'Das USX-Archiv wäre für den Akribos-Wiederimport zu groß. Bitte die Akribos-JSON-Sicherung verwenden.';
const compatibilityMessage =
	'Die Strong-Prüfungen können nicht als wiederimportierbares USX-Archiv abgebildet werden. Bitte die Akribos-JSON-Sicherung verwenden.';
const CODES =
	'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(
		' '
	);

function escape(value: string): string {
	// XML 1.0 has no representation for disallowed control characters.
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value))
		throw new Error('Die Bibel enthält Zeichen, die in XML nicht darstellbar sind.');
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function render(segments: readonly VerseSegment[], ref: string, reviews: UsxDecision[]): string {
	let out = '';
	const open: string[] = [];
	const words = taggedWordSegments(segments);
	const byWord = new Map(
		words.map((word, position) => [
			word,
			reviews.filter((review) => review.wordPosition === position)
		])
	);
	const suppress = new Set(
		strongAssignmentNotes(segments)
			.filter(({ word }) => {
				const decisions = byWord.get(word) ?? [];
				return (
					decisions.length > 0 &&
					(word.strongs ?? [word.strong]).every((strong) =>
						decisions.some((decision) => decision.strong === strong)
					)
				);
			})
			.map(({ note }) => note)
	);
	const visit = (items: readonly VerseSegment[]) => {
		for (const item of items) {
			if (typeof item === 'string') out += escape(item);
			else if (item.kind === 'w') {
				const ids = (item.strongs ?? [item.strong])
					.map((id) => `${id[0]}${id.slice(1).padStart(5, '0')}`)
					.join(',');
				out += `<char style="w" strong="${escape(ids)}">${escape(item.text)}</char>`;
				for (const review of byWord.get(item) ?? [])
					out += `<note style="f" caller="+"><char style="ft">${escape(decisionNote(review))}</char></note>`;
			} else if (item.kind === 'em') out += `<char style="em">${escape(item.text)}</char>`;
			else if (item.kind === 'note' && !suppress.has(item))
				out += `<note style="f" caller="${escape(item.marker || '+')}"><char style="ft">${escape(item.text)}</char></note>`;
			else if (item.kind === 'note') continue;
			else if (item.kind === 'br') {
				out +=
					'</char>'.repeat(open.length) +
					`</para><para style="q1" vid="${escape(ref)}">` +
					open.map((style) => `<char style="${style}">`).join('');
			} else {
				open.push(item.kind);
				out += `<char style="${item.kind}">`;
				visit(item.children);
				out += '</char>';
				open.pop();
			}
		}
	};
	visit(segments);
	return out;
}

export function usxArchive(snapshot: Snapshot): Uint8Array {
	if (
		!snapshot.books.length ||
		snapshot.books.length > 66 ||
		!snapshot.resource.id ||
		snapshot.resource.id.length > 200
	)
		throw new UsxExportLimitError(
			'Die Bibel kann nicht als wiederimportierbares USX-Archiv exportiert werden. Bitte die Akribos-JSON-Sicherung verwenden.'
		);
	const files: Record<string, Uint8Array> = {};
	const manifestBooks: { name: string; sha256: string }[] = [];
	const manifestReviews: UsxDecision[] = [];
	const reviewsByVerse = new Map<string, typeof snapshot.reviews>();
	for (const review of snapshot.reviews) {
		if (!review.approvedAt) continue;
		const key = `${review.bookId}:${review.chapter}:${review.verse}`;
		const list = reviewsByVerse.get(key) ?? [];
		list.push(review);
		reviewsByVerse.set(key, list);
	}
	for (const book of snapshot.books) {
		const code = CODES[book.bookId - 1];
		if (!code) throw new Error('Buchkennung nicht unterstützt.');
		const chapters = new Map<number, Snapshot['verses']>();
		for (const verse of snapshot.verses.filter((entry) => entry.book === book.bookId)) {
			const list = chapters.get(verse.chapter) ?? [];
			list.push(verse);
			chapters.set(verse.chapter, list);
		}
		let xml = `<?xml version="1.0" encoding="utf-8"?>\n<usx version="3.0"><book code="${code}" style="id">${escape(snapshot.resource.name)}</book><para style="mt1">${escape(snapshot.resource.name)}</para>`;
		for (const [chapter, verses] of chapters) {
			const chapterId = `${code} ${chapter}`;
			xml += `<chapter number="${chapter}" style="c" sid="${chapterId}"/>`;
			for (const verse of verses) {
				const number = verse.verseEnd ? `${verse.verse}-${verse.verseEnd}` : `${verse.verse}`;
				const verseId = `${chapterId}:${number}`;
				if (verse.heading) xml += `<para style="s1">${escape(verse.heading)}</para>`;
				const words = taggedWordSegments(verse.segments);
				const uncertain = new Set(strongAssignmentNotes(verse.segments).map(({ word }) => word));
				const hash = fingerprint(verse.segments);
				const reviews: UsxDecision[] = (
					reviewsByVerse.get(`${verse.book}:${verse.chapter}:${verse.verse}`) ?? []
				)
					.filter((review) => {
						const word = words[review.wordPosition];
						return (
							review.approvedAt &&
							review.bookId === verse.book &&
							review.chapter === verse.chapter &&
							review.verse === verse.verse &&
							review.verseFingerprint === hash &&
							word &&
							uncertain.has(word) &&
							word.text === review.word &&
							(word.strongs ?? [word.strong]).includes(review.strong)
						);
					})
					.map((review) => {
						const approved = new Date(review.approvedAt!);
						if (Number.isNaN(approved.getTime()))
							throw new UsxExportLimitError(compatibilityMessage);
						const result = usxDecisionSchema.safeParse({
							bookId: review.bookId,
							chapter: review.chapter,
							verse: review.verse,
							wordPosition: review.wordPosition,
							strong: review.strong,
							word: review.word,
							decision: review.decision,
							approvedAt: approved.toISOString()
						});
						if (!result.success) throw new UsxExportLimitError(compatibilityMessage);
						return result.data;
					});
				manifestReviews.push(...reviews);
				if (manifestReviews.length > USX_REVIEW_MANIFEST_MAX_REVIEWS)
					throw new UsxExportLimitError(limitMessage);
				xml += `<para style="p"><verse number="${number}" style="v" sid="${verseId}"/>${render(verse.segments, verseId, reviews)}<verse eid="${verseId}"/></para>`;
			}
			xml += `<chapter eid="${chapterId}"/>`;
		}
		xml += '</usx>\n';
		const name = `${String(book.bookId).padStart(2, '0')}-${code}.usx`;
		const bookBytes = strToU8(xml);
		if (bookBytes.length > USX_BOOK_MAX_BYTES) throw new UsxExportLimitError(limitMessage);
		files[name] = bookBytes;
		manifestBooks.push({ name, sha256: usxHash(xml) });
	}
	files['README.txt'] = strToU8(
		'Akribos USX-Austauschformat\n\nDie USX-Dateien enthalten den gespeicherten Bibeltext, Fußnoten, Überschriften und Strong-Zuordnungen. Freigegebene Prüfentscheidungen sind als Fußnoten je Strong-Nummer und im prüfsummengebundenen Manifest strong-pruefungen.json enthalten. Nicht freigegebene und veraltete Prüfungen werden nicht übertragen. Andere Programme können die Fußnoten anzeigen, werten das Manifest aber möglicherweise nicht aus. Wortindex-Ergänzungen, Morphologie, interne Metadaten und bestimmte Akribos-Formatierungen werden nicht vollständig übertragen. Zur vollständigen Sicherung und Wiederherstellung das Akribos-JSON verwenden. Nicht importierte Teile einer Quelldatei können nicht rekonstruiert werden.\n'
	);
	const manifestBytes = strToU8(
		JSON.stringify({
			format: 'akribos-usx-reviews',
			version: 1,
			resource: snapshot.resource.id,
			books: manifestBooks,
			reviews: manifestReviews
		})
	);
	files['strong-pruefungen.json'] = manifestBytes;
	if (
		manifestBytes.length > USX_REVIEW_MANIFEST_MAX_BYTES ||
		Object.values(files).reduce((sum, file) => sum + file.length, 0) > USX_TOTAL_MAX_BYTES
	)
		throw new UsxExportLimitError(limitMessage);
	const zip = zipSync(files, { level: 6 });
	if (zip.length > USX_ARCHIVE_MAX_BYTES) throw new UsxExportLimitError(limitMessage);
	return zip;
}

export function usxResponse(snapshot: Snapshot): Response {
	const name = snapshot.resource.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'bibel';
	let archive: Uint8Array;
	try {
		archive = usxArchive(snapshot);
	} catch (error) {
		if (error instanceof UsxExportLimitError)
			return new Response(error.message, {
				status: 413,
				headers: {
					'content-type': 'text/plain; charset=utf-8',
					'cache-control': 'private, no-store',
					'x-content-type-options': 'nosniff'
				}
			});
		throw error;
	}
	return new Response(new Uint8Array(archive), {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${name}-usx.zip"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
}
