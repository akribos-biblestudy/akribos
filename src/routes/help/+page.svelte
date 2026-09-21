<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import HelpSearch from '$lib/components/help/HelpSearch.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const specialistTopics = $derived(data.topics.filter((topic) => topic.audience !== 'user'));
	const hasAdministration = $derived(specialistTopics.some((topic) => topic.audience === 'admin'));
</script>

<svelte:head>
	<meta
		name="description"
		content="Akribos verstehen: Anleitungen zum Bibellesen, zu Arbeitsbereichen, Wortstudien, Notizen und Ausarbeitungen. Mit durchsuchbarer Hilfe und echten Produktansichten."
	/>
	{#if data.query}<meta name="robots" content="noindex, follow" />{/if}
</svelte:head>

<main class="help-home">
	<header class="help-intro">
		<div class="intro-inner">
			<p class="eyebrow">Akribos Handbuch</p>
			<h1>Raum für deine Fragen.<br />Klarheit für dein Studium.</h1>
			<p class="intro-copy">
				Vom ersten Bibelvers bis zur eigenen Ausarbeitung: Finde die passende Anleitung und arbeite
				in deinem Tempo weiter.
			</p>
			<HelpSearch value={data.query} />
			<p class="search-hint">
				Du suchst einen Bibelvers? Öffne die <a href="/Joh1">Bibel im Reader</a>.
			</p>
		</div>
	</header>
	<div class="help-content">
		{#if data.query}
			<section class="search-results" aria-labelledby="results-title">
				<div class="section-top">
					<div>
						<p class="eyebrow">Suchergebnisse</p>
						<h2 id="results-title">
							{data.results.length}
							{data.results.length === 1 ? 'Anleitung' : 'Anleitungen'} zu „{data.query}“
						</h2>
					</div>
					<a class="text-link" href="/help">Suche zurücksetzen</a>
				</div>
				{#if data.results.length}
					<div class="result-list">
						{#each data.results as result (result.article.id)}
							<a class="search-result" href={result.href}>
								<Icon name={result.article.icon} class="size-5" />
								<div>
									<span class="result-label"
										>{result.article.audience === 'user'
											? 'Nutzerhilfe'
											: result.article.audience === 'api'
												? 'API & Integrationen'
												: 'Administration'}{result.sectionTitle
											? ` · ${result.sectionTitle}`
											: ''}</span
									>
									<h3>{result.article.title}</h3>
									<p>{result.excerpt}</p>
								</div>
								<Icon name="arrow-right" class="size-5" />
							</a>
						{/each}
					</div>
				{:else}
					<div class="empty-results">
						<h3>Für diese Suche gibt es noch keinen Treffer.</h3>
						<p>
							Versuche einen kürzeren Begriff wie „Notiz“, „Suche“ oder „Arbeitsbereich“. Du kannst
							auch direkt ein Thema weiter unten auswählen.
						</p>
					</div>
				{/if}
			</section>
		{:else}
			<section class="featured-guide" aria-labelledby="featured-title">
				<div class="featured-copy">
					<p class="eyebrow">Schritt für Schritt</p>
					<h2 id="featured-title">Dein Arbeitsplatz für das Bibelstudium.</h2>
					<p>
						Stelle Bibel, Kommentar und Lexikon zusammen. Verbinde die Lesestellen und speichere die
						Ansicht als eigenen Arbeitsbereich.
					</p>
					<a class="primary-link" href="/help/reader/arbeitsbereich-einrichten"
						>Arbeitsbereich einrichten <Icon name="arrow-right" class="size-4" /></a
					><span class="guide-note">Mit echten Ansichten aus Akribos · auch für unterwegs</span>
				</div>
				<a
					class="featured-image"
					href="/help/reader/arbeitsbereich-einrichten"
					aria-label="Anleitung: Einen Arbeitsbereich einrichten"
					><img
						src="/help/live/workspace-overview.webp"
						alt="Eine Studienansicht mit Bibel und Begleitwerken bei Johannes 1."
						width="1440"
						height="1000"
						loading="lazy"
					/></a
				>
			</section>
		{/if}

		<section id="themen" class="topic-section" aria-labelledby="topics-title">
			<div class="section-top">
				<div>
					<p class="eyebrow">Nutzerhilfe</p>
					<h2 id="topics-title">Was möchtest du tun?</h2>
				</div>
				<a class="text-link" href="/help/erste-schritte"
					>Mit dem Schnellstart beginnen <Icon name="arrow-right" class="size-4" /></a
				>
			</div>
			<div class="topic-grid">
				{#each data.topics.filter((topic) => topic.audience === 'user') as topic (topic.id)}
					<a id={topic.id} class="topic-card" href={topic.path}
						><span class="topic-icon"><Icon name={topic.icon} class="size-5" /></span>
						<h3>{topic.title}</h3>
						<p>{topic.description}</p>
						<span class="topic-go"
							>{topic.guideCount > 0
								? `${topic.guideCount} ${topic.guideCount === 1 ? 'Anleitung' : 'Anleitungen'}`
								: 'Thema öffnen'}
							<Icon name="arrow-right" class="size-4" /></span
						></a
					>
				{/each}
			</div>
		</section>

		{#if specialistTopics.length}
			<section class="specialist-section" aria-labelledby="specialist-title">
				<div>
					<p class="eyebrow">Weitere Bereiche</p>
					<h2 id="specialist-title">
						{hasAdministration ? 'Für Integration und Verwaltung' : 'Für eigene Integrationen'}
					</h2>
					<p>
						{hasAdministration
							? 'Technische Nutzung und Administration haben ihren eigenen Bereich.'
							: 'Verbinde Akribos über die API mit deiner eigenen Software.'}
					</p>
				</div>
				<div class="specialist-links">
					{#each specialistTopics as topic (topic.id)}<a id={topic.id} href={topic.path}
							><Icon name={topic.icon} class="size-5" /><span
								><strong>{topic.title}</strong><small>{topic.description}</small></span
							><Icon name="arrow-right" class="size-4" /></a
						>{/each}
				</div>
			</section>
		{/if}
	</div>
</main>

<style>
	.help-home {
		color: var(--color-stone-800);
	}
	.help-intro {
		border-bottom: 1px solid var(--line);
		background: color-mix(in oklab, var(--color-accent-500) 4%, var(--surface));
	}
	.intro-inner {
		max-width: 52rem;
		margin: auto;
		padding: 4.5rem 1.5rem 3.5rem;
	}
	.eyebrow {
		margin: 0 0 0.75rem;
		color: var(--color-accent-700);
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4.5vw, 3.25rem);
		font-weight: 650;
		line-height: 1.12;
		letter-spacing: -0.045em;
	}
	.intro-copy {
		max-width: 42rem;
		margin: 1.2rem 0 2rem;
		color: var(--color-stone-600);
		font-size: 1.04rem;
		line-height: 1.7;
	}
	.search-hint {
		margin: 0.75rem 0 0;
		color: var(--color-stone-500);
		font-size: 0.78rem;
	}
	.search-hint a {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.help-content {
		max-width: 75rem;
		margin: auto;
		padding: 3rem 1.5rem 5rem;
	}
	h2 {
		margin: 0;
		font-size: clamp(1.45rem, 2.5vw, 1.9rem);
		font-weight: 650;
		line-height: 1.25;
		letter-spacing: -0.035em;
	}
	.featured-guide {
		display: grid;
		grid-template-columns: 1fr 1.1fr;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: var(--surface-raised);
	}
	.featured-copy {
		padding: 2.5rem;
		align-self: center;
	}
	.featured-copy p:not(.eyebrow) {
		margin: 1rem 0 1.5rem;
		color: var(--color-stone-600);
		font-size: 0.92rem;
		line-height: 1.7;
	}
	.primary-link {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.8rem 1rem;
		border-radius: 0.45rem;
		background: var(--color-accent-700);
		color: white;
		font-size: 0.82rem;
		font-weight: 650;
	}
	.primary-link:hover {
		background: var(--color-accent-800);
	}
	.guide-note {
		display: block;
		margin-top: 0.8rem;
		color: var(--color-stone-500);
		font-size: 0.7rem;
	}
	.featured-image {
		align-self: center;
		margin: 1.5rem 1.5rem 1.5rem 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.06);
	}
	.featured-image img {
		display: block;
		width: 100%;
		height: auto;
	}
	.topic-section {
		margin-top: 4rem;
	}
	.section-top {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.text-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--color-accent-700);
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.topic-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}
	.topic-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		padding: 1.4rem;
		border: 1px solid var(--line);
		border-radius: 0.65rem;
		background: var(--surface-raised);
		scroll-margin-top: 6rem;
		transition: border-color 120ms;
	}
	.topic-card:hover,
	.topic-card:target {
		border-color: var(--color-accent-500);
	}
	.topic-icon {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		margin-bottom: 1rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-accent-500) 9%, transparent);
		color: var(--color-accent-700);
	}
	.topic-card h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 650;
	}
	.topic-card p {
		margin: 0.5rem 0 1.4rem;
		color: var(--color-stone-600);
		font-size: 0.83rem;
		line-height: 1.6;
	}
	.topic-go {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: auto;
		color: var(--color-accent-700);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.specialist-section {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3rem;
		margin-top: 4rem;
		padding-top: 3rem;
		border-top: 1px solid var(--line);
	}
	.specialist-section h2 {
		font-size: 1.45rem;
	}
	.specialist-section p:not(.eyebrow) {
		margin-top: 0.8rem;
		color: var(--color-stone-600);
		font-size: 0.875rem;
	}
	.specialist-links {
		display: grid;
		gap: 0.75rem;
	}
	.specialist-links a {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
	}
	.specialist-links span {
		flex: 1;
	}
	.specialist-links strong {
		display: block;
		font-size: 0.875rem;
		font-weight: 650;
	}
	.specialist-links small {
		display: block;
		margin-top: 0.25rem;
		color: var(--color-stone-500);
		font-size: 0.75rem;
	}
	.search-results h2 {
		overflow-wrap: anywhere;
	}
	.result-list {
		display: grid;
		gap: 0.75rem;
	}
	.search-result {
		display: flex;
		align-items: flex-start;
		gap: 1.2rem;
		padding: 1.3rem;
		border: 1px solid var(--line);
		border-radius: 0.65rem;
		background: var(--surface-raised);
	}
	.search-result:hover {
		border-color: var(--color-accent-500);
	}
	.search-result > div {
		flex: 1;
		min-width: 0;
	}
	.result-label {
		font-size: 0.7rem;
		color: var(--color-stone-500);
	}
	.search-result h3 {
		margin: 0.35rem 0;
		font-size: 1.05rem;
		font-weight: 650;
	}
	.search-result p {
		max-width: 65rem;
		margin: 0;
		color: var(--color-stone-600);
		font-size: 0.875rem;
		line-height: 1.65;
	}
	.empty-results {
		padding: 1.75rem;
		border: 1px dashed var(--line);
		border-radius: 0.65rem;
	}
	.empty-results h3 {
		font-size: 1rem;
		font-weight: 650;
	}
	.empty-results p {
		margin-top: 0.5rem;
		color: var(--color-stone-600);
		line-height: 1.7;
	}
	:global(.dark) .help-home {
		color: var(--color-stone-100);
	}
	:global(.dark) .intro-copy,
	:global(.dark) .featured-copy p:not(.eyebrow),
	:global(.dark) .topic-card p,
	:global(.dark) .specialist-section p:not(.eyebrow),
	:global(.dark) .search-result p,
	:global(.dark) .empty-results p {
		color: var(--color-stone-400);
	}
	:global(.dark) .eyebrow,
	:global(.dark) .text-link,
	:global(.dark) .topic-icon,
	:global(.dark) .topic-go {
		color: var(--color-accent-300);
	}
	@media (max-width: 900px) {
		.topic-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.featured-copy {
			padding: 1.75rem;
		}
	}
	@media (max-width: 640px) {
		.intro-inner {
			padding: 2.75rem 1rem 2.5rem;
		}
		.help-content {
			padding: 1.5rem 1rem 3rem;
		}
		.featured-guide,
		.specialist-section {
			grid-template-columns: 1fr;
		}
		.featured-image {
			margin: 0 1.25rem 1.25rem;
		}
		.featured-copy {
			padding: 1.5rem;
		}
		.topic-section {
			margin-top: 2.75rem;
		}
		.topic-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
		.topic-card {
			padding: 1.25rem;
		}
		.specialist-section {
			gap: 1.5rem;
			margin-top: 2.75rem;
			padding-top: 2rem;
		}
		.search-result {
			gap: 0.7rem;
			padding: 1rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.topic-card {
			transition: none;
		}
	}
</style>
