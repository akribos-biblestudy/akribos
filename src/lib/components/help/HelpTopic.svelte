<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import TutorialVideo from '$lib/components/TutorialVideo.svelte';
	import HelpSearch from './HelpSearch.svelte';
	import HelpScreenshot from './HelpScreenshot.svelte';
	import { helpAnchor, helpHref } from '$lib/help/links';
	import type { HelpArticle, HelpSection } from '$lib/help/types';

	let {
		topic,
		guides,
		topics,
		legacyGuideId
	}: {
		topic: HelpArticle;
		guides: HelpArticle[];
		topics: Pick<HelpArticle, 'id' | 'path' | 'title' | 'audience'>[];
		legacyGuideId: string | null;
	} = $props();

	const legacyGuide = $derived(guides.find(({ id }) => id === legacyGuideId));
	const legacyAnchors = $derived(new Set(legacyGuide?.sections.map(({ id }) => id)));
	const hasContents = $derived(guides.length > 0 || topic.sections.length > 1);

	afterNavigate(({ to }) => {
		if (!legacyGuide) return;
		const section = legacyGuide.sections.find(({ id }) => to?.url.hash === `#${id}`);
		void goto(helpHref(legacyGuide, section?.id), { replaceState: true });
	});
</script>

<svelte:head>
	<title>{topic.title} | Akribos-Hilfe</title>
	<meta name="description" content={topic.description} />
	<link rel="canonical" href={topic.path} />
</svelte:head>

