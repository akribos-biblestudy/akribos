/** Only these route categories may be counted. No URL, parameter, title or document ID is accepted. */
export function analyticsPage(routeId: string | null): string | null {
	const pages: Record<string, string> = {
		'/[...reference]': '/reader',
		'/[strong=strong]/[[page]]': '/word-study',
		'/search': '/search',
		'/about': '/about',
		'/help': '/help',
		'/impressum': '/impressum',
		'/datenschutz': '/datenschutz'
	};
	return routeId ? (pages[routeId] ?? null) : null;
}

export const ANALYTICS_CONSENT_COOKIE = 'analytics-consent';
export type AnalyticsChoice = 'yes' | 'no' | null;
export function analyticsChoice(value: string | undefined, revision: string): AnalyticsChoice {
	return value === `${revision}.yes` ? 'yes' : value === `${revision}.no` ? 'no' : null;
}

export type AnalyticsConfig = {
	enabled: boolean;
	scriptUrl: string;
	websiteId: string;
	provider: string;
	privacyUrl: string;
	privacyDetails: string;
	revision: string;
};
