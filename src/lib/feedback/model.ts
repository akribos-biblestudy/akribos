export const categories = {
	content: 'Fehler im Werk',
	application: 'Anwendungsfehler',
	suggestion: 'Verbesserungsvorschlag',
	missing: 'Fehlender Inhalt',
	other: 'Sonstiges Feedback'
} as const;
export const statuses = {
	new: 'Neu',
	in_progress: 'In Bearbeitung',
	resolved: 'Erledigt',
	closed: 'Geschlossen'
} as const;
export type FeedbackCategory = keyof typeof categories;
export type FeedbackStatus = keyof typeof statuses;
export function isCategory(value: string): value is FeedbackCategory {
	return Object.hasOwn(categories, value);
}
export function isStatus(value: string): value is FeedbackStatus {
	return Object.hasOwn(statuses, value);
}
