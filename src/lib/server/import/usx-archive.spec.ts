import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { ParseEvent } from '../../bible/parse/types.ts';
import { detectUsxArchive, parseUsxArchive } from './usx-archive.ts';

const book = (code: string, text = 'Beispieltext') =>
	`<usx version="3.0"><book code="${code}"/><chapter number="1"/><para style="p"><verse number="1"/>${text}<verse eid="${code} 1:1"/></para><chapter eid="${code} 1"/></usx>`;
function archive(files: Record<string, string>) {
	return zipSync(
		Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))
	);
}
async function collect(bytes: Uint8Array, name?: string) {
	const events: ParseEvent[] = [];
	for await (const event of parseUsxArchive(bytes, name)) events.push(event);
	return events;
}

describe('USX ZIP import', () => {
	it('combines nested book files into one resource and uses DBL metadata, never book titles', async () => {
		const bytes = archive({
			'release/JHN.usx': book('JHN'),
			'release/GEN.USX': book('GEN'),
			'styles.xml': '<ignored/>',
			'__MACOSX/._JHN.usx': 'noise',
			'metadata.xml': `<DBLMetadata version="2.2.1" revision="12"><identification><name>Example</name><nameLocal>Beispielbibel</nameLocal><abbreviation>TEST</abbreviation><abbreviationLocal>TÄST</abbreviationLocal><systemId><name>Wrong name</name></systemId></identification><language><iso>deu</iso><ldml>de</ldml><scriptDirection>RTL</scriptDirection></language><copyright><fullStatement><statementContent><p>© Verlag &amp; Partner &lt;script&gt;</p></statementContent></fullStatement></copyright></DBLMetadata>`
		});
		expect(detectUsxArchive(bytes)).toBe('usx-zip');
		const events = await collect(bytes);
		expect(events.filter((e) => e.type === 'metadata')).toEqual([
			{
				type: 'metadata',
				metadata: {
					id: 'TEST',
					name: 'Beispielbibel',
					abbrev: 'TÄST',
					language: 'de',
					direction: 'rtl',
					sourceRevision: '12',
					licenseHtml: '<p>© Verlag &amp; Partner &lt;script&gt;</p>'
				}
			}
		]);
		expect(events.filter((e) => e.type === 'verse').map((e) => e.verse.book)).toEqual([1, 43]);
		expect(events.filter((e) => e.type === 'warning')).toEqual([]);
		expect(events.at(-1)).toEqual({ type: 'progress', done: 2, total: 2 });
	});

	it('uses the original archive name when no metadata is present', async () => {
		const events = await collect(archive({ 'GEN.usx': book('GEN') }), 'Meine Bibel.zip');
		expect(events[0]).toMatchObject({
			type: 'metadata',
			metadata: { id: 'MEINEBIBEL', name: 'Meine Bibel' }
		});
	});

	it.each(['../GEN.usx', '/GEN.usx', 'C:/GEN.usx', 'dir\\GEN.usx'])(
		'rejects unsafe paths: %s',
		(path) => {
			expect(() => detectUsxArchive(archive({ [path]: book('GEN') }))).toThrow('Pfad');
		}
	);

	it('rejects archives without books, competing editions and broken or empty book files', async () => {
		expect(detectUsxArchive(archive({ 'readme.txt': 'hello' }))).toBeNull();
		await expect(collect(archive({ 'readme.txt': 'hello' }))).rejects.toThrow('Keine USX');
		await expect(
			collect(
				archive({
					'GEN.usx': book('GEN'),
					'metadata.xml': '<DBLMetadata/>',
					'other/metadata.xml': '<DBLMetadata/>'
				})
			)
		).rejects.toThrow('Mehrere metadata.xml');
		await expect(collect(archive({ 'GEN.usx': book('GEN'), 'JHN.usx': '<usx>' }))).rejects.toThrow(
			'JHN.usx'
		);
		await expect(collect(archive({ 'GEN.usx': book('GEN', '') }))).rejects.toThrow(
			'kein verwertbarer'
		);
	});

	it.each([
		'oversized',
		'encrypted',
		'symlink',
		'compression',
		'checksum',
		'local-name',
		'forged-size'
	])('rejects %s ZIP entries before accepting their content', async (kind) => {
		const bytes = archive({ 'GEN.usx': book('GEN') });
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const central = bytes.findIndex(
			(_, i) => i + 4 <= bytes.length && view.getUint32(i, true) === 0x02014b50
		);
		if (kind === 'oversized') view.setUint32(central + 24, 300 * 1024 * 1024, true);
		if (kind === 'encrypted') view.setUint16(central + 8, 1, true);
		if (kind === 'symlink') view.setUint32(central + 38, 0xa000 << 16, true);
		if (kind === 'compression') view.setUint16(central + 10, 99, true);
		if (kind === 'checksum') view.setUint32(central + 16, 0, true);
		if (kind === 'local-name') bytes[30] = 88;
		if (kind === 'forged-size') view.setUint32(central + 24, 1, true);
		await expect(collect(bytes)).rejects.toThrow('USX-ZIP');
	});
});
