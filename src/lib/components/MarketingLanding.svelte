<script lang="ts">
	import './marketing-landing.css';
	import { page } from '$app/state';
	import { skipGuestTourOnDevice } from '$lib/tour/tour-state.svelte';
	import Icon from './Icon.svelte';
	import TutorialVideo from './TutorialVideo.svelte';
	import HelpScreenshot from './help/HelpScreenshot.svelte';

	const description =
		'Vergleiche Bibelübersetzungen, schlage Wörter im Urtext nach und halte Gedanken direkt am Vers fest. Kostenlos im Browser und als App.';
	const canonicalUrl = $derived(new URL('/', page.url).href);
	const previewImage = $derived(new URL('/landing/akribos-vorschau.jpg', page.url).href);

	const studyFeatures = [
		{
			icon: 'search',
			title: 'Ein Wort im Urtext nachschlagen',
			description:
				'Was bedeutet „geliebt“ in Johannes 3,16? Schau im griechischen oder hebräischen Lexikon nach, vergleiche Übersetzungsformen und lies weitere Fundstellen im Zusammenhang.',
			href: '/help/strong',
			link: 'Wortstudien entdecken',
			image: '/help/live/strong-study.webp',
			alt: 'Wortstudie im Lexikon-Tab neben dem Bibeltext im Akribos-Reader',
			caption: 'Wortstudie zu „geliebt“ in Johannes 3,16'
		},
		{
			icon: 'pencil',
			title: 'Gedanken direkt am Vers festhalten',
			description:
				'Verknüpfe Notizen mit Bibelstellen. Sammle Verse zu einem Thema und nutze deine Beobachtungen für eine Ausarbeitung, den Hauskreis oder die Predigt.',
			href: '/help/dokumente',
			link: 'Notizen und Ausarbeitungen entdecken',
			image: '/help/live/notes-editor.webp',
			alt: 'Geöffnete Beispielnotiz im Editor neben dem Bibeltext',
			caption: 'Eine eigene Notiz neben dem Bibeltext'
		}
	] as const;

	function startReading(event: MouseEvent): void {
		if (!page.data.user && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey)
			skipGuestTourOnDevice();
	}
</script>

<svelte:head>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="de_DE" />
	<meta property="og:site_name" content="Akribos" />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:title" content="Akribos – Die Bibel lesen und tiefer verstehen" />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={previewImage} />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="Akribos. Die Bibel lesen. Tiefe entdecken. Der Bibel-Reader mit einer Wortstudie zu Johannes 3,16."
	/>
</svelte:head>

