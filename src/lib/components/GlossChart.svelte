<script lang="ts">
	import {
		ArcElement,
		Chart,
		DoughnutController,
		Legend,
		Tooltip,
		type ChartConfiguration,
		type Plugin
	} from 'chart.js';
	import { formatNumber, t } from '$lib/i18n';

	Chart.register(DoughnutController, ArcElement, Legend, Tooltip);

	/**
	 * How often a translation renders a word each way, as a donut chart.
	 *
	 * One series, ranked by frequency — a single accent hue, light-to-dark by rank, is what a
	 * sequential (magnitude) encoding calls for. Rendered with Chart.js rather than hand-drawn SVG, so
	 * layout, legend wrapping and hover tooltips stay correct at any width — including narrow reader
	 * tiles, where a hand-rolled leader-line layout has no room to breathe.
	 */
	let {
		glosses,
		groupBelowPercent,
		occurrenceTotal,
		centerLabel = false,
		hrefForGloss,
		activeGloss = null
	}: {
		glosses: { display: string; occurrences: number }[];
		/** Renderings below this share of the total are folded into one "+N andere" slice. */
		groupBelowPercent?: number;
		/** Full Strong count, including renderings beyond the repository's result limit. */
		occurrenceTotal?: number;
		/** Shows the total rendering count and occurrences in the donut's hollow centre. */
		centerLabel?: boolean;
		/** Makes every ungrouped rendering a filter link in full-page statistics views. */
		hrefForGloss?: (gloss: string) => string;
		activeGloss?: string | null;
	} = $props();

	const SHADES = ['700', '600', '500', '400', '300', '200', '100', '50'];

	const listedTotal = $derived(glosses.reduce((sum, gloss) => sum + gloss.occurrences, 0));
	const total = $derived(Math.max(listedTotal, occurrenceTotal ?? listedTotal));
	const unlistedOccurrences = $derived(total - listedTotal);

	/** The chart's own series: the grouped tail (if any) is a distinct, muted "other" entry. */
	const chartGlosses = $derived.by(() => {
		if (!groupBelowPercent || total === 0) {
			const result = glosses.map((gloss) => ({ ...gloss, other: false }));
			if (unlistedOccurrences > 0) {
				result.push({
					display: t('strong.glossUnlisted'),
					occurrences: unlistedOccurrences,
					other: true
				});
			}
			return result;
		}

		const threshold = (groupBelowPercent / 100) * total;
		const kept = glosses.filter((gloss) => gloss.occurrences >= threshold);
		const grouped = glosses.filter((gloss) => gloss.occurrences < threshold);
		const result = kept.map((gloss) => ({ ...gloss, other: false }));
		if (grouped.length > 0) {
			result.push({
				display: t('strong.glossOthers', { count: grouped.length }),
				occurrences: grouped.reduce((sum, gloss) => sum + gloss.occurrences, 0),
				other: true
			});
		}
		if (unlistedOccurrences > 0) {
			result.push({
				display: t('strong.glossUnlisted'),
				occurrences: unlistedOccurrences,
				other: true
			});
		}
		return result;
	});

	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart | undefined;

	function cssVar(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	function isDark(): boolean {
		return document.documentElement.classList.contains('dark');
	}

	function centerLabelPlugin(): Plugin<'doughnut'> {
		return {
			id: 'glossCenterLabel',
			afterDraw(instance) {
				if (!centerLabel) return;
				const { ctx, chartArea } = instance;
				const cx = (chartArea.left + chartArea.right) / 2;
				const cy = (chartArea.top + chartArea.bottom) / 2;
				const dark = isDark();

				ctx.save();
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = dark ? cssVar('--color-stone-100') : cssVar('--color-stone-800');
				ctx.font = '700 26px var(--font-serif), Georgia, serif';
				ctx.fillText(formatNumber(total), cx, cy - 12);

				ctx.fillStyle = dark ? cssVar('--color-stone-400') : cssVar('--color-stone-500');
				ctx.font = '11px system-ui, sans-serif';
				ctx.fillText(t('strong.glossCenterWord'), cx, cy + 8);
				ctx.fillText(
					t('strong.glossCenterHint', { count: formatNumber(glosses.length) }),
					cx,
					cy + 22
				);
				ctx.restore();
			}
		};
	}

	function buildConfig(): ChartConfiguration<'doughnut'> {
		const dark = isDark();
		const textColor = dark ? cssVar('--color-stone-300') : cssVar('--color-stone-600');
		const surface = dark ? cssVar('--color-stone-900') : '#ffffff';
		const otherColor = dark ? cssVar('--color-stone-700') : cssVar('--color-stone-300');

		return {
			type: 'doughnut',
			data: {
				labels: chartGlosses.map((gloss) => gloss.display),
				datasets: [
					{
						data: chartGlosses.map((gloss) => gloss.occurrences),
						backgroundColor: chartGlosses.map((gloss, index) =>
							gloss.other
								? otherColor
								: cssVar(`--color-accent-${SHADES[Math.min(index, SHADES.length - 1)]}`)
						),
						borderColor: surface,
						borderWidth: 2,
						hoverOffset: 6
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: '68%',
				animation: { duration: 200 },
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: textColor,
							font: { size: 11 },
							boxWidth: 10,
							boxHeight: 10,
							padding: 8
						}
					},
					tooltip: {
						callbacks: {
							label: (item) => `${item.label}: ${formatNumber(item.parsed)}`
						}
					}
				}
			},
			plugins: [centerLabelPlugin()]
		};
	}

	function redraw() {
		if (!canvas) return;
		chart?.destroy();
		chart = new Chart(canvas, buildConfig());
	}

	$effect(() => {
		// Re-reads `chartGlosses` and `total`, so this also reruns whenever the data changes.
		redraw();
	});

	// The chart is drawn on a canvas, which does not repaint itself the way the rest of the page's CSS
	// does when the reader flips the colour scheme — this rebuilds it on the same class change
	// `ReaderViewMenu`'s theme toggle makes.
	$effect(() => {
		if (!canvas) return;
		const observer = new MutationObserver(redraw);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	$effect(() => () => chart?.destroy());
</script>

<div class="donut-chart">
	<div class="canvas-wrap">
		<canvas bind:this={canvas} aria-label={t('strong.translations')}></canvas>
	</div>

	<table class="sr-only">
		<caption>{t('strong.translations')}</caption>
		<thead><tr><th>{t('strong.translations')}</th><th>{t('strong.occurrences')}</th></tr></thead>
		<tbody>
			{#each glosses as gloss (gloss.display)}
				<tr>
					<td>{gloss.display}</td>
					<td>{formatNumber(gloss.occurrences)}</td>
				</tr>
			{/each}
			{#if unlistedOccurrences > 0}
				<tr>
					<td>{t('strong.glossUnlisted')}</td>
					<td>{formatNumber(unlistedOccurrences)}</td>
				</tr>
			{/if}
		</tbody>
	</table>

	{#if hrefForGloss}
		<ul class="gloss-filters" aria-label={t('strong.filterTranslation')}>
			{#each glosses as gloss (gloss.display)}
				<li>
					<a
						href={hrefForGloss(gloss.display)}
						class:active={activeGloss?.toLocaleLowerCase('de') ===
							gloss.display.toLocaleLowerCase('de')}
						aria-current={activeGloss?.toLocaleLowerCase('de') ===
						gloss.display.toLocaleLowerCase('de')
							? 'true'
							: undefined}
					>
						<span>{gloss.display}</span>
						<small>{formatNumber(gloss.occurrences)}</small>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.canvas-wrap {
		position: relative;
		height: 290px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.gloss-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.75rem;
	}

	.gloss-filters a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.55rem;
		border: 1px solid var(--color-stone-300);
		border-radius: 999px;
		color: var(--color-stone-700);
		font-size: 0.75rem;
		text-decoration: none;
	}

	.gloss-filters a:hover,
	.gloss-filters a.active {
		border-color: var(--color-accent-600);
		background: var(--color-accent-50);
		color: var(--color-accent-800);
	}

	.gloss-filters small {
		color: var(--color-stone-500);
	}

	:global(.dark) .gloss-filters a {
		border-color: var(--color-stone-700);
		color: var(--color-stone-300);
	}
</style>
