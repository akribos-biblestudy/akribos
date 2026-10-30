import { describe, expect, it } from 'vitest';
import { loginRedirect } from './redirect';

describe('login destination', () => {
	it.each([null, undefined, '', '//evil.example', '/\\evil.example', 'https://evil.example'])(
		'%s falls back to the Bible home page',
		(destination) => {
			expect(loginRedirect(destination)).toBe('/');
		}
	);
	it.each(['/notes?year=2026#results', '/account', '/Joh3,16'])(
		'preserves an explicit local destination: %s',
		(destination) => {
			expect(loginRedirect(destination)).toBe(destination);
		}
	);
});
