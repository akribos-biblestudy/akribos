<script lang="ts">
	import {
		ArcElement,
		Chart,
		DoughnutController,
		Tooltip,
		type ChartConfiguration,
		type Plugin
	} from 'chart.js';
	import { formatNumber, t } from '$lib/i18n';

	Chart.register(DoughnutController, ArcElement, Tooltip);

	type Gloss = {
		display: string;
		occurrences: number;
		forms?: { display: string; occurrences: number }[];
	};

	/** Ranked renderings with outside labels, plus the ungrouped accessible table and filters. */
	let {
		glosses,
		groupBelowPercent = 0.5,
		occurrenceTotal,
		centerLabel = true,
		hrefForGloss,
		activeGloss = null
	}: {
		glosses: Gloss[];
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

	const SHADES = ['#ffc400', '#aa9129', '#807443', '#676246', '#56554a', '#494b44'];

	const listedTotal = $derived(glosses.reduce((sum, gloss) => sum + gloss.occurrences, 0));
	const total = $derived(Math.max(listedTotal, occurrenceTotal ?? listedTotal));
	const unlistedOccurrences = $derived(total - listedTotal);
	const hasLemmaForms = $derived(glosses.some(isLemmaGloss));

	function normalizeGloss(value: string): string {
		return value.trim().toLocaleLowerCase('de');
	}

	function isLemmaGloss(gloss: Gloss): boolean {
		return (
			(gloss.forms?.length ?? 0) > 1 ||
			!!gloss.forms?.some((form) => normalizeGloss(form.display) !== normalizeGloss(gloss.display))
		);
	}

	function isActiveGloss(gloss: Gloss): boolean {
		if (!activeGloss) return false;
		const requested = activeGloss.trim();
		if (glosses.some((entry) => entry.display === requested)) return gloss.display === requested;
		const active = normalizeGloss(requested);
		return (
			normalizeGloss(gloss.display) === active ||
			!!gloss.forms?.some((form) => normalizeGloss(form.display) === active)
		);
	}

	function originalForms(gloss: Gloss): string {
		return (gloss.forms?.length ? gloss.forms : [gloss])
			.map((form) => `${form.display} (${formatNumber(form.occurrences)})`)
			.join(', ');
	}

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
		const ranked = [...glosses].sort((a, b) => b.occurrences - a.occurrences);
		const kept = ranked.filter((gloss) => gloss.occurrences >= threshold).slice(0, 8);
		const grouped = ranked.filter((gloss) => !kept.includes(gloss));
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
	let compact = $state(false);
	let chart: Chart | undefined;

	function cssVar(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	function isDark(): boolean {
		return document.documentElement.classList.contains('dark');
	}

	function labelPadding(width: number) {
		if (width <= 360) return { left: 18, right: 18, top: 18, bottom: 18 };
		const ctx = canvas?.getContext('2d');
		ctx?.save();
		if (ctx) ctx.font = '11px system-ui, sans-serif';
		let angle = -Math.PI / 2;
		let left = 24;
		let right = 24;
		for (const [index, gloss] of chartGlosses.entries()) {
			const arc = total ? (gloss.occurrences / total) * Math.PI * 2 : 0;
			const middle = index === 0 && gloss.occurrences > total / 2 ? -Math.PI / 4 : angle + arc / 2;
			const text = `${gloss.display} | ${formatNumber(gloss.occurrences)}x`;
			const needed = Math.min(220, (ctx?.measureText(text).width ?? text.length * 6) + 24);
			if (Math.cos(middle) < 0) left = Math.max(left, needed);
			else right = Math.max(right, needed);
			angle += arc;
		}
		ctx?.restore();
		const scale = Math.min(1, Math.max(0, width - 120) / (left + right));
		return { left: left * scale, right: right * scale, top: 18, bottom: 18 };
	}

	function outsideLabelsPlugin(): Plugin<'doughnut'> {
		return {
			id: 'gloss-outside-labels',
			afterDatasetsDraw(instance) {
				const { ctx, width, height } = instance;
				const labels = instance.getDatasetMeta(0).data.flatMap((element, index) => {
					const gloss = chartGlosses[index];
					if (!(element instanceof ArcElement) || !gloss?.occurrences) return [];
					const angle =
						index === 0 && gloss.occurrences > total / 2
							? -Math.PI / 4
							: (element.startAngle + element.endAngle) / 2;
					const side = Math.cos(angle) >= 0 ? 1 : -1;
					return [
						{
							gloss,
							side,
							x: element.x + Math.cos(angle) * element.outerRadius,
							y: element.y + Math.sin(angle) * element.outerRadius,
							labelY: element.y + Math.sin(angle) * (element.outerRadius + 16),
							edge: element.x + side * (element.outerRadius + 12)
						}
					];
				});
				const firstArc = instance.getDatasetMeta(0).data[0];
				if (firstArc instanceof ArcElement && instance.canvas.parentElement) {
					instance.canvas.parentElement.style.setProperty('--chart-center-x', `${firstArc.x}px`);
					instance.canvas.parentElement.style.setProperty(
						'--chart-hole-width',
						`${firstArc.innerRadius * 1.8}px`
					);
				}
				if (width <= 360) return;
				ctx.save();
				ctx.font = '11px system-ui, sans-serif';
				ctx.textBaseline = 'middle';
				ctx.lineWidth = 1;
				ctx.strokeStyle = cssVar(isDark() ? '--color-stone-500' : '--color-stone-400');
				for (const side of [-1, 1]) {
					const group = labels
						.filter((label) => label.side === side)
						.sort((a, b) => a.labelY - b.labelY);
					// Keep adjacent labels apart, then shift overflow back into the canvas.
					for (let i = 0; i < group.length; i++) {
						group[i]!.labelY = Math.max(group[i]!.labelY, i ? group[i - 1]!.labelY + 17 : 12);
					}
					for (let i = group.length - 1; i >= 0; i--) {
						group[i]!.labelY = Math.min(
							group[i]!.labelY,
							i < group.length - 1 ? group[i + 1]!.labelY - 17 : height - 12
						);
					}
					for (const label of group) {
						ctx.beginPath();
						ctx.moveTo(label.x, label.y);
						ctx.lineTo(label.edge, label.labelY);
						ctx.lineTo(label.edge + side * 5, label.labelY);
						ctx.stroke();
						ctx.textAlign = side === 1 ? 'left' : 'right';
						ctx.fillStyle = cssVar(isDark() ? '--color-stone-200' : '--color-stone-700');
						const textX = label.edge + side * 8;
						const available = Math.max(0, side === 1 ? width - textX - 2 : textX - 2);
						const count = ` | ${formatNumber(label.gloss.occurrences)}x`;
						let name = label.gloss.display;
						if (ctx.measureText(name + count).width > available) {
							while (name.length > 1 && ctx.measureText(name + '…' + count).width > available)
								name = name.slice(0, -1);
							name += '…';
						}
						ctx.fillText(name + count, textX, label.labelY, available);
					}
				}
				ctx.restore();
			}
		};
	}

	function buildConfig(): ChartConfiguration<'doughnut'> {
		const dark = isDark();
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
							gloss.other ? otherColor : SHADES[Math.min(index, SHADES.length - 1)]!
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
				animation: false,
				layout: { padding: labelPadding(canvas?.parentElement?.clientWidth ?? 400) },
				onResize(instance, size) {
					compact = size.width <= 360;
					instance.options.layout = {
						...instance.options.layout,
						padding: labelPadding(size.width)
					};
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: (item) => `${item.label}: ${formatNumber(item.parsed)}`
						}
					}
				}
			},
			plugins: [outsideLabelsPlugin()]
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

