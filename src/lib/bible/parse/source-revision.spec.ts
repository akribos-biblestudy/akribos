import { describe, expect, it } from 'vitest';
import { parseZefania } from './zefania.ts';

async function revision(attributes: string) {
	for await (const event of parseZefania(
		`<XMLBIBLE ${attributes}><INFORMATION><title>Akribos 1.1</title></INFORMATION></XMLBIBLE>`
	)) {
		if (event.type === 'metadata') return event.metadata.sourceRevision;
	}
}

describe('source edition provenance', () => {
	it('uses only the explicit edition revision and normalizes whitespace', async () => {
		expect(await revision('revision=" 1.2 " version="2.0.1.18"')).toBe('1.2');
		expect(await revision('version="2.0.1.18"')).toBeUndefined();
		expect(await revision('revision=""')).toBeUndefined();
	});

	it('does not treat a nested XMLBIBLE element as edition provenance', async () => {
		const found = [];
		for await (const event of parseZefania(
			'<wrapper><XMLBIBLE revision="1.2"><INFORMATION/></XMLBIBLE></wrapper>'
		)) {
			if (event.type === 'metadata') found.push(event.metadata.sourceRevision);
		}
		expect(found).toEqual([undefined]);
	});

	it('rejects excessive or deceptive revision text without rejecting Bible content', async () => {
		for (const value of ['a'.repeat(81), '&lt;script&gt;', '1.2&#x202e;']) {
			expect(await revision(`revision="${value}"`)).toBeUndefined();
		}
	});
});
