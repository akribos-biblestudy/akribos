<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import HelpSearch from './HelpSearch.svelte';
	import HelpScreenshot from './HelpScreenshot.svelte';
	import type { HelpArticle, HelpAudience } from '$lib/help/types';
	type Topic = { id: string; path: string; title: string; audience: HelpAudience };
	type Guide = Pick<HelpArticle, 'id' | 'path' | 'title' | 'description' | 'icon'>;
	let {
		article,
		headings,
		topics,
		guides
	}: {
		article: HelpArticle;
		headings: { id: string; title: string }[];
		topics: Topic[];
		guides: Guide[];
	} = $props();
	const topic = $derived(topics.find((item) => item.id === article.topic));
	const relatedGuides = $derived(guides.filter((guide) => guide.id !== article.id));
</script>

<svelte:head>
	<meta name="description" content={article.description} />
</svelte:head>

{#snippet topicLink(item: Topic)}
	<div class:current-topic={article.topic === item.id}>
		<a href={item.path} aria-current={article.id === item.id ? 'page' : undefined}>{item.title}</a>
		{#if article.topic === item.id && guides.length}
			<ul class="topic-guide-links">
				{#each guides as guide (guide.id)}
					<li>
						<a href={guide.path} aria-current={article.id === guide.id ? 'page' : undefined}
							>{guide.title}</a
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<main class="help-article-page">
	<div class="help-breadcrumb">
		<nav aria-label="Brotkrumennavigation">
			<a href="/help">Handbuch</a><Icon
				name="chevron-right"
				class="size-3.5"
			/>{#if topic && topic.id !== article.id}<a href={topic.path}>{topic.title}</a><Icon
					name="chevron-right"
					class="size-3.5"
				/>{/if}<span aria-current="page">{article.title}</span>
		</nav>
		<a class="back-reader" href="/">Zur Bibel <Icon name="arrow-right" class="size-4" /></a>
	</div>
	<div class="article-layout">
		<aside class="topic-navigation">
			<div class="sticky-navigation">
				<HelpSearch compact />
				<nav aria-label="Hilfethemen">
					<p class="nav-heading">Nutzerhilfe</p>
					{#each topics.filter((item) => item.audience === 'user') as item (item.id)}{@render topicLink(
							item
						)}{/each}
					<p class="nav-heading specialist-heading">Weitere Bereiche</p>
					{#each topics.filter((item) => item.audience !== 'user') as item (item.id)}{@render topicLink(
							item
						)}{/each}
				</nav>
			</div>
		</aside>
		<article class="article-content">
			<div class="mobile-search"><HelpSearch /></div>
			<header class="article-header">
				<p class="eyebrow">
					{article.audience === 'api'
						? 'API & Integrationen'
						: article.audience === 'admin'
							? 'Administration'
							: 'Nutzerhilfe'} · {article.level === 'guide'
						? 'Schritt-für-Schritt-Anleitung'
						: 'Überblick'}
				</p>
				<h1>{article.title}</h1>
				<p class="article-lead">{article.description}</p>
				{#if article.prerequisite}<p class="prerequisite">
						<Icon name="info" class="size-5" /><span>{article.prerequisite}</span>
					</p>{/if}
			</header>
			{#if article.level === 'overview' && guides.length}
				<section id="anleitungen" class="topic-guides" aria-labelledby="guides-heading">
					<h2 id="guides-heading">Anleitungen zu diesem Thema</h2>
					<nav aria-label="Anleitungen zu diesem Thema" class="guide-cards">
						{#each guides as guide (guide.id)}
							<a class="guide-card" href={guide.path}>
								<Icon name={guide.icon} class="size-5" />
								<span
									><strong>{guide.title}</strong><span class="guide-description"
										>{guide.description}</span
									></span
								>
								<Icon name="arrow-right" class="size-4" />
							</a>
						{/each}
					</nav>
				</section>
			{/if}
			<details class="mobile-contents">
				<summary>In dieser Anleitung</summary>
				<nav aria-label="Abschnitte dieser Anleitung">
					{#each headings as heading (heading.id)}<a href={`#${heading.id}`}>{heading.title}</a
						>{/each}
				</nav>
			</details>
			{#each article.sections as section (section.id)}
				<section
					id={section.id}
					class="article-section"
					aria-labelledby={section.title ? `${section.id}-heading` : undefined}
				>
					{#if section.title}<h2 id={`${section.id}-heading`}>{section.title}</h2>{/if}
					<!-- Editorial HTML is authored only in the repository help catalog; no request or database content. -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="article-prose">{@html section.html}</div>
					{#if section.screenshot}<HelpScreenshot {...section.screenshot} />{/if}
				</section>
			{/each}
			<footer class="article-footer">
				<p>Weiter im Handbuch</p>
				<div>
					<a href="/help"><Icon name="chevron-left" class="size-4" />Alle Themen</a>
					{#if topic && article.level === 'guide'}<a href={topic.path}
							>Zum Thema: {topic.title}<Icon name="arrow-right" class="size-4" /></a
						>{/if}
				</div>
				{#if article.level === 'guide' && relatedGuides.length}
					<nav class="related-guides" aria-label="Weitere Anleitungen zu diesem Thema">
						{#each relatedGuides as guide (guide.id)}<a href={guide.path}
								>{guide.title}<Icon name="arrow-right" class="size-4" /></a
							>{/each}
					</nav>
				{/if}
			</footer>
			<details class="mobile-topics">
				<summary>Weitere Hilfethemen</summary>
				<nav aria-label="Weitere Hilfethemen">
					{#each topics as item (item.id)}<a href={item.path}>{item.title}</a>{/each}
				</nav>
			</details>
		</article>
		<aside class="section-navigation">
			<nav aria-label="Auf dieser Seite">
				<p class="nav-heading">Auf dieser Seite</p>
				{#each headings as heading (heading.id)}<a href={`#${heading.id}`}>{heading.title}</a
					>{/each}
			</nav>
		</aside>
	</div>
</main>

<style>
	.help-article-page {
		width: 100%;
		min-width: 0;
		max-width: 97rem;
		margin: auto;
		padding: 0 2rem 5rem;
		color: var(--color-stone-800);
	}
	.help-breadcrumb {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--line);
		font-size: 0.75rem;
	}
	.help-breadcrumb nav {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
		color: var(--color-stone-500);
	}
	.help-breadcrumb a {
		color: var(--color-accent-700);
	}
	.help-breadcrumb nav span {
		color: var(--color-stone-600);
	}
	.back-reader {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		flex-shrink: 0;
	}
	.article-layout {
		display: grid;
		grid-template-columns: 13rem minmax(0, 1fr) 12rem;
		gap: 3rem;
		padding-top: 2.75rem;
	}
	.sticky-navigation,
	.section-navigation nav {
		position: sticky;
		top: 5.5rem;
		max-height: calc(100dvh - 7rem);
		overflow: auto;
		padding-bottom: 1rem;
	}
	.topic-navigation nav {
		margin-top: 2rem;
	}
	.nav-heading {
		margin: 0 0 0.6rem;
		color: var(--color-stone-500);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.specialist-heading {
		margin-top: 1.6rem;
	}
	.topic-navigation nav a {
		display: block;
		padding: 0.5rem 0.65rem;
		margin-left: -0.65rem;
		color: var(--color-stone-600);
		border-radius: 0.35rem;
		font-size: 0.8rem;
		line-height: 1.4;
	}
	.topic-navigation nav a:hover {
		background: var(--surface-raised);
	}
	.topic-navigation a[aria-current] {
		color: var(--color-accent-700);
		background: color-mix(in oklab, var(--color-accent-500) 9%, transparent);
		font-weight: 650;
	}
	.topic-navigation .current-topic > a {
		font-weight: 650;
	}
	.topic-guide-links {
		margin: 0.25rem 0 0.8rem 0.1rem;
		padding-left: 0.7rem;
		border-left: 1px solid var(--line);
		list-style: none;
	}
	.topic-navigation .topic-guide-links a {
		margin-left: 0;
		padding: 0.45rem 0.55rem;
		font-size: 0.75rem;
	}
	.article-content {
		min-width: 0;
		max-width: 54rem;
		margin-inline: auto;
	}
	.eyebrow {
		margin: 0 0 1rem;
		color: var(--color-accent-700);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		overflow-wrap: anywhere;
		hyphens: auto;
		font-size: clamp(2rem, 3.5vw, 3rem);
		font-weight: 650;
		line-height: 1.15;
		letter-spacing: -0.045em;
	}
	.article-lead {
		margin: 1.4rem 0 0;
		font-size: 1.08rem;
		line-height: 1.75;
		color: var(--color-stone-600);
	}
	.prerequisite {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
		margin-top: 1.5rem;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 0.55rem;
		background: var(--surface-raised);
		font-size: 0.8125rem;
		line-height: 1.65;
	}
	.prerequisite :global(svg) {
		flex-shrink: 0;
		margin-top: 0.1rem;
		color: var(--color-accent-700);
	}
	.article-section {
		margin-top: 2.75rem;
		scroll-margin-top: 6rem;
	}
	.topic-guides {
		margin-top: 2.5rem;
		scroll-margin-top: 6rem;
	}
	.guide-cards {
		display: grid;
		gap: 0.75rem;
	}
	.guide-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 0.85rem;
		padding: 1.15rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: var(--surface-raised);
		color: var(--color-accent-700);
	}
	.guide-card:hover {
		border-color: var(--color-accent-500);
		background: color-mix(in oklab, var(--color-accent-500) 5%, var(--surface));
	}
	.guide-card :global(svg) {
		margin-top: 0.2rem;
	}
	.guide-card strong {
		display: block;
		font-size: 0.95rem;
		font-weight: 650;
		line-height: 1.5;
	}
	.guide-description {
		display: block;
		margin-top: 0.35rem;
		font-size: 0.825rem;
		line-height: 1.7;
		color: var(--color-stone-600);
	}
	.article-section + .article-section {
		border-top: 1px solid var(--line);
		padding-top: 2.5rem;
	}
	h2 {
		margin: 0 0 1.15rem;
		font-size: 1.5rem;
		font-weight: 650;
		line-height: 1.35;
		letter-spacing: -0.025em;
	}
	.article-prose {
		font-size: 0.975rem;
		line-height: 1.85;
	}
	.article-prose :global(p) {
		margin: 0 0 1.15rem;
	}
	.article-prose :global(a) {
		color: var(--color-accent-700);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.article-prose :global(h3) {
		margin: 2rem 0 0.7rem;
		font-size: 1.125rem;
		font-weight: 650;
		line-height: 1.5;
		scroll-margin-top: 6rem;
	}
	.article-prose :global(strong) {
		font-weight: 650;
	}
	.article-prose :global(ul),
	.article-prose :global(ol) {
		margin: 1rem 0 1.5rem;
		padding-left: 1.6rem;
	}
	.article-prose :global(ul) {
		list-style: disc;
	}
	.article-prose :global(ol) {
		list-style: decimal;
	}
	.article-prose :global(li) {
		padding-left: 0.3rem;
		margin: 0.7rem 0;
	}
	.article-prose :global(li::marker) {
		color: var(--color-accent-700);
		font-weight: 650;
	}
	.article-prose :global(code),
	.article-prose :global(kbd) {
		padding: 0.15rem 0.35rem;
		border: 1px solid var(--line);
		border-radius: 0.25rem;
		background: var(--surface-raised);
		font-size: 0.85em;
		overflow-wrap: anywhere;
	}
	.article-prose :global(table) {
		display: block;
		max-width: 100%;
		margin: 1.5rem 0;
		overflow-x: auto;
		border-collapse: collapse;
		font-size: 0.875rem;
		line-height: 1.65;
	}
	.article-prose :global(th),
	.article-prose :global(td) {
		min-width: 7rem;
		padding: 0.75rem 0.8rem;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
	}
	.article-prose :global(th) {
		font-weight: 650;
		background: var(--surface-raised);
	}
	.article-prose :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		margin: 1.5rem 0;
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 0.45rem;
		background: var(--surface-raised);
		font-size: 0.8rem;
		line-height: 1.7;
	}
	.article-prose :global(pre code) {
		padding: 0;
		border: 0;
		background: none;
		font-size: inherit;
	}
	.article-prose :global(.callout),
	.article-prose :global(.privacy-note) {
		margin: 1.5rem 0;
		padding: 1rem 1.2rem;
		border-left: 3px solid var(--color-accent-500);
		border-radius: 0 0.45rem 0.45rem 0;
		background: color-mix(in oklab, var(--color-accent-500) 5%, var(--surface));
		font-size: 0.9rem;
	}
	.article-prose :global(.callout p) {
		margin: 0.5rem 0 0;
	}
	.article-prose :global(.definition-list) {
		margin: 1.2rem 0 1.5rem;
		border-block: 1px solid var(--line);
	}
	.article-prose :global(.definition-list > div) {
		display: grid;
		grid-template-columns: minmax(8rem, 1fr) 2fr;
		gap: 1rem;
		padding: 1rem 0;
	}
	.article-prose :global(.definition-list > div + div) {
		border-top: 1px solid var(--line);
	}
	.article-prose :global(dt) {
		font-weight: 650;
		font-size: 0.875rem;
	}
	.article-prose :global(dd) {
		margin: 0;
		font-size: 0.9rem;
	}
	.article-prose :global(details) {
		border-top: 1px solid var(--line);
	}
	.article-prose :global(details:last-child) {
		border-bottom: 1px solid var(--line);
	}
	.article-prose :global(summary) {
		cursor: pointer;
		padding: 1rem 0;
		font-size: 0.925rem;
		font-weight: 650;
	}
	.article-prose :global(details p) {
		margin: 0 0 1.25rem;
		font-size: 0.9rem;
	}
	.article-prose :global(.instruction-grid),
	.article-prose :global(.account-grid),
	.article-prose :global(.example-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin: 1.5rem 0;
	}
	.article-prose :global(.instruction-grid article),
	.article-prose :global(.account-grid article),
	.article-prose :global(.example) {
		padding: 1rem;
		border: 1px solid var(--line);
		border-radius: 0.5rem;
	}
	.article-prose :global(.instruction-grid article > span) {
		font-weight: 650;
	}
	.article-prose :global(.instruction-grid p),
	.article-prose :global(.account-grid p) {
		margin: 0.45rem 0 0;
		font-size: 0.875rem;
	}
	.article-prose :global(.account-grid h3) {
		margin: 0 0 0.5rem;
	}
	.article-prose :global(.example span) {
		display: block;
		margin-top: 0.45rem;
		font-size: 0.85rem;
	}
	.article-prose :global(.steps) {
		list-style: none;
		padding-left: 0;
	}
	.article-prose :global(.steps li) {
		display: flex;
		gap: 1rem;
		margin: 1.5rem 0;
		padding-left: 0;
	}
	.article-prose :global(.step-number) {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		border-radius: 50%;
		color: var(--color-accent-700);
		background: color-mix(in oklab, var(--color-accent-500) 12%, transparent);
		font-weight: 700;
	}
	.article-prose :global(.search-syntax > div) {
		margin: 1rem 0;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--line);
	}
	.article-prose :global(.search-syntax p) {
		margin-top: 0.5rem;
	}
	.section-navigation {
		padding-top: 0.25rem;
	}
	.section-navigation a {
		display: block;
		padding: 0.45rem 0 0.45rem 0.8rem;
		border-left: 1px solid var(--line);
		color: var(--color-stone-600);
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.section-navigation a:hover {
		color: var(--color-accent-700);
		border-left-color: var(--color-accent-500);
	}
	.article-footer {
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
	}
	.article-footer p {
		margin-bottom: 0.8rem;
		font-size: 0.75rem;
		color: var(--color-stone-500);
	}
	.article-footer > div {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.article-footer a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--color-accent-700);
	}
	.related-guides {
		display: grid;
		gap: 0.8rem;
		margin-top: 1.3rem;
		padding-top: 1.3rem;
		border-top: 1px solid var(--line);
	}
	.related-guides a {
		justify-content: space-between;
		line-height: 1.6;
	}
	.mobile-search,
	.mobile-contents,
	.mobile-topics {
		display: none;
	}
	:global(.dark) .help-article-page {
		color: var(--color-stone-200);
	}
	:global(.dark) .article-lead,
	:global(.dark) .guide-description,
	:global(.dark) .topic-navigation nav a,
	:global(.dark) .section-navigation a,
	:global(.dark) .help-breadcrumb nav span {
		color: var(--color-stone-400);
	}
	:global(.dark) .eyebrow,
	:global(.dark) .help-breadcrumb a,
	:global(.dark) .article-prose :global(a),
	:global(.dark) .article-prose :global(li::marker),
	:global(.dark) .article-footer a,
	:global(.dark) .guide-card,
	:global(.dark) .topic-navigation a[aria-current] {
		color: var(--color-accent-300);
	}
	@media (max-width: 1250px) {
		.article-layout {
			grid-template-columns: 12rem minmax(0, 1fr);
			gap: 2.5rem;
		}
		.section-navigation {
			display: none;
		}
		.mobile-contents {
			display: block;
			margin: 2rem 0;
			padding: 0.85rem 1rem;
			border: 1px solid var(--line);
			border-radius: 0.5rem;
			font-size: 0.85rem;
		}
		.mobile-contents summary {
			cursor: pointer;
			font-weight: 600;
		}
		.mobile-contents nav {
			display: grid;
			gap: 0.7rem;
			margin-top: 1rem;
		}
		.mobile-contents a {
			color: var(--color-accent-700);
		}
	}
	@media (max-width: 800px) {
		.help-article-page {
			padding: 0 1rem 3rem;
		}
		.article-layout {
			display: block;
			padding-top: 2rem;
		}
		.topic-navigation {
			display: none;
		}
		.mobile-search {
			display: block;
			margin-bottom: 2rem;
		}
		.back-reader {
			display: none;
		}
		.article-section {
			margin-top: 2rem;
		}
		.article-section + .article-section {
			padding-top: 2rem;
		}
		.article-lead {
			font-size: 1rem;
		}
		.mobile-topics {
			display: block;
			margin-top: 2rem;
			border: 1px solid var(--line);
			border-radius: 0.5rem;
			padding: 1rem;
			font-size: 0.85rem;
		}
		.mobile-topics summary {
			cursor: pointer;
			font-weight: 650;
		}
		.mobile-topics nav {
			display: grid;
			gap: 1rem;
			margin-top: 1rem;
		}
		.article-prose :global(.instruction-grid),
		.article-prose :global(.account-grid),
		.article-prose :global(.example-grid) {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 500px) {
		.article-prose :global(.definition-list > div) {
			grid-template-columns: 1fr;
			gap: 0.35rem;
		}
		.article-prose {
			font-size: 0.925rem;
		}
		h2 {
			font-size: 1.3rem;
		}
	}
</style>
