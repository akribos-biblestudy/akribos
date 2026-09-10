import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { readAnalyticsSettings, saveAnalyticsSettings } from '$lib/server/analytics/settings';

export async function load() {
	return { analytics: await readAnalyticsSettings(getDb()) };
}

export const actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const values = {
			enabled: form.get('enabled') === 'on',
			scriptUrl: String(form.get('scriptUrl') ?? '').trim(),
			websiteId: String(form.get('websiteId') ?? '').trim(),
			provider: String(form.get('provider') ?? '').trim(),
			privacyUrl: String(form.get('privacyUrl') ?? '').trim(),
			privacyDetails: String(form.get('privacyDetails') ?? '').trim()
		};
		const result = await saveAnalyticsSettings(getDb(), values);
		if (!result.success)
			return fail(400, {
				values,
				error: result.error.issues
					.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
					.join(' ')
			});
		return { saved: true };
	}
};
