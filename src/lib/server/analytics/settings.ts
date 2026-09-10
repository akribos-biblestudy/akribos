import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { getSetting, putSetting } from '../repositories/settings.ts';
import type { AnalyticsConfig } from '../../analytics/privacy.ts';

export const ANALYTICS_SETTINGS_KEY = 'analytics.umami';
const httpsUrl = z
	.string()
	.max(2048)
	.refine((value) => {
		if (!value) return true;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
		} catch {
			return false;
		}
	}, 'Bitte eine HTTPS-Adresse ohne Zugangsdaten oder Fragment eingeben.');

export const analyticsSettingsSchema = z
	.object({
		enabled: z.boolean().default(false),
		scriptUrl: httpsUrl.default(''),
		websiteId: z.union([z.string().uuid(), z.literal('')]).default(''),
		provider: z.string().trim().max(300).default(''),
		privacyUrl: httpsUrl.default(''),
		privacyDetails: z.string().trim().max(4000).default('')
	})
	.superRefine((value, context) => {
		if (!value.enabled) return;
		for (const key of [
			'scriptUrl',
			'websiteId',
			'provider',
			'privacyUrl',
			'privacyDetails'
		] as const) {
			if (!value[key])
				context.addIssue({
					code: 'custom',
					path: [key],
					message: 'Für die Aktivierung erforderlich.'
				});
		}
	});

export async function readAnalyticsSettings(db: Database): Promise<AnalyticsConfig> {
	const stored = await getSetting(db, ANALYTICS_SETTINGS_KEY, analyticsSettingsSchema);
	const settings = stored ?? analyticsSettingsSchema.parse({});
	// Changes to the recipient, configuration or privacy notice require a new visitor decision.
	const revision = createHash('sha256').update(JSON.stringify(settings)).digest('hex').slice(0, 20);
	return { ...settings, revision };
}

export async function saveAnalyticsSettings(db: Database, input: unknown) {
	const parsed = analyticsSettingsSchema.safeParse(input);
	if (!parsed.success) return parsed;
	await putSetting(db, ANALYTICS_SETTINGS_KEY, parsed.data);
	return parsed;
}
