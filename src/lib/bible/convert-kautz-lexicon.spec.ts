import { describe, expect, test } from 'vitest';
import { renderBody } from '../../../scripts/convert-kautz-lexicon.ts';

describe('Kautz lexicon sense breaks', () => {
	test.each([
		[
			'I.) versuchen\nEtw. prüfen, indem man auf die Probe stellt.',
			'I.) versuchen<br/>Etw. prüfen'
		],
		['I.) schweigen\nintr.: nicht zu reden beginnen.', 'I.) schweigen<br/>intr.: nicht'],
		['I.) d. Erbarmen\nBezieht sich auf das Elend.', 'I.) d. Erbarmen<br/>Bezieht sich']
	])('preserves a short gloss line before its explanation', (source, expected) => {
		expect(renderBody(source)).toContain(expected);
	});

	test('continues to join a physically wrapped longer sense line', () => {
		expect(
			renderBody('I.) sich in fremde Angelegenheiten einmischen\nohne dazu befugt zu sein.')
		).toBe('I.) sich in fremde Angelegenheiten einmischen ohne dazu befugt zu sein.');
	});
});
