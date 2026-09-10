import { describe, expect, it } from 'vitest';
import { analyticsSettingsSchema } from './settings.ts';

describe('Umami settings', () => {
	const valid = {
		enabled: true,
		scriptUrl: 'https://stats.example.com/script.js',
		websiteId: 'a0520ae9-6fc7-4bde-9273-066bfba7eddf',
		provider: 'Example',
		privacyUrl: 'https://example.com/privacy',
		privacyDetails: 'Hosting in Deutschland, Löschung nach 30 Tagen.'
	};
	it('defaults to disabled and requires recipient disclosures before activation', () => {
		expect(analyticsSettingsSchema.parse({}).enabled).toBe(false);
		expect(analyticsSettingsSchema.safeParse(valid).success).toBe(true);
		for (const field of ['websiteId', 'scriptUrl', 'provider', 'privacyUrl', 'privacyDetails']) {
			expect(analyticsSettingsSchema.safeParse({ ...valid, [field]: '' }).success).toBe(false);
		}
	});
	it.each([
		'javascript:alert(1)',
		'http://stats.example.com/script.js',
		'https://user:secret@stats.example.com/script.js',
		'//stats.example.com/script.js',
		'https://stats.example.com/script.js#code'
	])('rejects an unsafe script address: %s', (scriptUrl) => {
		expect(analyticsSettingsSchema.safeParse({ ...valid, scriptUrl }).success).toBe(false);
	});
});
