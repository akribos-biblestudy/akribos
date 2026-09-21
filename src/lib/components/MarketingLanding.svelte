<script lang="ts">
	import './marketing-landing.css';
	import Icon from './Icon.svelte';
	import HelpScreenshot from './help/HelpScreenshot.svelte';
</script>

<svelte:head>
	<meta
		name="description"
		content="Bibel lesen, Übersetzungen vergleichen, Wörter untersuchen und eigene Gedanken ausarbeiten. Entdecke Akribos mit echten Einblicken in Reader, Notizen und Vorbereitung."
	/>
</svelte:head>

<div class="landing">
	<a class="skip-link" href="#inhalt">Zum Inhalt</a>
	<header class="topbar page-width">
		<a class="brand" href="/" aria-label="Akribos – zum Bibelleser">
			<img
				src="/logo-140.png"
				srcset="/logo-140.png 1x, /logo-280.png 2x, /logo-420.png 3x"
				width="140"
				height="40"
				alt="Akribos"
			/>
		</a>
		<nav aria-label="Produkt entdecken">
			<a href="#lesen">Lesen</a>
			<a href="#studieren">Studieren</a>
			<a href="#ausarbeiten">Ausarbeiten</a>
			<a href="/help">Hilfe</a>
		</nav>
		<a class="nav-cta" href="/login">Anmelden <Icon name="arrow-right" class="size-4" /></a>
	</header>

	<main id="inhalt">
		<section class="hero page-width" aria-labelledby="hero-heading">
			<div class="hero-heading">
				<p class="eyebrow">Die Bibel präzise studieren</p>
				<h1 id="hero-heading">Die Bibel lesen. <em>Zusammenhänge verstehen.</em></h1>
			</div>
			<div class="hero-copy">
				<p>
					Vergleiche Übersetzungen, entdecke die Bedeutung biblischer Wörter und halte deine
					Gedanken direkt am Text fest. Akribos begleitet dich beim persönlichen Bibelstudium – und
					bei der Vorbereitung für Hauskreis und Predigt.
				</p>
				<div class="actions">
					<a class="button primary hero-cta" href="/Joh1">
						Bibel öffnen <Icon name="arrow-right" class="size-5" />
					</a>
					<a class="button secondary" href="#lesen">Akribos kennenlernen</a>
				</div>
				<p class="entry-note">Direkt im Browser. Lesen ohne Konto.</p>
			</div>
			<div class="hero-product desktop-product">
				<HelpScreenshot
					src="/help/live/workspace-overview.webp"
					alt="Akribos-Arbeitsbereich mit Bibeltext, Kommentar und Lexikon zu Johannes 1"
					caption="Deine Quellen an einem Ort: Bibeltext, Kommentar und Lexikon im Akribos-Reader."
					width={1440}
					height={1000}
				/>
			</div>
			<div class="hero-product mobile-product">
				<HelpScreenshot
					src="/help/live/reader-mobile.webp"
					alt="Akribos-Reader auf dem Smartphone mit der mobilen Ressourcenleiste"
					caption="Auch unterwegs: Bibel lesen und über die Ressourcenleiste das Werk wechseln."
					width={390}
					height={844}
					portrait
				/>
			</div>
		</section>

		<section class="reading page-width" id="lesen" aria-labelledby="reading-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">01 / Lesen und vergleichen</p>
					<h2 id="reading-heading">Dem Text Raum geben.</h2>
				</div>
				<p>
					Eine Übersetzung zum Lesen, ein Kommentar zum Nachschlagen, eine weitere Perspektive zum
					Vergleichen. Du entscheidest, was nebeneinander steht.
				</p>
			</div>
			<div class="reading-benefits">
				<div>
					<Icon name="book-open" class="size-6" />
					<h3>Quellen zusammen lesen</h3>
					<p>
						Öffne Bibeln, Kommentare und Parallelstellen als Tabs. Verbinde sie zu einer Gruppe,
						damit sie derselben Lesestelle folgen.
					</p>
				</div>
				<div>
					<Icon name="layout" class="size-6" />
					<h3>Deinen Arbeitsbereich gestalten</h3>
					<p>
						Wähle eine Anordnung und passe die Breite der Kacheln an. Mit einem Konto speicherst du
						benannte Arbeitsbereiche für verschiedene Themen.
					</p>
				</div>
				<div>
					<Icon name="undo" class="size-6" />
					<h3>Den Faden wieder aufnehmen</h3>
					<p>
						Wechsle zwischen Stellen und kehre mit dem Verlauf des Tabs zurück. Schriftgröße und
						Darstellung passen sich deinen Lesegewohnheiten an.
					</p>
				</div>
			</div>
			<a class="text-link" href="/help/reader/arbeitsbereich-einrichten">
				Einen Arbeitsbereich einrichten <Icon name="arrow-right" class="size-4" />
			</a>
		</section>

		<section class="study-band" id="studieren" aria-labelledby="study-heading">
			<div class="page-width section-space">
				<div class="section-heading">
					<div>
						<p class="eyebrow">02 / Fragen am Text untersuchen</p>
						<h2 id="study-heading">Ein Wort. Ein genauerer Blick.</h2>
					</div>
					<div class="section-copy">
						<p>
							Welche Bedeutung hat ein Wort? Wo kommt es noch vor? Öffne aus einer Bibel mit
							Strong-Zuordnungen die Wortstudie und lies im passenden Lexikon weiter.
						</p>
						<a class="text-link" href="/help/strong">
							Wortstudien kennenlernen <Icon name="arrow-right" class="size-4" />
						</a>
					</div>
				</div>
				<HelpScreenshot
					src="/help/live/strong-study.webp"
					alt="Wortstudie im Lexikon-Tab neben dem Bibeltext im Akribos-Reader"
					caption="Die Wortstudie zu „geliebt“ in Johannes 3,16: grammatische Angaben und Lexikoneintrag direkt neben dem Bibeltext."
					width={1440}
					height={1000}
				/>
				<div class="study-details">
					<p><strong>Bedeutungen nachlesen</strong> im griechischen oder hebräischen Lexikon.</p>
					<p>
						<strong>Verwendungen vergleichen</strong> anhand der Fundstellen im gewählten Bibelwerk.
					</p>
					<p>
						<strong>Übersetzungsformen entdecken</strong> mit Verteilung nach Wörtern und Bibelbüchern.
					</p>
				</div>
			</div>
		</section>

		<section class="feature-row page-width section-space" aria-labelledby="search-heading">
			<div class="feature-copy">
				<p class="eyebrow">Der nächsten Frage folgen</p>
				<h2 id="search-heading">Finden. Im Zusammenhang lesen.</h2>
				<p>
					Suche direkt in einem geöffneten Werk nach Wörtern, Wortfolgen oder Strong-Nummern. Grenze
					Treffer nach Bibelbuch ein und öffne die Fundstelle im selben Tab.
				</p>
				<a class="text-link" href="/help/suchen">
					Die Suche kennenlernen <Icon name="arrow-right" class="size-4" />
				</a>
			</div>
			<HelpScreenshot
				src="/help/live/reader-search.webp"
				alt="Suchergebnisse mit Buchverteilung im Akribos-Reader"
				caption="Die Suche gehört zum geöffneten Werk. Ein Treffer führt zurück in seinen Textzusammenhang."
				width={1440}
				height={1000}
			/>
		</section>

		<section class="notes-band" id="ausarbeiten" aria-labelledby="notes-heading">
			<div class="page-width section-space">
				<div class="section-heading">
					<div>
						<p class="eyebrow">03 / Gedanken festhalten</p>
						<h2 id="notes-heading">Die eigene Beobachtung beginnt beim Lesen.</h2>
					</div>
					<div class="section-copy">
						<p>
							Öffne deine Notizen neben dem Bibeltext. Halte Fragen fest, füge Bibelzitate ein und
							verbinde Gedanken mit den Stellen, auf die sie sich beziehen.
						</p>
						<a class="text-link" href="/help/dokumente">
							Notizen und Editor entdecken <Icon name="arrow-right" class="size-4" />
						</a>
					</div>
				</div>
				<HelpScreenshot
					src="/help/live/notes-editor.webp"
					alt="Geöffnete Beispielnotiz im Editor neben dem Bibeltext"
					caption="Lesen und Schreiben bleiben verbunden: eine eigene Notiz direkt im Reader bearbeiten."
					width={1440}
					height={1000}
				/>
				<p class="section-footnote">
					Mit deinem Konto sammelst du Notizen in einer Bibliothek, ordnest sie mit Tags und findest
					sie über Text und Bibelstellen wieder.
				</p>
			</div>
		</section>

		<section class="page-width section-space" aria-labelledby="preparation-heading">
			<div class="section-heading">
				<div>
					<p class="eyebrow">04 / Gemeinsam am Bibeltext weiterdenken</p>
					<h2 id="preparation-heading">Für deinen Hauskreis. Für deine Predigt.</h2>
				</div>
				<div class="section-copy">
					<p>
						Was du im persönlichen Studium entdeckst, kann andere weiterbringen. Sammle passende
						Bibelstellen, entwickle Fragen und ordne deine Gedanken für den nächsten gemeinsamen
						Blick in den Text.
					</p>
				</div>
			</div>
			<div class="preparation-examples">
				<article aria-labelledby="home-group-heading">
					<p class="eyebrow">Für Hauskreisleiter</p>
					<h3 id="home-group-heading">Einen Gesprächsabend vorbereiten.</h3>
					<p>
						Zum Beispiel „Licht und Leben“ im Johannesevangelium: Sammle die passenden Stellen und
						halte Beobachtungen und Gesprächsfragen in einer Ausarbeitung fest. Eine Stellensammlung
						kannst du über einen Leselink mit der Gruppe teilen.
					</p>
					<HelpScreenshot
						src="/help/live/verse-collection.webp"
						alt="Beispiel einer Stellensammlung mit mehreren Bibelstellen"
						caption="„Licht und Leben“: Bibelstellen für das gemeinsame Gespräch zusammenstellen."
						width={1440}
						height={1000}
					/>
					<a class="text-link" href="/help/listen">
						Stellensammlungen entdecken <Icon name="arrow-right" class="size-4" />
					</a>
				</article>
				<article aria-labelledby="sermon-heading">
					<p class="eyebrow">Für die Predigtvorbereitung</p>
					<h3 id="sermon-heading">Aus Beobachtungen eine Predigt entwickeln.</h3>
					<p>
						Zum Beispiel „Gnade um Gnade“ zu Johannes 1,14–18: Führe Notizen, Gliederung und
						Bibelstellen in deiner Ausarbeitung zusammen. Auf dem Board behältst du den Stand im
						Blick; den fertigen Text exportierst du als Word, PDF oder Markdown.
					</p>
					<HelpScreenshot
						src="/help/live/sermon-board.webp"
						alt="Board mit Beispielausarbeitungen in verschiedenen Vorbereitungsschritten"
						caption="„Gnade um Gnade“: den Weg von der ersten Idee zur fertigen Ausarbeitung überblicken."
						width={1440}
						height={1000}
					/>
					<a class="text-link" href="/help/predigten">
						Die Vorbereitung kennenlernen <Icon name="arrow-right" class="size-4" />
					</a>
				</article>
			</div>
		</section>

		<section class="mobile-section page-width section-space" aria-labelledby="mobile-heading">
			<div class="mobile-copy">
				<p class="eyebrow">05 / Auf deinem Gerät weiterlesen</p>
				<h2 id="mobile-heading">Dein Studium hat mehr als einen Platz.</h2>
				<p>
					Am Schreibtisch Quellen nebeneinander vergleichen, unterwegs einen Abschnitt lesen:
					Akribos läuft im Browser auf Computer, Tablet und Smartphone.
				</p>
				<p>
					Auf dem Smartphone wechselst du über eine gemeinsame Ressourcenleiste zwischen deinen
					Tabs. Deine Notizen und gespeicherten Arbeitsbereiche erreichst du mit deinem Konto auch
					auf anderen Geräten.
				</p>
				<a class="text-link" href="/help/mobil">
					Die mobile Bedienung kennenlernen <Icon name="arrow-right" class="size-4" />
				</a>
			</div>
			<div class="mobile-example">
				<HelpScreenshot
					src="/help/live/reader-mobile.webp"
					alt="Mobile Leseansicht von Akribos auf einem Smartphone"
					caption="Eine klare Leseansicht und alle geöffneten Werke über die Tab-Leiste erreichbar."
					width={390}
					height={844}
					portrait
				/>
			</div>
		</section>

		<section class="getting-started" aria-labelledby="start-heading">
			<div class="page-width">
				<p class="eyebrow">Mit einer Bibelstelle anfangen</p>
				<h2 id="start-heading">Öffne den Text.<br />Geh deiner Frage nach.</h2>
				<p>
					Bibel lesen, suchen und Wörter untersuchen geht ohne Konto. Für eigene Notizen,
					Ausarbeitungen, Sammlungen und gespeicherte Arbeitsbereiche kannst du dich kostenlos
					anmelden.
				</p>
				<div class="actions">
					<a class="button primary" href="/Joh1">
						Jetzt Bibel lesen <Icon name="arrow-right" class="size-5" />
					</a>
					<a class="button secondary" href="/register">Kostenloses Konto anlegen</a>
				</div>
			</div>
		</section>

		<aside class="api-note page-width" aria-label="Akribos für eigene Projekte">
			<Icon name="code" class="size-6" />
			<p><strong>Du entwickelst eigene Werkzeuge?</strong> Entdecke die Akribos-API.</p>
			<a class="text-link" href="/api/docs">Zur API <Icon name="arrow-right" class="size-4" /></a>
		</aside>
	</main>

	<footer class="page-width">
		<div>
			<a class="footer-brand" href="/">Akribos</a>
			<p>Sorgfältig lesen. Gründlich verstehen.</p>
		</div>
		<nav aria-label="Weiterführende Links">
			<a href="/help">Hilfe</a>
			<a href="/api/docs">API</a>
			<a href="/impressum">Impressum</a>
			<a href="/datenschutz">Datenschutz</a>
		</nav>
	</footer>
</div>