<div class="donut-chart" class:compact>
	{#if hasLemmaForms}
		<p class="lemma-hint">{t('strong.glossLemmaHint')}</p>
	{/if}
	<div class="canvas-wrap" style:height={`${Math.max(290, chartGlosses.length * 17 + 24)}px`}>
		<canvas bind:this={canvas} aria-label={t('strong.translations')}></canvas>
		{#if centerLabel}
			<div class="chart-summary">
				<strong>{formatNumber(glosses.length)}{unlistedOccurrences > 0 ? '+' : ''}</strong>
				<span>Übersetzungen in<br />{formatNumber(total)} Vorkommen</span>
			</div>
		{/if}
	</div>
	<ul class="compact-gloss-labels" aria-hidden="true">
		{#each chartGlosses as gloss, index (gloss.display)}
			<li>
				<i
					style:background={gloss.other
						? 'var(--color-stone-400)'
						: SHADES[Math.min(index, SHADES.length - 1)]}
				></i>
				<span>{gloss.display}</span><small>{formatNumber(gloss.occurrences)}x</small>
			</li>
		{/each}
	</ul>

	<!-- Clip a block wrapper: a table keeps its intrinsic minimum width even at width: 1px. -->
	<div class="sr-only">
		<table>
			<caption>{t('strong.translations')}</caption>
			<thead>
				<tr>
					<th>{t('strong.translations')}</th><th>{t('strong.occurrences')}</th>
					{#if hasLemmaForms}<th>{t('strong.glossForms')}</th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each glosses as gloss (gloss.display)}
					<tr>
						<td>{gloss.display}</td>
						<td>{formatNumber(gloss.occurrences)}</td>
						{#if hasLemmaForms}<td>{originalForms(gloss)}</td>{/if}
					</tr>
				{/each}
				{#if unlistedOccurrences > 0}
					<tr>
						<td>{t('strong.glossUnlisted')}</td>
						<td>{formatNumber(unlistedOccurrences)}</td>
						{#if hasLemmaForms}<td></td>{/if}
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	{#if hrefForGloss}
		<ul class="gloss-filters" aria-label={t('strong.filterTranslation')}>
			{#each glosses as gloss (gloss.display)}
				<li>
					<a
						href={hrefForGloss(gloss.display)}
						title={isLemmaGloss(gloss)
							? `${t('strong.glossForms')}: ${originalForms(gloss)}`
							: undefined}
						class:active={isActiveGloss(gloss)}
						aria-current={isActiveGloss(gloss) ? 'true' : undefined}
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
	.lemma-hint {
		margin: 0.25rem 0 0;
		color: var(--color-stone-500);
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.canvas-wrap {
		position: relative;
		height: 290px;
	}

	.chart-summary {
		position: absolute;
		top: 50%;
		left: var(--chart-center-x, 50%);
		transform: translate(-50%, -50%);
		width: var(--chart-hole-width, 34%);
		max-width: 9rem;
		text-align: center;
		pointer-events: none;
		line-height: 1.3;
		font-size: 0.6875rem;
	}

	.chart-summary strong {
		display: block;
		font-size: 2rem;
		font-weight: 500;
		line-height: 1.2;
		margin-bottom: 0.25rem;
	}

	.compact-gloss-labels {
		display: none;
	}
	.donut-chart.compact .compact-gloss-labels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem 0.75rem;
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
		font-size: 0.7rem;
	}
	.donut-chart.compact .compact-gloss-labels li {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		min-width: 0;
	}
	.donut-chart.compact .compact-gloss-labels i {
		flex: 0 0 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
	}
	.donut-chart.compact .compact-gloss-labels span {
		overflow-wrap: anywhere;
	}
	.donut-chart.compact .compact-gloss-labels small {
		flex-shrink: 0;
		color: var(--color-stone-500);
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
