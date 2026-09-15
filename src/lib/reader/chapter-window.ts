/** Keep a small chapter window, expanding it when several short chapters share the viewport. */
export function chapterWindow(
	total: number,
	firstVisible: number,
	lastVisible: number,
	target = 5
) {
	const visibleStart = Math.max(0, Math.min(total - 1, firstVisible));
	const visibleEnd = Math.max(visibleStart, Math.min(total - 1, lastVisible));
	let start = Math.max(0, visibleStart - 1);
	let end = Math.min(total, visibleEnd + 2);
	const spare = Math.max(0, target - (end - start));
	start = Math.max(0, start - Math.floor(spare / 2));
	end = Math.min(total, Math.max(end, start + target));
	start = Math.max(0, Math.min(start, end - target));
	return { start, end };
}