{#snippet readBibleLink()}
	<a
		class="landing-button primary"
		href="/Joh1"
		data-sveltekit-preload-data="off"
		onclick={startReading}
	>
		<Icon name="book-open" class="size-5" />
		Jetzt Bibel lesen
	</a>
{/snippet}

<div class="landing">
	<a class="skip-link" href="#inhalt">Zum Inhalt</a>

	<div class="hero-band">
		<header class="landing-header page-width">
			<a class="brand" href="/" aria-label="Akribos – Startseite">
				<img
					src="/logo-140.png"
					srcset="/logo-140.png 1x, /logo-280.png 2x, /logo-420.png 3x"
					width="140"
					height="40"
					alt="Akribos"
				/>
			</a>
			<nav aria-label="Hauptnavigation">
				<a class="overview-link" href="#entdecken">Funktionen</a>
				<a href="/help">Hilfe</a>
				<a class="header-action" href={page.data.user ? '/account' : '/login'}>
					{page.data.user ? 'Mein Konto' : 'Anmelden'}
				</a>
			</nav>
		</header>

		<main id="inhalt">
			<section class="hero page-width" aria-labelledby="hero-heading">
				<div class="hero-copy">
					<p class="landing-label">Bibelstudium</p>
					<h1 id="hero-heading">Die Bibel lesen.<br /><em>Tiefe entdecken.</em></h1>
					<p class="hero-description">
						Vergleiche Übersetzungen, erforsche den Urtext und halte deine Gedanken direkt an der
						Bibelstelle fest. Für dein persönliches Studium, den Hauskreis oder die Predigt.
					</p>
					<div class="hero-actions">
						{@render readBibleLink()}
						<span class="entry-note">Kostenlos · ohne Anmeldung</span>
					</div>
					<nav class="store-links" aria-label="Akribos-App herunterladen">
						<a href="https://apps.apple.com/de/app/akribos/id6827126169">
							<img
								src="/landing/app-store-de.svg"
								alt="Akribos für iPhone und iPad im App Store laden"
								width="120"
								height="40"
							/>
						</a>
						<a href="https://play.google.com/store/apps/details?id=de.akribos.app&hl=de">
							<img
								src="/landing/google-play-de.png"
								alt="Akribos für Android bei Google Play laden"
								width="137"
								height="53"
							/>
						</a>
					</nav>
				</div>

				<div class="intro" id="intro">
					<div class="intro-frame">
						<TutorialVideo episode={1} eager />
					</div>
					<div class="intro-caption">
						<strong>Akribos kennenlernen</strong>
						<span>Einführungsvideo</span>
					</div>
				</div>
			</section>

			<section class="features-band" id="entdecken" aria-labelledby="features-heading">
				<div class="page-width">
					<div class="features-heading">
						<h2 id="features-heading">Von der Bibelstelle<br />zur eigenen Entdeckung.</h2>
						<p>
							Beginne mit einem Vers und geh der Frage nach, die sich beim Lesen ergibt. Der
							Bibeltext bleibt dabei neben deinen Quellen und Notizen geöffnet.
						</p>
					</div>

					<div class="workspace-feature">
						<div class="workspace-copy">
							<span class="feature-icon"><Icon name="book-open" class="size-6" /></span>
							<h3>Mehrere Quellen nebeneinander lesen</h3>
							<p>
								Lege Bibelübersetzungen, Kommentare und Parallelstellen nebeneinander. Wenn du die
								Tabs verknüpfst, folgen sie derselben Lesestelle.
							</p>
							<a class="feature-link" href="/help/reader#arbeitsbereich-einrichten">
								Arbeitsbereich einrichten
							</a>
						</div>
						<HelpScreenshot
							src="/help/live/workspace-overview.webp"
							alt="Akribos-Arbeitsbereich mit Bibeltext, Kommentar und Lexikon zu Johannes 1"
							caption="Bibeltext, Kommentar und Lexikon im selben Arbeitsbereich"
							width={1440}
							height={1000}
						/>
					</div>

					<div class="feature-grid">
						{#each studyFeatures as feature (feature.href)}
							<article>
								<div class="feature-copy">
									<span class="feature-icon"><Icon name={feature.icon} class="size-6" /></span>
									<h3>{feature.title}</h3>
									<p>{feature.description}</p>
									<a class="feature-link" href={feature.href}>{feature.link}</a>
								</div>
								<HelpScreenshot
									src={feature.image}
									alt={feature.alt}
									caption={feature.caption}
									width={1440}
									height={1000}
								/>
							</article>
						{/each}
					</div>
				</div>
			</section>

			<section class="landing-start page-width" aria-labelledby="start-heading">
				<div>
					<h2 id="start-heading">Mit Johannes 1 beginnen.</h2>
					<p>
						Eigene Notizen, Stellensammlungen und Arbeitsbereiche speicherst du mit einem Konto.
					</p>
				</div>
				<div class="start-actions">
					{@render readBibleLink()}
					{#if !page.data.user}
						<a class="landing-button secondary" href="/register">Kostenloses Konto anlegen</a>
					{/if}
				</div>
			</section>
		</main>
	</div>

	<footer class="landing-footer page-width">
		<a class="brand" href="/" aria-label="Akribos – Startseite">
			<img
				src="/logo-140.png"
				srcset="/logo-140.png 1x, /logo-280.png 2x, /logo-420.png 3x"
				width="140"
				height="40"
				alt="Akribos"
			/>
		</a>
		<nav aria-label="Weiterführende Links">
			<a href="/help">Hilfe</a>
			<a href="/api/docs">API</a>
			<a href="/impressum">Impressum</a>
			<a href="/datenschutz">Datenschutz</a>
		</nav>
	</footer>
</div>
