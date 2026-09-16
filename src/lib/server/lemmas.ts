import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import type { LemmaCandidate, LemmaLookup } from '../bible/glosses.ts';

const decompress = promisify(gunzip);
const EMPTY_LOOKUP: LemmaLookup = () => [];
const dictionaries = new Map<string, Promise<LemmaLookup>>();

/** Immutable UTF-8 data + four bytes per row, rather than hundreds of thousands of JS objects. */
export async function parseLemmaDictionary(data: Buffer): Promise<LemmaLookup> {
	let count = 0;
	for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, end + 1)) {
		count++;
		if (count % 16384 === 0) await setImmediate();
	}
	if (data.length && data.at(-1) !== 10)
		throw new Error('Lemma dictionary must end with a newline');
	const offsets = new Uint32Array(count + 1);
	let row = 1;
	for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, end + 1)) {
		offsets[row++] = end + 1;
		// Loading a language is rare; yield during indexing so its first request does not block others.
		if (row % 16384 === 0) await setImmediate();
	}
	return (form) => {
		const key = Buffer.from(form, 'utf8');
		let low = 0;
		let high = count - 1;
		while (low <= high) {
			const middle = (low + high) >>> 1;
			const start = offsets[middle]!;
			const end = offsets[middle + 1]! - 1;
			const tab = data.indexOf(9, start);
			if (tab < start || tab >= end) throw new Error('Invalid lemma dictionary row');
			const order = data.subarray(start, tab).compare(key);
			if (order < 0) low = middle + 1;
			else if (order > 0) high = middle - 1;
			else return JSON.parse(data.toString('utf8', tab + 1, end)) as LemmaCandidate[];
		}
		return [];
	};
}

export function lemmaLanguage(language: string): string | undefined {
	const base = language.trim().toLowerCase().split(/[-_]/)[0];
	if (base === 'deu' || base === 'ger') return 'de';
	if (base === 'eng') return 'en';
	return base && /^[a-z]{2,3}$/.test(base) ? base : undefined;
}

/** Language files are deployment assets. Only the dictionary is shared, never resource/user data. */
export function loadLemmaLookup(language: string): Promise<LemmaLookup> {
	const code = lemmaLanguage(language);
	if (!code) return Promise.resolve(EMPTY_LOOKUP);
	let promise = dictionaries.get(code);
	if (!promise) {
		promise = readFile(`data/lemmas/${code}.tsv.gz`)
			.then((compressed) => decompress(compressed, { maxOutputLength: 64 * 1024 * 1024 }))
			.then(parseLemmaDictionary)
			.catch((error: NodeJS.ErrnoException) => {
				if (error.code === 'ENOENT') return EMPTY_LOOKUP;
				dictionaries.delete(code);
				throw error;
			});
		dictionaries.set(code, promise);
	}
	return promise;
}
