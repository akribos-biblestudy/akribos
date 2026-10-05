/** Personal reading text size in percent, shared by the server preference and every size control. */
export const MIN_FONT_SCALE = 70;
export const MAX_FONT_SCALE = 200;
export const FONT_SCALE_STEP = 5;

export function normalizeFontScale(value: number): number {
	if (!Number.isFinite(value)) return 100;
	return Math.min(
		MAX_FONT_SCALE,
		Math.max(MIN_FONT_SCALE, Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP)
	);
}