{#snippet contentsLinks()}
	{#each guides as guide (guide.id)}
		{#if guides.length === 1}
			{#each guide.sections as section (section.id)}
				{#if section.title}<a href={`#${helpAnchor(guide, section.id)}`}>{section.title}</a>{/if}
			{/each}
		{:else}
			<a href={`#${helpAnchor(guide)}`}>{guide.title}</a>
		{/if}
	{/each}
	{#each topic.sections as section (section.id)}
		{#if section.title}<a href={`#${section.id}`}>{section.title}</a>{/if}
	{/each}
{/snippet}

{#snippet aliasesFor(anchor: string)}
	{#each Object.entries(topic.anchors ?? {}) as [from, to] (from)}
		{#if to === anchor && !legacyAnchors.has(from)}<span
				id={from}
				class="anchor-alias"
				aria-hidden="true"
			></span>{/if}
	{/each}
{/snippet}

{#snippet sectionBody(article: HelpArticle, section: HelpSection)}
	{@const inGuide = article.level === 'guide'}
	{@const anchor = helpAnchor(article, section.id)}
	{@const headingId = `${anchor}-heading`}
	<section
		id={!inGuide && legacyAnchors.has(anchor) ? undefined : anchor}
		class="article-section"
		aria-labelledby={section.title ? headingId : undefined}
	>
		{@render aliasesFor(anchor)}
		{#if inGuide && article.id === legacyGuideId}<span
				id={section.id}
				class="anchor-alias"
				aria-hidden="true"
			></span>{/if}
		{#if section.title}<svelte:element this={inGuide ? 'h3' : 'h2'} id={headingId}
				>{section.title}</svelte:element
			>{/if}
		{#if section.episode}<div class="help-video">
				<TutorialVideo episode={section.episode} />
			</div>{/if}
		<!-- Editorial HTML is authored only in the repository help catalog. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="article-prose">{@html section.html}</div>
		{#if section.screenshot}<HelpScreenshot {...section.screenshot} />{/if}
	</section>
{/snippet}

<main class="help-article-page">
	<div class="help-breadcrumb">
		<nav aria-label="Brotkrumennavigation">
			<a href="/help">Hilfe</a><Icon name="chevron-right" class="size-3.5" /><span
				aria-current="page">{topic.title}</span
			>
		</nav>
		<a class="back-reader" href="/Joh1"><Icon name="book-open" class="size-4" /> Bibel lesen</a>
	</div>
	<div class="article-layout">
		<aside class="topic-navigation">
			<div class="sticky-navigation">
				<HelpSearch compact />
				<nav aria-label="Hilfethemen">
					<p class="nav-heading">Themen</p>
					{#each topics.filter((item) => item.audience === 'user') as item (item.id)}
						<a href={item.path} aria-current={topic.id === item.id ? 'page' : undefined}
							>{item.title}</a
						>
					{/each}
					<p class="nav-heading specialist-heading">Weitere Bereiche</p>
					{#each topics.filter((item) => item.audience !== 'user') as item (item.id)}
						<a href={item.path} aria-current={topic.id === item.id ? 'page' : undefined}
							>{item.title}</a
						>
					{/each}
				</nav>
			</div>
		</aside>
		<article class="article-content">
			<div class="mobile-search"><HelpSearch /></div>
			<header class="article-header">
				<h1>{topic.title}</h1>
				<p class="article-lead">{topic.description}</p>
				{#if topic.prerequisite}<p class="prerequisite">
						<Icon name="info" class="size-5" /><span>{topic.prerequisite}</span>
					</p>{/if}
				{#if topic.episode}<div class="help-video">
						<TutorialVideo episode={topic.episode} />
					</div>{/if}
			</header>
			{#if hasContents}
				<details class="mobile-contents">
					<summary>Auf dieser Seite</summary>
					<nav aria-label="Auf dieser Seite">{@render contentsLinks()}</nav>
				</details>
			{/if}
			{#if guides.length}<span id="anleitungen" class="anchor-alias" aria-hidden="true"></span>{/if}
			{#each guides as guide (guide.id)}
				{@const anchor = helpAnchor(guide)}
				<section id={anchor} class="guide" aria-labelledby={`${anchor}-heading`}>
					{@render aliasesFor(anchor)}
					<header>
						<h2 id={`${anchor}-heading`}>{guide.title}</h2>
						<p class="guide-intro">{guide.description}</p>
						{#if guide.episode}<div class="help-video">
								<TutorialVideo episode={guide.episode} />
							</div>{/if}
						{#if guide.prerequisite}<p class="prerequisite">
								<Icon name="info" class="size-5" /><span>{guide.prerequisite}</span>
							</p>{/if}
					</header>
					{#each guide.sections as section (section.id)}{@render sectionBody(guide, section)}{/each}
				</section>
			{/each}
			{#each topic.sections as section (section.id)}{@render sectionBody(topic, section)}{/each}
			<footer class="article-footer">
				<a href="/help"><Icon name="chevron-left" class="size-4" />Alle Themen</a>
			</footer>
			<details class="mobile-topics">
				<summary>Weitere Hilfethemen</summary>
				<nav aria-label="Weitere Hilfethemen">
					{#each topics.filter((item) => item.id !== topic.id) as item (item.id)}<a href={item.path}
							>{item.title}</a
						>{/each}
				</nav>
			</details>
		</article>
		{#if hasContents}
			<aside class="section-navigation">
				<nav aria-label="Auf dieser Seite">
					<p class="nav-heading">Auf dieser Seite</p>
					{@render contentsLinks()}
				</nav>
			</aside>
		{/if}
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
	.article-content {
		min-width: 0;
		max-width: 54rem;
		margin-inline: auto;
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
	.guide,
	.anchor-alias {
		scroll-margin-top: 6rem;
	}
	.guide {
		border-top: 1px solid var(--line);
		margin-top: 3rem;
		padding-top: 2rem;
	}
	.guide-intro {
		margin: -0.5rem 0 0;
		color: var(--color-stone-600);
		line-height: 1.65;
	}
	:global(.dark) .guide-intro {
		color: var(--color-stone-400);
	}
	h3 {
		margin: 0 0 1rem;
		font-size: 1.16rem;
		font-weight: 650;
		line-height: 1.4;
	}
	.help-video {
		max-width: 46rem;
		margin: 1.2rem 0 0;
	}
	.article-section .help-video {
		margin-bottom: 1.2rem;
	}
	.anchor-alias {
		display: block;
	}
	:target > h2,
	:target > h3 {
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-decoration-color: var(--color-accent-500);
		text-underline-offset: 0.23em;
	}
	.article-prose {
		font-size: 1rem;
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
	.article-prose :global(h3),
	.article-prose :global(h4) {
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
	.article-footer a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--color-accent-700);
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
	:global(.dark) .topic-navigation nav a,
	:global(.dark) .section-navigation a,
	:global(.dark) .help-breadcrumb nav span {
		color: var(--color-stone-400);
	}
	:global(.dark) .help-breadcrumb a,
	:global(.dark) .article-prose :global(a),
	:global(.dark) .article-prose :global(li::marker),
	:global(.dark) .article-footer a,
	:global(.dark) .mobile-contents a,
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
		h2 {
			font-size: 1.3rem;
		}
	}
</style>
